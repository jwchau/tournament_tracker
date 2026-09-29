from sqlmodel import select

from app.bracket_refs import backfill_bracket_refs, choose_ref
from app.models import Match, PlayoffBracket, Team, Tournament
from tests.test_court_dispatch_api import _bracket, _complete, _get


class _Playoffs:
    """A hand-built two-bracket playoff, to pin down who is picked to ref.

    Bracket 1 owns court 1 and bracket 2 court 2. The match needing a ref is
    A vs B on court 1; C vs D is next in bracket 1's queue; E lost to F, then
    G lost to H (later); F and H wait for their next match; in bracket 2, J
    lost to I; Z didn't make the playoffs.
    """

    def __init__(self, session):
        self.session = session
        tournament = Tournament(name="Ref Cup", court_count=2)
        session.add(tournament)
        session.flush()
        self.tournament_id = tournament.id
        self.team = {}
        for name in "ABCDEFGHIJZ":
            team = Team(tournament_id=tournament.id, name=name)
            session.add(team)
            session.flush()
            self.team[name] = team.id
        self.brackets = []
        for tier in (1, 2):
            bracket = PlayoffBracket(tournament_id=tournament.id, tier=tier, format="single")
            session.add(bracket)
            session.flush()
            self.brackets.append(bracket.id)
        one, two = self.brackets
        self._match(one, "E", "F", status="complete", winner="F", court=1, ready_order=1)
        self._match(one, "G", "H", status="complete", winner="H", court=1, ready_order=2)
        self._match(two, "I", "J", status="complete", winner="I", court=2, ready_order=3)
        self.target = self._match(one, "A", "B", status="ready", court=1, ready_order=4)
        self._match(one, "C", "D", status="ready", ready_order=5)
        self._match(one, "F", "H", status="pending")
        session.commit()

    def _match(self, bracket_id, team1, team2, winner=None, **fields):
        match = Match(
            tournament_id=self.tournament_id,
            playoff_bracket_id=bracket_id,
            round=1,
            position=fields.pop("ready_order", None) or 9,
            team1_id=self.team[team1],
            team2_id=self.team[team2],
            winner_id=self.team[winner] if winner else None,
            **fields,
        )
        match.ready_order = match.position if match.position != 9 else None
        self.session.add(match)
        self.session.flush()
        return match

    def pick(self, *unavailable):
        ref = choose_ref(
            self.session,
            self.tournament_id,
            self.target,
            {self.team[name] for name in unavailable},
        )
        return next((name for name, id_ in self.team.items() if id_ == ref), None)


def test_each_step_of_the_order_wins_over_the_ones_below_it(session):
    playoffs = _Playoffs(session)

    # 1. The team playing next on the same court (C before D on id).
    assert playoffs.pick() == "C"
    # 2. The same bracket's knocked-out teams, most recently out first.
    assert playoffs.pick("C", "D") == "G"
    assert playoffs.pick("C", "D", "G") == "E"
    # 3. The same bracket's teams waiting for their next match.
    assert playoffs.pick("C", "D", "G", "E") == "F"
    # 4. Another bracket's knocked-out teams (I won, so it isn't out).
    assert playoffs.pick("C", "D", "G", "E", "F", "H") == "J"
    # 5. Teams that didn't make the playoffs.
    assert playoffs.pick("C", "D", "G", "E", "F", "H", "J") == "Z"
    # 6. Nobody.
    assert playoffs.pick("C", "D", "G", "E", "F", "H", "J", "Z") is None


def test_a_tie_goes_to_the_team_with_the_fewest_refs_so_far_pool_refs_included(session):
    playoffs = _Playoffs(session)
    pool_match = Match(
        tournament_id=playoffs.tournament_id, bracket="pool", round=1, position=1,
        status="complete", ref_team_id=playoffs.team["C"],
    )
    session.add(pool_match)
    session.commit()

    assert playoffs.pick() == "D"


def _ref(client, match_id):
    return _get(client, match_id)["ref_team_id"]


def _teams(match):
    return {match["team1_id"], match["team2_id"]}


def _on_court_teams(client, ids):
    return {
        team
        for match_id in ids.values()
        if (m := _get(client, match_id))["court"] is not None and m["status"] != "complete"
        for team in _teams(m)
    }


def test_a_match_gets_a_ref_from_the_team_due_next_on_its_court_when_dispatched(client):
    ids = _bracket(client, 8, court_count=2)
    first, second, third = (_get(client, ids[("winners", 1, p)]) for p in (1, 2, 3))

    refs = {first["ref_team_id"], second["ref_team_id"]}

    # Round 1's third match is next in line, so its two teams ref, one court each.
    assert refs == _teams(third)
    assert first["ref_set_at"] is None and first["ref_court"] == 1


def test_no_free_team_means_no_ref(client):
    ids = _bracket(client, 4, court_count=2)

    assert _ref(client, ids[("winners", 1, 1)]) is None
    assert _ref(client, ids[("winners", 1, 2)]) is None


def test_the_latest_team_knocked_out_refs_the_next_match(client):
    ids = _bracket(client, 4, court_count=2)
    _complete(client, ids[("winners", 1, 1)])
    second = _complete(client, ids[("winners", 1, 2)])

    final = _get(client, ids[("winners", 2, 1)])

    assert final["court"] is not None
    assert final["ref_team_id"] == second["team2_id"]


def test_a_ref_called_to_play_is_replaced_and_a_finished_match_keeps_its_ref(client):
    ids = _bracket(client, 8, court_count=2)
    first = ids[("winners", 1, 1)]
    ref = _ref(client, first)
    third = _get(client, ids[("winners", 1, 3)])
    assert ref in _teams(third)

    # Match 3 takes court 2, so its team stops reffing court 1.
    _complete(client, ids[("winners", 1, 2)])

    new_ref = _ref(client, first)
    assert new_ref is not None and new_ref != ref
    assert new_ref not in _on_court_teams(client, ids)
    finished = _get(client, ids[("winners", 1, 2)])
    assert finished["ref_team_id"] is not None


def test_a_hand_set_ref_called_to_play_is_not_replaced(client):
    ids = _bracket(client, 8, court_count=2)
    first = _get(client, ids[("winners", 1, 1)])
    ref = _ref(client, first["id"])
    client.patch(
        f"/matches/{first['id']}/ref", json={"ref_team_id": ref, "version": first["version"]}
    )

    _complete(client, ids[("winners", 1, 2)])

    assert _ref(client, first["id"]) == ref


def test_setting_a_court_by_hand_chooses_a_ref(client):
    ids = _bracket(client, 8, court_count=2)
    first, fourth = ids[("winners", 1, 1)], ids[("winners", 1, 4)]

    # Match 1 hasn't started, so it goes back to the queue and loses its ref.
    client.patch(f"/matches/{fourth}/schedule", json={"court": 1})

    moved = _get(client, fourth)
    assert moved["court"] == 1
    assert moved["ref_team_id"] is not None
    assert moved["ref_team_id"] not in _on_court_teams(client, ids)
    assert _get(client, first)["court"] is None
    assert _ref(client, first) is None


def test_ref_options_are_the_teams_not_on_a_court_and_the_ref_endpoint_enforces_them(client):
    ids = _bracket(client, 8, court_count=2)
    first = _get(client, ids[("winners", 1, 1)])
    second = _get(client, ids[("winners", 1, 2)])
    waiting = _get(client, ids[("winners", 1, 4)])

    options = client.get(f"/matches/{first['id']}/ref-options").json()

    assert {team["id"] for team in options}.isdisjoint(_teams(first) | _teams(second))
    assert len(options) == 4
    for busy in (first["team1_id"], second["team2_id"]):
        response = client.patch(
            f"/matches/{first['id']}/ref", json={"ref_team_id": busy, "version": first["version"]}
        )
        assert response.status_code == 400
    by_hand = client.patch(
        f"/matches/{first['id']}/ref",
        json={"ref_team_id": waiting["team1_id"], "version": first["version"]},
    ).json()
    assert by_hand["ref_team_id"] == waiting["team1_id"] and by_hand["ref_set_at"] is not None

    back = client.patch(
        f"/matches/{first['id']}/ref", json={"automatic": True, "version": by_hand["version"]}
    ).json()
    assert back["ref_set_at"] is None
    assert back["ref_team_id"] is not None and back["ref_court"] == 1


def test_bracket_refs_stay_editable_after_the_match(client):
    ids = _bracket(client, 8, court_count=2)
    finished = _complete(client, ids[("winners", 1, 1)])
    waiting = _get(client, ids[("winners", 1, 4)])

    response = client.patch(
        f"/matches/{finished['id']}/ref",
        json={"ref_team_id": waiting["team1_id"], "version": finished["version"]},
    )

    assert response.status_code == 200
    assert response.json()["ref_team_id"] == waiting["team1_id"]


def test_backfill_gives_only_on_court_matches_a_ref(client, session):
    ids = _bracket(client, 8, court_count=2)
    _complete(client, ids[("winners", 1, 2)])
    on_court = session.get(Match, ids[("winners", 1, 1)])
    finished = session.get(Match, ids[("winners", 1, 2)])
    # As if these were played before refs were stored.
    for match in (on_court, finished):
        match.ref_team_id = None
        match.ref_court = None
        session.add(match)
    session.commit()

    backfill_bracket_refs(session)
    session.commit()

    assert session.get(Match, on_court.id).ref_team_id is not None
    assert session.get(Match, finished.id).ref_team_id is None
    playing = {
        team
        for m in session.exec(select(Match).where(Match.court.is_not(None))).all()
        if m.status != "complete"
        for team in (m.team1_id, m.team2_id)
    }
    assert session.get(Match, on_court.id).ref_team_id not in playing

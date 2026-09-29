from tests.helpers import create_tournament
from tests.test_court_dispatch_api import _bracket as _one_bracket
from tests.test_court_dispatch_api import _complete, _court, _get
from tests.test_playoff_advancement_api import _advance, _bracket_teams, _play, _setup
from tests.test_pools_api import _pool_matches


def _tournament(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}").json()


def _patch(client, tournament_id, **changes):
    return client.patch(f"/tournaments/{tournament_id}", json=changes)


def _preview(client, tournament_id, **changes):
    return client.post(f"/tournaments/{tournament_id}/settings/preview", json=changes)


def _score_one_pool_match(client, pool_id):
    match = _pool_matches(client, pool_id)[0]
    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"], "complete": False},
    )


def test_teams_and_pools_need_no_confirmation(client):
    tournament_id = create_tournament(client)["id"]

    team = client.post(f"/tournaments/{tournament_id}/teams", json={"name": "Aces"})
    pool = client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Pool A"})

    assert team.status_code == 201
    assert pool.status_code == 201
    assert "settings_confirmed" not in _tournament(client, tournament_id)


def test_a_new_tournament_has_automatic_advancing_and_no_date_or_venue(client):
    tournament = _tournament(client, create_tournament(client)["id"])

    assert tournament["advance_per_pool"] is None
    assert tournament["date"] is None
    assert tournament["venue"] is None
    assert tournament["setting_locks"] == {}


def test_advance_per_pool_can_be_set_and_put_back_to_automatic(client):
    tournament_id = create_tournament(client)["id"]

    assert _patch(client, tournament_id, advance_per_pool=2).json()["advance_per_pool"] == 2
    assert _patch(client, tournament_id, advance_per_pool=None).json()["advance_per_pool"] is None
    assert _patch(client, tournament_id, advance_per_pool=0).status_code == 422


def test_date_and_venue_can_change_and_be_cleared_even_after_play_starts(client):
    tournament_id, [pool], _ = _setup(client, [3], advance_per_pool=1, playoff_bracket_count=1)
    _score_one_pool_match(client, pool["id"])

    saved = _patch(client, tournament_id, date="2026-10-04", venue="Riverside courts")
    cleared = _patch(client, tournament_id, date=None, venue=None)

    assert saved.status_code == 200
    assert (saved.json()["date"], saved.json()["venue"]) == ("2026-10-04", "Riverside courts")
    assert (cleared.json()["date"], cleared.json()["venue"]) == (None, None)
    assert _patch(client, tournament_id, date="not a date").status_code == 422


def test_automatic_advancing_splits_a_pool_evenly_and_the_extras_go_to_later_brackets(client):
    tournament_id, [pool], [teams] = _setup(
        client, [7], advance_per_pool=None, playoff_bracket_count=2
    )
    _play(client, pool["id"])

    _advance(client, tournament_id)

    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert [_bracket_teams(client, bracket["id"]) for bracket in brackets] == [
        set(teams[:3]),
        set(teams[3:]),
    ]


def test_automatic_advancing_over_three_brackets_gives_the_later_ones_the_extra_teams(client):
    tournament_id, [pool], [teams] = _setup(
        client, [8], advance_per_pool=None, playoff_bracket_count=3
    )
    _play(client, pool["id"])

    _advance(client, tournament_id)

    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert [len(_bracket_teams(client, bracket["id"])) for bracket in brackets] == [2, 3, 3]


def test_after_the_first_pool_score_pool_settings_lock_and_the_rest_stay_open(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _score_one_pool_match(client, pool["id"])

    locks = _tournament(client, tournament_id)["setting_locks"]
    games = _patch(client, tournament_id, games_per_pairing=2)
    size = _patch(client, tournament_id, target_pool_size=6)
    open_ones = _patch(
        client, tournament_id, court_count=3, advance_per_pool=1, playoff_bracket_count=3, playoff_best_of=3
    )

    assert set(locks) == {"games_per_pairing", "target_pool_size"}
    assert games.status_code == 400
    assert games.json()["detail"] == "Games per pairing can't change now: play has started"
    assert size.status_code == 400 and "Pool size can't change now" in size.json()["detail"]
    assert open_ones.status_code == 200
    body = open_ones.json()
    assert (body["court_count"], body["advance_per_pool"], body["playoff_bracket_count"]) == (3, 1, 3)
    assert body["playoff_best_of"] == 3


def test_a_locked_setting_sent_unchanged_alongside_a_new_name_is_fine(client):
    tournament_id, [pool], _ = _setup(client, [3], advance_per_pool=1, playoff_bracket_count=1)
    _score_one_pool_match(client, pool["id"])
    games = _tournament(client, tournament_id)["games_per_pairing"]

    response = _patch(client, tournament_id, name="Renamed", games_per_pairing=games)

    assert response.status_code == 200 and response.json()["name"] == "Renamed"


def test_advance_per_pool_and_the_bracket_count_lock_once_the_brackets_exist(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    _advance(client, tournament_id)

    locks = _tournament(client, tournament_id)["setting_locks"]
    advance = _patch(client, tournament_id, advance_per_pool=1)
    count = _patch(client, tournament_id, playoff_bracket_count=1)
    client.delete(f"/tournaments/{tournament_id}/playoff-brackets")
    reopened = _patch(client, tournament_id, advance_per_pool=1)

    assert {"advance_per_pool", "playoff_bracket_count"} <= set(locks)
    assert advance.status_code == 400 and "reset them first" in advance.json()["detail"]
    assert count.status_code == 400
    assert reopened.status_code == 200


def test_a_court_change_leaves_a_match_being_played_on_its_court(client):
    ids = _one_bracket(client, 8, court_count=2)
    tournament_id = _get(client, ids[("winners", 1, 1)])["tournament_id"]
    first, second, third, fourth = (ids[("winners", 1, position)] for position in range(1, 5))
    match = _get(client, first)
    client.patch(
        f"/matches/{first}/score",
        json={"team1_score": 3, "team2_score": 1, "version": match["version"], "complete": False},
    )

    grown = _patch(client, tournament_id, court_count=4)

    assert grown.status_code == 200
    assert _court(client, first) == 1
    assert sorted(_court(client, match_id) for match_id in (second, third, fourth)) == [2, 3, 4]

    shrunk = _patch(client, tournament_id, court_count=1)

    assert shrunk.status_code == 200
    assert _court(client, first) == 1
    assert [_court(client, match_id) for match_id in (second, third, fourth)] == [None, None, None]

    _complete(client, first)
    assert _court(client, second) == 1


def test_the_preview_is_empty_when_there_is_nothing_yet_to_affect(client):
    tournament_id = create_tournament(client)["id"]

    response = _preview(client, tournament_id, court_count=3, playoff_best_of=3, name="Renamed")

    assert response.status_code == 200
    assert response.json() == {"effects": []}


def test_the_preview_says_how_pool_play_would_fill_the_brackets(client):
    tournament_id, _, _ = _setup(client, [8], advance_per_pool=None, playoff_bracket_count=2)

    effects = _preview(client, tournament_id, playoff_bracket_count=3).json()["effects"]

    assert effects == ["Pool play will send Bracket 1: 2 teams, Bracket 2: 3 teams, Bracket 3: 3 teams."]


def test_the_preview_warns_when_a_bracket_would_be_too_small(client):
    tournament_id, _, _ = _setup(client, [3], advance_per_pool=None, playoff_bracket_count=1)

    effects = _preview(client, tournament_id, playoff_bracket_count=3).json()["effects"]

    assert effects[0] == "Pool play will send Bracket 1: 1 team, Bracket 2: 1 team, Bracket 3: 1 team."
    assert "Bracket 1 would have 1 team; every playoff bracket needs at least 2." in effects


def test_the_preview_ignores_a_value_that_is_not_changing(client):
    tournament_id, _, _ = _setup(client, [8], advance_per_pool=2, playoff_bracket_count=2)

    effects = _preview(client, tournament_id, advance_per_pool=2, playoff_bracket_count=2).json()

    assert effects == {"effects": []}


def test_the_preview_of_a_court_change_covers_pool_schedules_and_waiting_playoff_matches(client):
    tournament_id, [pool], _ = _setup(
        client, [4], advance_per_pool=2, playoff_bracket_count=2, court_count=2
    )

    before = _preview(client, tournament_id, court_count=3).json()["effects"]
    _play(client, pool["id"])
    _advance(client, tournament_id)
    after = _preview(client, tournament_id, court_count=3).json()["effects"]

    assert len(before) == 1 and before[0].startswith("Pool schedules that exist keep the courts")
    assert len(after) == 2
    assert "playoff matches not yet started will be moved to the 3 courts" in after[0]
    assert "A match being played stays on its court." in after[0]
    assert after[1] == before[0]


def test_the_preview_of_a_best_of_change_counts_the_brackets_that_exist(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    _advance(client, tournament_id)

    effects = _preview(client, tournament_id, playoff_best_of=3).json()["effects"]

    assert effects == ["The 2 playoff brackets that exist will be played best of 3."]


def test_the_preview_of_a_pool_schedule_setting_says_the_schedules_stay_as_they_are(client):
    tournament_id, _, _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)

    effects = _preview(client, tournament_id, games_per_pairing=2).json()["effects"]

    assert len(effects) == 1
    assert "keep their current games" in effects[0]


def test_the_preview_is_refused_when_the_setting_has_locked(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _score_one_pool_match(client, pool["id"])

    response = _preview(client, tournament_id, games_per_pairing=3)

    assert response.status_code == 400
    assert response.json()["detail"] == "Games per pairing can't change now: play has started"

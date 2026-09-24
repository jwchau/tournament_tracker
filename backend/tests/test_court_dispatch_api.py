from tests.helpers import create_tournament
from tests.test_playoff_advancement_api import _advance, _play, _setup


def _bracket(client, team_count, court_count, format="single"):
    """A one-bracket tournament on `court_count` courts; returns {(section, round, position): id}."""
    tournament = create_tournament(client, "Dispatch Cup")
    client.patch(f"/tournaments/{tournament['id']}", json={"court_count": court_count})
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": f"Team {seed}", "seed": seed},
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    matches = client.post(
        f"/tournaments/{tournament['id']}/bracket/generate", json={"format": format}
    ).json()
    return {(m["bracket"], m["round"], m["position"]): m["id"] for m in matches}


def _get(client, match_id):
    return client.get(f"/matches/{match_id}").json()


def _court(client, match_id):
    return _get(client, match_id)["court"]


def _complete(client, match_id, team1_score=21, team2_score=10):
    match = _get(client, match_id)
    response = client.patch(
        f"/matches/{match_id}/score",
        json={
            "team1_score": team1_score,
            "team2_score": team2_score,
            "version": match["version"],
            "complete": True,
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()


def _dispatch(client, match_id):
    bracket_id = _get(client, match_id)["playoff_bracket_id"]
    return client.get(f"/playoff-brackets/{bracket_id}/dispatch").json()


def test_ready_matches_go_straight_onto_free_courts(client):
    ids = _bracket(client, 4, court_count=2)

    assert _court(client, ids[("winners", 1, 1)]) == 1
    assert _court(client, ids[("winners", 1, 2)]) == 2
    assert _court(client, ids[("winners", 2, 1)]) is None


def test_matches_queue_in_the_order_they_became_ready_and_take_courts_as_they_free(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    semifinal = ids[("winners", 2, 1)]

    assert _dispatch(client, r1[0]) == {
        "courts": [{"court": 1, "match_id": r1[0]}, {"court": 2, "match_id": r1[1]}],
        "queue": [r1[2], r1[3]],
        "overflow": False,
    }

    _complete(client, r1[1])
    assert _court(client, r1[2]) == 2
    # Semifinal 1 becomes ready here, behind round 1's last match.
    _complete(client, r1[0])
    assert _court(client, r1[3]) == 1
    assert _dispatch(client, r1[0])["queue"] == [semifinal]

    _complete(client, r1[2])
    assert _court(client, semifinal) == 2
    assert _dispatch(client, r1[0]) == {
        "courts": [{"court": 1, "match_id": r1[3]}, {"court": 2, "match_id": semifinal}],
        "queue": [],
        "overflow": False,
    }
    # A finished match remembers where it was played.
    assert _court(client, r1[1]) == 2


def test_each_bracket_dispatches_only_to_its_own_courts(client):
    # Pools on 3 courts: bracket 1 gets courts 1-2, bracket 2 only court 3.
    tournament_id, [pool], _ = _setup(
        client, [8], advance_per_pool=4, playoff_bracket_count=2, court_count=3
    )
    _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id).json()
    first = client.get(f"/playoff-brackets/{tier_one['id']}/matches").json()
    second = client.get(f"/playoff-brackets/{tier_two['id']}/matches").json()
    first_r1 = [m["id"] for m in sorted(first, key=lambda m: m["id"]) if m["round"] == 1]
    second_r1 = [m["id"] for m in sorted(second, key=lambda m: m["id"]) if m["round"] == 1]
    tier_two_before = client.get(f"/playoff-brackets/{tier_two['id']}/dispatch").json()
    assert tier_two_before == {
        "courts": [{"court": 3, "match_id": second_r1[0]}],
        "queue": [second_r1[1]],
        "overflow": False,
    }

    # Bracket 1 frees courts 1 and 2, but bracket 2's waiting match stays put.
    for match_id in first_r1:
        _complete(client, match_id)

    assert client.get(f"/playoff-brackets/{tier_two['id']}/dispatch").json() == tier_two_before
    assert [c["court"] for c in _dispatch(client, first_r1[0])["courts"]] == [1, 2]


def test_a_match_reset_by_a_correction_gives_up_its_court(client):
    ids = _bracket(client, 8, court_count=1)
    for key in sorted(k for k in ids if k[1] < 3):
        _complete(client, ids[key])
    final = ids[("winners", 3, 1)]
    assert _court(client, final) == 1
    semifinal = ids[("winners", 2, 1)]

    first = _get(client, ids[("winners", 1, 1)])
    client.patch(
        f"/matches/{first['id']}/correct",
        json={"team1_score": 10, "team2_score": 21, "version": first["version"]},
    )

    # The final waits on the replayed semifinal again, which takes the court.
    assert (_get(client, final)["status"], _court(client, final)) == ("pending", None)
    assert _court(client, semifinal) == 1


def test_a_grand_final_reset_is_dispatched_and_frees_its_court_when_corrected_away(client):
    ids = _bracket(client, 2, court_count=1, format="double")
    _complete(client, ids[("winners", 1, 1)])
    grand_final = _complete(client, ids[("grand_final", 1, 1)], 10, 21)
    reset_match = next(
        m
        for m in client.get(f"/playoff-brackets/{grand_final['playoff_bracket_id']}/matches").json()
        if m["bracket"] == "grand_final" and m["round"] == 2
    )
    assert reset_match["court"] == 1

    client.patch(
        f"/matches/{grand_final['id']}/correct",
        json={"team1_score": 21, "team2_score": 10, "version": grand_final["version"]},
    )

    assert _dispatch(client, grand_final["id"]) == {
        "courts": [{"court": 1, "match_id": None}],
        "queue": [],
        "overflow": False,
    }


def test_a_court_set_by_hand_overrides_dispatch(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    # Sending the third match to court 2 by hand takes it out of the queue, and
    # the unstarted match dispatched there goes back to the front of the line.
    client.patch(f"/matches/{r1[2]}/schedule", json={"court": 2})
    assert _court(client, r1[2]) == 2
    assert _court(client, r1[1]) is None
    assert _dispatch(client, r1[0])["queue"] == [r1[1], r1[3]]

    # It takes the next court that frees.
    _complete(client, r1[0])
    assert _court(client, r1[1]) == 1


def test_moving_a_match_off_its_court_by_hand_lets_the_queue_take_it(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    client.patch(f"/matches/{r1[0]}/schedule", json={"court": 2})

    # Court 2's unstarted match is bumped, and as the longest waiting it takes court 1.
    assert _court(client, r1[1]) == 1
    assert _court(client, r1[2]) is None


def _start(client, match_id):
    match = _get(client, match_id)
    client.patch(
        f"/matches/{match_id}/score",
        json={"team1_score": 3, "team2_score": 2, "version": match["version"]},
    )


def test_a_started_match_keeps_its_court_and_a_match_set_there_by_hand_plays_next(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    _start(client, r1[1])

    client.patch(f"/matches/{r1[3]}/schedule", json={"court": 2})

    # Both are on court 2: the one under way plays on, the hand-set one waits.
    assert (_court(client, r1[1]), _court(client, r1[3])) == (2, 2)
    courts = _dispatch(client, r1[0])["courts"]
    assert {"court": 2, "match_id": r1[1]} in courts
    # When it finishes the hand-set match takes the court, ahead of the queue.
    _complete(client, r1[1])
    courts = _dispatch(client, r1[0])["courts"]
    assert {"court": 2, "match_id": r1[3]} in courts
    assert _court(client, r1[2]) is None


def test_matches_set_by_hand_on_one_court_play_in_the_order_they_were_set(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    _start(client, r1[0])

    client.patch(f"/matches/{r1[3]}/schedule", json={"court": 1})
    client.patch(f"/matches/{r1[2]}/schedule", json={"court": 1})

    _complete(client, r1[0])
    assert _dispatch(client, r1[0])["courts"] == [{"court": 1, "match_id": r1[3]}]
    _complete(client, r1[3])
    assert _dispatch(client, r1[0])["courts"] == [{"court": 1, "match_id": r1[2]}]


def test_a_hand_set_court_is_recorded_and_cleared_with_the_court(client):
    ids = _bracket(client, 8, court_count=2)
    first = ids[("winners", 1, 1)]
    assert _get(client, first)["court_set_at"] is None

    client.patch(f"/matches/{first}/schedule", json={"court": 2})
    assert _get(client, first)["court_set_at"] is not None

    client.patch(f"/matches/{first}/schedule", json={"court": None})
    assert _get(client, first)["court_set_at"] is None


def test_changing_the_court_count_before_play_redistributes_the_courts(client):
    ids = _bracket(client, 8, court_count=1)
    tournament_id = _get(client, ids[("winners", 1, 1)])["tournament_id"]

    client.patch(f"/tournaments/{tournament_id}", json={"court_count": 3})

    courts = [_court(client, ids[("winners", 1, position)]) for position in range(1, 5)]
    assert courts == [1, 2, 3, None]


def test_clearing_a_ready_matchs_court_by_hand_puts_it_back_in_the_queue(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    client.patch(f"/matches/{r1[0]}/schedule", json={"court": None})

    # It keeps its place at the front, so it's dispatched straight back.
    assert _court(client, r1[0]) == 1
    assert _dispatch(client, r1[0])["queue"] == r1[1:]


def test_dispatch_of_a_missing_bracket_is_404(client):
    assert client.get("/playoff-brackets/999/dispatch").status_code == 404


def _tier_round_one(client, bracket_id):
    matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    return [m["id"] for m in sorted(matches, key=lambda m: m["id"]) if m["round"] == 1]


def test_a_bracket_without_courts_takes_freed_courts_in_turn_with_the_brackets_that_have_them(
    client,
):
    # One court for two brackets: bracket 1 owns it, bracket 2 has none of its own.
    tournament_id, [pool], _ = _setup(
        client, [8], advance_per_pool=4, playoff_bracket_count=2, court_count=1
    )
    _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id).json()
    first = _tier_round_one(client, tier_one["id"])
    second = _tier_round_one(client, tier_two["id"])
    tier_one_final = next(
        m["id"]
        for m in client.get(f"/playoff-brackets/{tier_one['id']}/matches").json()
        if m["round"] == 2
    )

    _complete(client, first[0])
    assert _court(client, first[1]) == 1
    # Bracket 2's first match became ready before bracket 1's final, so it goes first.
    _complete(client, first[1])

    assert _court(client, second[0]) == 1
    assert client.get(f"/playoff-brackets/{tier_two['id']}/dispatch").json() == {
        "courts": [{"court": 1, "match_id": second[0]}],
        "queue": [second[1]],
        "overflow": True,
    }
    assert client.get(f"/playoff-brackets/{tier_one['id']}/dispatch").json() == {
        "courts": [{"court": 1, "match_id": second[0]}],
        "queue": [second[1], tier_one_final],
        "overflow": False,
    }


def _hold(client, match_id, on_hold=True, version=None):
    if version is None:
        version = _get(client, match_id)["version"]
    return client.patch(f"/matches/{match_id}/hold", json={"on_hold": on_hold, "version": version})


def test_holding_a_match_on_court_hands_the_court_to_the_next_waiting_match(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    response = _hold(client, r1[0])

    assert response.status_code == 200
    assert (response.json()["on_hold"], response.json()["court"]) == (True, None)
    assert _court(client, r1[1]) == 1
    assert _dispatch(client, r1[0])["queue"] == r1[2:]


def test_releasing_a_hold_returns_the_match_to_its_place_in_the_queue(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    _hold(client, r1[0])

    _hold(client, r1[0], on_hold=False)

    assert _dispatch(client, r1[0])["queue"] == [r1[0], r1[2], r1[3]]
    _complete(client, r1[1])
    assert _court(client, r1[0]) == 1


def test_a_match_with_a_score_cannot_be_held(client):
    ids = _bracket(client, 4, court_count=1)
    started = ids[("winners", 1, 1)]
    match = _get(client, started)
    client.patch(
        f"/matches/{started}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"], "complete": False},
    )

    response = _hold(client, started)

    assert response.status_code == 400
    assert "has a score" in response.json()["detail"]
    assert _get(client, started)["on_hold"] is False


def test_a_pool_match_cannot_be_held(client):
    tournament_id, [pool], _ = _setup(client, [2], advance_per_pool=1, playoff_bracket_count=1)
    [pool_match] = client.get(f"/pools/{pool['id']}/matches").json()

    response = _hold(client, pool_match["id"])

    assert response.status_code == 400
    assert "playoff" in response.json()["detail"]


def test_holding_with_a_stale_version_is_a_conflict(client):
    ids = _bracket(client, 4, court_count=1)
    match = _get(client, ids[("winners", 1, 1)])

    assert _hold(client, match["id"], version=match["version"] + 1).status_code == 409
    assert _hold(client, match["id"], version=match["version"]).json()["version"] == match["version"] + 1


def test_a_held_match_cannot_be_scored_or_put_on_a_court_by_hand(client):
    ids = _bracket(client, 4, court_count=2)
    held = _hold(client, ids[("winners", 1, 1)]).json()

    scored = client.patch(
        f"/matches/{held['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": held["version"], "complete": False},
    )
    placed = client.patch(f"/matches/{held['id']}/schedule", json={"court": 1})

    assert scored.status_code == 400 and "on hold" in scored.json()["detail"]
    assert placed.status_code == 400 and "on hold" in placed.json()["detail"]
    assert _court(client, held["id"]) is None


def _two_brackets_on_two_courts(client):
    """Bracket 1 (4 teams) owns court 1; bracket 2 (8 teams) owns court 2. Double elimination."""
    tournament_id, pools, _ = _setup(
        client, [6, 6], advance_per_pool=2, playoff_bracket_count=2, court_count=2
    )
    for pool in pools:
        _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id, format="double").json()
    return tournament_id, tier_one["id"], tier_two["id"]


def _ids(client, bracket_id):
    matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    return {(m["bracket"], m["round"], m["position"]): m["id"] for m in matches}


def _finish(client, bracket_id):
    """Play the bracket to the end on its courts; the team in slot 1 always wins."""
    while True:
        matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
        on_court = [m for m in matches if m["status"] in ("ready", "in_progress") and m["court"]]
        if not on_court:
            assert all(m["status"] == "complete" for m in matches)
            return
        _complete(client, on_court[0]["id"])


def test_a_finished_bracket_lends_its_courts_to_a_bracket_still_playing(client):
    tournament_id, first, second = _two_brackets_on_two_courts(client)
    two = _ids(client, second)
    assert _court(client, two[("winners", 1, 1)]) == 2
    assert _court(client, two[("winners", 1, 2)]) is None

    _finish(client, first)

    # Court 1 is bracket 1's, but bracket 1 has nothing left to play.
    assert _court(client, two[("winners", 1, 2)]) == 1
    court_one = client.get(f"/tournaments/{tournament_id}/courts").json()[0]
    assert court_one["label"] == "Bracket 1"
    assert court_one["now_playing"] == "Bracket 2"
    assert court_one["current"]["id"] == two[("winners", 1, 2)]
    assert [m["id"] for m in court_one["up_next"]] == [two[("winners", 1, 3)], two[("winners", 1, 4)]]


def test_a_lent_court_takes_the_earliest_round_before_the_longest_waiting(client):
    _, first, second = _two_brackets_on_two_courts(client)
    two = _ids(client, second)
    _complete(client, two[("winners", 1, 1)])
    _complete(client, two[("winners", 1, 2)])
    # Winners round 2 match 1 became ready just before losers round 1 match 1.
    assert _court(client, two[("winners", 1, 3)]) == 2

    _finish(client, first)
    assert _court(client, two[("winners", 1, 4)]) == 1
    _complete(client, two[("winners", 1, 4)])

    assert _court(client, two[("losers", 1, 1)]) == 1
    assert _court(client, two[("winners", 2, 1)]) is None
    # Bracket 2's own court still goes first come, first served.
    _complete(client, two[("winners", 1, 3)])
    assert _court(client, two[("winners", 2, 1)]) == 2


def test_a_bracket_reopened_by_a_correction_takes_its_court_back_once_it_frees(client):
    _, first, second = _two_brackets_on_two_courts(client)
    two = _ids(client, second)
    _finish(client, first)
    borrowed = two[("winners", 1, 2)]
    assert _court(client, borrowed) == 1

    # The losers' side now wins the grand final, which adds a reset match.
    grand_final = _get(client, _ids(client, first)[("grand_final", 1, 1)])
    response = client.patch(
        f"/matches/{grand_final['id']}/correct",
        json={"team1_score": 10, "team2_score": 21, "version": grand_final["version"]},
    )
    assert response.status_code == 200, response.json()
    reset = _ids(client, first)[("grand_final", 2, 1)]
    assert _court(client, reset) is None  # the borrowed match plays on

    _complete(client, borrowed)

    assert _court(client, reset) == 1

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
    }


def test_a_court_set_by_hand_overrides_dispatch(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    # Sending the third match to court 2 by hand takes it out of the queue.
    client.patch(f"/matches/{r1[2]}/schedule", json={"court": 2})
    assert _dispatch(client, r1[0])["queue"] == [r1[3]]

    # Court 2 is still busy with it when the match there finishes...
    _complete(client, r1[1])
    assert _court(client, r1[3]) is None
    # ...so the queue moves on when court 1 frees instead.
    _complete(client, r1[0])
    assert _court(client, r1[3]) == 1


def test_moving_a_match_off_its_court_by_hand_lets_the_queue_take_it(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]

    client.patch(f"/matches/{r1[0]}/schedule", json={"court": 2})

    assert _court(client, r1[2]) == 1


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

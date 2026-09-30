from tests.helpers import create_tournament
from tests.test_bracket_best_of_api import _complete, _first_ready, _game, _generate, _get, _score, _set


def _caps(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}").json()["playoff_point_caps"]


def test_the_playoff_caps_are_one_number_per_set_and_none_until_set(client):
    tournament_id = create_tournament(client)["id"]
    assert _caps(client, tournament_id) == []

    assert _set(client, tournament_id, playoff_point_caps=[21, 21, 15]).status_code == 200
    assert _caps(client, tournament_id) == [21, 21, 15]

    # Trailing "no cap" boxes are dropped; a blank (0) in the middle stays.
    assert _set(client, tournament_id, playoff_point_caps=[21, 0, 25, 0, 0]).json()[
        "playoff_point_caps"
    ] == [21, 0, 25]
    assert _set(client, tournament_id, playoff_point_caps=[]).json()["playoff_point_caps"] == []
    assert _set(client, tournament_id, playoff_point_caps=[21]).status_code == 200
    assert _set(client, tournament_id, playoff_point_caps=None).json()["playoff_point_caps"] == []


def test_a_negative_or_too_long_list_of_caps_is_refused(client):
    tournament_id = create_tournament(client)["id"]

    assert _set(client, tournament_id, playoff_point_caps=[21, -1]).status_code == 422
    assert _set(client, tournament_id, playoff_point_caps=[21] * 8).status_code == 422


def test_a_single_game_playoff_score_above_the_first_cap_is_refused_and_not_saved(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_point_caps=[21])
    match = _first_ready(client, tournament_id, "winners")

    live = _score(client, match["id"], 22, 10, complete=False)
    final = _score(client, match["id"], 10, 25)

    assert live.status_code == 400 and "21" in live.json()["detail"]
    assert final.status_code == 400
    saved = _get(client, match["id"])
    assert (saved["team1_score"], saved["status"]) == (None, "ready")
    assert _score(client, match["id"], 21, 19).status_code == 200


def test_the_playoff_caps_never_touch_a_pool_game(client):
    from tests.test_pool_point_cap_api import _scheduled_pool, _matches
    from tests.test_pool_point_cap_api import _score as _pool_score

    tournament_id, pool, _ = _scheduled_pool(client, 3, court_count=1)
    _set(client, tournament_id, playoff_point_caps=[21])

    assert _pool_score(client, _matches(client, pool["id"])[0], 30, 28, complete=True).status_code == 200


def _series_match(client, caps, best_of=3):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=best_of, playoff_point_caps=caps)
    return tournament_id, _first_ready(client, tournament_id, "winners")


def _in_play(client, match_id, team1, team2):
    return client.put(
        f"/matches/{match_id}/game-in-play",
        json={"team1_score": team1, "team2_score": team2, "version": _get(client, match_id)["version"]},
    )


def _fix(client, match_id, number, team1, team2):
    return client.patch(
        f"/matches/{match_id}/games/{number}",
        json={"team1_score": team1, "team2_score": team2, "version": _get(client, match_id)["version"]},
    )


def test_each_game_of_a_series_is_held_to_its_own_sets_cap(client):
    _, match = _series_match(client, [21, 21, 15])

    too_high = _game(client, match["id"], 22, 10)
    assert too_high.status_code == 400 and "set 1 is capped at 21" in too_high.json()["detail"]
    assert _game(client, match["id"], 21, 10).status_code == 201
    assert _game(client, match["id"], 10, 22).status_code == 400
    assert _game(client, match["id"], 10, 21).status_code == 201
    third = _game(client, match["id"], 16, 10)
    assert third.status_code == 400 and "set 3 is capped at 15" in third.json()["detail"]
    assert _game(client, match["id"], 15, 10).status_code == 201
    assert _get(client, match["id"])["status"] == "complete"


def test_a_set_with_no_box_or_a_blank_one_has_no_cap(client):
    _, match = _series_match(client, [0, 21])

    assert _game(client, match["id"], 30, 10).status_code == 201
    assert _game(client, match["id"], 10, 21).status_code == 201
    assert _game(client, match["id"], 40, 10).status_code == 201


def test_the_running_score_and_a_fixed_game_are_held_to_the_cap_too(client):
    _, match = _series_match(client, [21, 15])

    assert _in_play(client, match["id"], 22, 5).status_code == 400
    assert _in_play(client, match["id"], 21, 5).status_code == 200
    assert _game(client, match["id"], 21, 5).status_code == 201
    assert _in_play(client, match["id"], 16, 5).status_code == 400
    assert _in_play(client, match["id"], 15, 5).status_code == 200
    assert _fix(client, match["id"], 1, 22, 5).status_code == 400
    assert _fix(client, match["id"], 1, 21, 7).status_code == 200


def test_a_single_game_playoff_correction_is_held_to_the_cap_and_old_scores_are_kept(client):
    tournament_id, _ = _generate(client, 4)
    match = _first_ready(client, tournament_id, "winners")
    played = _complete(client, match["id"])
    _set(client, tournament_id, playoff_point_caps=[15])
    assert (_get(client, match["id"])["team1_score"], _get(client, match["id"])["team2_score"]) == (21, 10)

    body = {"team1_score": 25, "team2_score": 10, "version": played["version"]}
    preview = client.post(f"/matches/{match['id']}/correct/preview", json=body)
    refused = client.patch(f"/matches/{match['id']}/correct", json=body)
    allowed = client.patch(f"/matches/{match['id']}/correct", json={**body, "team1_score": 15})

    assert preview.status_code == 400 and refused.status_code == 400
    assert "set 1 is capped at 15" in refused.json()["detail"]
    assert allowed.status_code == 200


def test_a_series_correction_holds_each_corrected_game_to_its_sets_cap(client):
    tournament_id, match = _series_match(client, [])
    _game(client, match["id"], 30, 10)
    _game(client, match["id"], 30, 10)
    done = _get(client, match["id"])
    _set(client, tournament_id, playoff_point_caps=[21, 15])

    def corrected(first, second):
        return {
            "games": [
                {"team1_score": first[0], "team2_score": first[1]},
                {"team1_score": second[0], "team2_score": second[1]},
            ],
            "version": done["version"],
        }

    too_high = corrected((21, 10), (16, 10))
    assert client.post(f"/matches/{match['id']}/correct/preview", json=too_high).status_code == 400
    refused = client.patch(f"/matches/{match['id']}/correct", json=too_high)
    assert refused.status_code == 400 and "set 2 is capped at 15" in refused.json()["detail"]
    assert client.patch(f"/matches/{match['id']}/correct", json=corrected((21, 10), (15, 10))).status_code == 200


def _court_matches(client, tournament_id):
    courts = client.get(f"/tournaments/{tournament_id}/courts").json()
    return [m for court in courts for m in [court["current"], *court["up_next"]] if m]


def test_court_matches_carry_the_caps_of_their_own_sets(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=3, playoff_point_caps=[21, 21, 15, 15])

    match = _court_matches(client, tournament_id)[0]

    assert match["point_caps"] == [21, 21, 15]
    assert match["point_cap"] == 0


def test_a_single_game_court_match_carries_the_first_cap(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_point_caps=[21, 15])

    match = _court_matches(client, tournament_id)[0]

    assert match["point_cap"] == 21
    assert match["point_caps"] == [21]

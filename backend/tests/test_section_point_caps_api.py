from tests.helpers import create_tournament
from tests.test_bracket_best_of_api import _complete, _first_ready, _game, _generate, _get, _score, _set
from tests.test_double_elimination_api import _play_until_grand_final


def _detail(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}").json()


def test_the_losers_and_grand_final_caps_follow_the_winners_until_set(client):
    tournament_id = create_tournament(client)["id"]
    fresh = _detail(client, tournament_id)
    assert fresh["playoff_point_caps_losers"] is None
    assert fresh["playoff_point_caps_final"] is None

    saved = _set(
        client,
        tournament_id,
        playoff_point_caps=[21],
        playoff_point_caps_losers=[15, 0, 11, 0],
        playoff_point_caps_final=[11, 11],
    )
    assert saved.status_code == 200
    body = _detail(client, tournament_id)
    assert body["playoff_point_caps"] == [21]
    # Trailing blanks are dropped, a blank in the middle stays.
    assert body["playoff_point_caps_losers"] == [15, 0, 11]
    assert body["playoff_point_caps_final"] == [11, 11]


def test_an_empty_own_list_is_no_cap_and_null_goes_back_to_the_winners(client):
    tournament_id = create_tournament(client)["id"]

    own_and_empty = _set(client, tournament_id, playoff_point_caps_losers=[])
    assert own_and_empty.json()["playoff_point_caps_losers"] == []

    back = _set(client, tournament_id, playoff_point_caps_losers=None)
    assert back.json()["playoff_point_caps_losers"] is None


def test_a_negative_or_too_long_list_of_section_caps_is_refused(client):
    tournament_id = create_tournament(client)["id"]

    assert _set(client, tournament_id, playoff_point_caps_losers=[21, -1]).status_code == 422
    assert _set(client, tournament_id, playoff_point_caps_final=[21] * 8).status_code == 422


def _losers_match(client, **settings):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, **settings)
    for match in [m for m in _bracket_matches(client, tournament_id) if m["bracket"] == "winners"]:
        if match["status"] == "ready":
            assert _score(client, match["id"], 10, 5).status_code == 200
    return tournament_id, _first_ready(client, tournament_id, "losers")


def _bracket_matches(client, tournament_id):
    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    return client.get(f"/playoff-brackets/{bracket['id']}/matches").json()


def test_a_losers_match_uses_the_losers_caps_when_it_has_its_own(client):
    _, match = _losers_match(client, playoff_point_caps=[21], playoff_point_caps_losers=[15])

    over = _score(client, match["id"], 16, 10)

    assert over.status_code == 400 and "set 1 is capped at 15" in over.json()["detail"]
    assert _score(client, match["id"], 15, 10).status_code == 200


def test_a_losers_match_follows_the_winners_caps_until_it_has_its_own(client):
    _, match = _losers_match(client, playoff_point_caps=[18])

    assert _score(client, match["id"], 19, 10).status_code == 400
    assert _score(client, match["id"], 18, 10).status_code == 200


def test_own_losers_caps_that_are_empty_leave_the_losers_bracket_uncapped(client):
    _, match = _losers_match(client, playoff_point_caps=[21], playoff_point_caps_losers=[])

    assert _score(client, match["id"], 30, 10).status_code == 200


def test_the_grand_final_uses_its_own_caps_and_the_winners_still_use_theirs(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_point_caps=[21], playoff_point_caps_final=[11])
    final = _play_until_grand_final(client, tournament_id)

    over = _score(client, final["id"], 12, 5)

    assert over.status_code == 400 and "set 1 is capped at 11" in over.json()["detail"]
    assert _score(client, final["id"], 11, 5).status_code == 200


def test_a_losers_series_holds_each_game_to_its_own_sets_losers_cap(client):
    _, match = _losers_match(
        client,
        playoff_best_of=1,
        playoff_best_of_losers=3,
        playoff_point_caps=[21, 21],
        playoff_point_caps_losers=[21, 15],
    )

    assert _game(client, match["id"], 21, 10).status_code == 201
    assert _game(client, match["id"], 16, 10).status_code == 400
    assert _game(client, match["id"], 15, 10).status_code == 201


def _court_matches(client, tournament_id):
    courts = client.get(f"/tournaments/{tournament_id}/courts").json()
    return [m for court in courts for m in [court["current"], *court["up_next"]] if m]


def test_court_matches_carry_the_caps_of_their_own_section(client):
    tournament_id, _ = _losers_match(
        client,
        playoff_best_of=1,
        playoff_best_of_losers=3,
        playoff_point_caps=[21, 21, 15],
        playoff_point_caps_losers=[11, 11],
    )

    shown = {m["bracket"]: m for m in _court_matches(client, tournament_id)}

    assert shown["losers"]["point_caps"] == [11, 11]


def test_a_losers_correction_is_held_to_the_losers_caps(client):
    tournament_id, match = _losers_match(client, playoff_point_caps=[21])
    played = _score(client, match["id"], 15, 10).json()
    _set(client, tournament_id, playoff_point_caps_losers=[15])

    body = {"team1_score": 16, "team2_score": 10, "version": played["version"]}
    refused = client.patch(f"/matches/{match['id']}/correct", json=body)
    allowed = client.patch(f"/matches/{match['id']}/correct", json={**body, "team1_score": 15, "team2_score": 12})

    assert refused.status_code == 400 and "capped at 15" in refused.json()["detail"]
    assert allowed.status_code == 200

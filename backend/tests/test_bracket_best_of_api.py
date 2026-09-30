from tests.helpers import create_tournament
from tests.test_double_elimination_api import _bracket, _complete, _generate, _get, _play_until_grand_final


def _set(client, tournament_id, **changes):
    return client.patch(f"/tournaments/{tournament_id}", json=changes)


def _score(client, match_id, team1=21, team2=10, complete=True):
    match = _get(client, match_id)
    return client.patch(
        f"/matches/{match_id}/score",
        json={"team1_score": team1, "team2_score": team2, "version": match["version"], "complete": complete},
    )


def _game(client, match_id, team1=21, team2=10):
    match = _get(client, match_id)
    return client.post(
        f"/matches/{match_id}/games",
        json={"team1_score": team1, "team2_score": team2, "version": match["version"]},
    )


def test_the_losers_and_grand_final_best_of_follow_the_winners_bracket_until_set(client):
    tournament_id = create_tournament(client)["id"]

    fresh = client.get(f"/tournaments/{tournament_id}").json()
    assert (fresh["playoff_best_of_losers"], fresh["playoff_best_of_final"]) == (0, 0)

    saved = _set(client, tournament_id, playoff_best_of_losers=3, playoff_best_of_final=5)
    assert saved.status_code == 200
    body = client.get(f"/tournaments/{tournament_id}").json()
    assert (body["playoff_best_of_losers"], body["playoff_best_of_final"]) == (3, 5)

    assert _set(client, tournament_id, playoff_best_of_losers=0).json()["playoff_best_of_losers"] == 0
    assert _set(client, tournament_id, playoff_best_of_losers=2).status_code == 422
    assert _set(client, tournament_id, playoff_best_of_final=9).status_code == 422


def _first_ready(client, tournament_id, section):
    return next(m for m in _bracket(client, tournament_id) if m["bracket"] == section and m["status"] == "ready")


def _finish_winners_round_one(client, tournament_id, single_game=True):
    for match in [m for m in _bracket(client, tournament_id) if m["bracket"] == "winners" and m["round"] == 1]:
        if single_game:
            _complete(client, match["id"])
        else:
            _game(client, match["id"])
            _game(client, match["id"])


def test_the_losers_bracket_plays_its_own_best_of(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=1, playoff_best_of_losers=3)

    winners = _first_ready(client, tournament_id, "winners")
    assert _score(client, winners["id"], complete=False).status_code == 200
    _finish_winners_round_one(client, tournament_id)

    losers = _first_ready(client, tournament_id, "losers")
    refused = _score(client, losers["id"])
    assert refused.status_code == 400
    assert "best-of-3" in refused.json()["detail"]
    assert _game(client, losers["id"]).status_code == 201


def test_the_grand_final_plays_its_own_best_of(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=1, playoff_best_of_losers=1, playoff_best_of_final=3)

    final = _play_until_grand_final(client, tournament_id)

    refused = _score(client, final["id"])
    assert refused.status_code == 400
    assert "best-of-3" in refused.json()["detail"]
    assert _game(client, final["id"]).status_code == 201


def test_the_losers_bracket_follows_the_winners_best_of_until_it_is_set(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=3)

    _finish_winners_round_one(client, tournament_id, single_game=False)

    losers = _first_ready(client, tournament_id, "losers")
    assert "best-of-3" in _score(client, losers["id"]).json()["detail"]


def test_single_elimination_ignores_the_losers_and_grand_final_settings(client):
    tournament_id, matches = _generate(client, 4, format="single")
    _set(client, tournament_id, playoff_best_of=1, playoff_best_of_losers=3, playoff_best_of_final=5)

    assert _score(client, matches[("winners", 1, 1)]["id"]).status_code == 200


def test_a_courts_matches_show_the_best_of_of_their_own_section(client):
    tournament_id, _ = _generate(client, 4)
    _set(client, tournament_id, playoff_best_of=1, playoff_best_of_losers=3)
    _finish_winners_round_one(client, tournament_id)

    courts = client.get(f"/tournaments/{tournament_id}/courts").json()

    shown = [m for court in courts for m in [court["current"], *court["up_next"]] if m]
    assert {m["bracket"]: m["best_of"] for m in shown}["losers"] == 3
    assert all(m["best_of"] == 1 for m in shown if m["bracket"] == "winners")


def test_all_three_best_of_settings_lock_once_a_playoff_match_is_scored(client):
    tournament_id, _ = _generate(client, 4)
    detail = client.get(f"/tournaments/{tournament_id}").json()
    assert not any(key.startswith("playoff_best_of") for key in detail["setting_locks"])

    _complete(client, _first_ready(client, tournament_id, "winners")["id"])

    locks = client.get(f"/tournaments/{tournament_id}").json()["setting_locks"]
    for setting in ("playoff_best_of", "playoff_best_of_losers", "playoff_best_of_final"):
        assert locks[setting] == "a playoff match has been scored"
    refused = _set(client, tournament_id, playoff_best_of_losers=3)
    assert refused.status_code == 400
    assert "Losers bracket best-of" in refused.json()["detail"]
    assert _set(client, tournament_id, playoff_best_of_final=0).status_code == 200


def test_previewing_a_losers_or_grand_final_best_of_says_which_matches_it_changes(client):
    tournament_id, _ = _generate(client, 4)

    preview = client.post(
        f"/tournaments/{tournament_id}/settings/preview",
        json={"playoff_best_of_losers": 3, "playoff_best_of_final": 5},
    )

    effects = " ".join(preview.json()["effects"])
    assert "losers bracket" in effects and "best of 3" in effects
    assert "grand final" in effects and "best of 5" in effects

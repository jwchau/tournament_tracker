from tests.test_pool_refs_api import _matches, _scheduled_pool
from tests.test_scoring_api import _create_ready_match


def _set_cap(client, tournament_id, cap):
    return client.patch(f"/tournaments/{tournament_id}", json={"pool_point_cap": cap})


def _score(client, match, team1, team2, complete=False):
    return client.patch(
        f"/matches/{match['id']}/score",
        json={
            "team1_score": team1,
            "team2_score": team2,
            "version": match["version"],
            "complete": complete,
        },
    )


def test_a_tournament_has_no_pool_point_cap_until_one_is_set(client):
    tournament_id, _, _ = _scheduled_pool(client, 3, court_count=1)

    assert client.get(f"/tournaments/{tournament_id}").json()["pool_point_cap"] == 0

    assert _set_cap(client, tournament_id, 21).status_code == 200
    assert client.get(f"/tournaments/{tournament_id}").json()["pool_point_cap"] == 21

    assert _set_cap(client, tournament_id, 0).json()["pool_point_cap"] == 0


def test_a_pool_score_above_the_cap_is_rejected_and_not_saved(client):
    tournament_id, pool, _ = _scheduled_pool(client, 3, court_count=1)
    _set_cap(client, tournament_id, 21)
    match = _matches(client, pool["id"])[0]

    live = _score(client, match, 22, 10)
    final = _score(client, match, 10, 25, complete=True)

    assert live.status_code == 400
    assert "21" in live.json()["detail"]
    assert final.status_code == 400
    saved = client.get(f"/matches/{match['id']}").json()
    assert saved["team1_score"] is None
    assert saved["status"] == "ready"
    assert saved["version"] == match["version"]


def test_a_pool_score_at_the_cap_is_accepted(client):
    tournament_id, pool, _ = _scheduled_pool(client, 3, court_count=1)
    _set_cap(client, tournament_id, 21)
    match = _matches(client, pool["id"])[0]

    response = _score(client, match, 21, 19, complete=True)

    assert response.status_code == 200
    assert response.json()["status"] == "complete"


def test_a_correction_above_the_cap_is_rejected_by_preview_and_save(client):
    tournament_id, pool, _ = _scheduled_pool(client, 3, court_count=1)
    match = _matches(client, pool["id"])[0]
    played = _score(client, match, 30, 28, complete=True).json()
    _set_cap(client, tournament_id, 21)

    body = {"team1_score": 25, "team2_score": 10, "version": played["version"]}
    preview = client.post(f"/matches/{match['id']}/correct/preview", json=body)
    saved = client.patch(f"/matches/{match['id']}/correct", json=body)
    within_cap = client.patch(
        f"/matches/{match['id']}/correct", json={**body, "team1_score": 21}
    )

    assert preview.status_code == 400
    assert saved.status_code == 400
    assert within_cap.status_code == 200


def test_a_match_scored_before_the_cap_was_set_is_kept_as_it_is(client):
    tournament_id, pool, _ = _scheduled_pool(client, 3, court_count=1)
    match = _matches(client, pool["id"])[0]
    _score(client, match, 30, 28, complete=True)

    _set_cap(client, tournament_id, 21)

    kept = client.get(f"/matches/{match['id']}").json()
    assert (kept["team1_score"], kept["team2_score"]) == (30, 28)


def test_playoff_matches_ignore_the_pool_point_cap(client):
    match = _create_ready_match(client)
    _set_cap(client, match["tournament_id"], 21)

    response = _score(client, match, 30, 28, complete=True)

    assert response.status_code == 200


def test_clearing_the_cap_with_null_means_no_cap(client):
    tournament_id, _, _ = _scheduled_pool(client, 3, court_count=1)
    _set_cap(client, tournament_id, 21)

    response = _set_cap(client, tournament_id, None)

    assert response.status_code == 200
    assert response.json()["pool_point_cap"] == 0


def test_a_pool_match_on_a_court_carries_the_cap_for_the_scoreboard(client):
    tournament_id, _, _ = _scheduled_pool(client, 3, court_count=1)
    _set_cap(client, tournament_id, 21)

    courts = client.get(f"/tournaments/{tournament_id}/courts").json()

    court = courts[0]
    assert court["current"]["point_cap"] == 21
    assert all(match["point_cap"] == 21 for match in court["up_next"])

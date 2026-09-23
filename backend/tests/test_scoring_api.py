from tests.helpers import create_tournament


def _create_ready_match(client):
    tournament = create_tournament(client, "API Cup")
    teams = [
        client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": name, "seed": seed},
        ).json()
        for seed, name in [(1, "Alpha"), (2, "Beta")]
    ]
    for team in teams:
        client.post(f"/teams/{team['id']}/players", json={"name": f"{team['name']} Player"})
    match = client.post(f"/tournaments/{tournament['id']}/bracket/generate").json()[0]
    return match


def test_patch_score_returns_200_with_updated_match_on_success(client):
    match = _create_ready_match(client)

    response = client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 21, "team2_score": 15, "version": match["version"], "complete": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["version"] == match["version"] + 1


def test_patch_score_returns_409_on_version_conflict(client):
    match = _create_ready_match(client)
    stale_version = match["version"]

    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 21, "team2_score": 15, "version": stale_version, "complete": True},
    )

    response = client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 10, "team2_score": 5, "version": stale_version, "complete": True},
    )

    assert response.status_code == 409


def test_get_match_returns_the_match(client):
    match = _create_ready_match(client)

    response = client.get(f"/matches/{match['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == match["id"]

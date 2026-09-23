from tests.helpers import create_tournament


def test_create_team_returns_it_under_the_tournament(client):
    tournament = create_tournament(client, "Spring Classic")

    response = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Ice Wolves"
    assert body["tournament_id"] == tournament["id"]
    assert body["id"] is not None


def test_create_team_for_missing_tournament_returns_404(client):
    response = client.post("/tournaments/999/teams", json={"name": "Ice Wolves"})

    assert response.status_code == 404


def test_list_teams_returns_teams_for_the_tournament(client):
    tournament = create_tournament(client, "Spring Classic")
    other_tournament = create_tournament(client, "Fall Invitational")
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"})
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"})
    client.post(f"/tournaments/{other_tournament['id']}/teams", json={"name": "Sand Sharks"})

    response = client.get(f"/tournaments/{tournament['id']}/teams")

    assert response.status_code == 200
    names = [team["name"] for team in response.json()]
    assert names == ["Ice Wolves", "Fire Hawks"]


def test_list_teams_includes_player_count(client):
    tournament = create_tournament(client, "Spring Classic")
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    empty_team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"}
    ).json()
    client.post(f"/teams/{team['id']}/players", json={"name": "Alex Kim"})
    client.post(f"/teams/{team['id']}/players", json={"name": "Jordan Lee"})

    response = client.get(f"/tournaments/{tournament['id']}/teams")

    assert response.status_code == 200
    counts_by_id = {t["id"]: t["player_count"] for t in response.json()}
    assert counts_by_id[team["id"]] == 2
    assert counts_by_id[empty_team["id"]] == 0


def test_get_team_returns_it_by_id(client):
    tournament = create_tournament(client, "Spring Classic")
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()

    response = client.get(f"/teams/{team['id']}")

    assert response.status_code == 200
    assert response.json()["name"] == "Ice Wolves"


def test_get_team_returns_404_for_missing_team(client):
    response = client.get("/teams/999")

    assert response.status_code == 404


def test_patch_team_updates_name(client):
    tournament = create_tournament(client, "Spring Classic")
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()

    response = client.patch(f"/teams/{team['id']}", json={"name": "Snow Wolves"})

    assert response.status_code == 200
    assert response.json()["name"] == "Snow Wolves"


def test_patch_team_returns_404_for_missing_team(client):
    response = client.patch("/teams/999", json={"name": "Nope"})

    assert response.status_code == 404

def test_create_player_returns_it_under_the_team(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()

    response = client.post(f"/teams/{team['id']}/players", json={"name": "Alex Kim"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Alex Kim"
    assert body["team_id"] == team["id"]
    assert body["id"] is not None


def test_create_player_for_missing_team_returns_404(client):
    response = client.post("/teams/999/players", json={"name": "Alex Kim"})

    assert response.status_code == 404


def test_list_players_returns_players_for_the_team(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    other_team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"}
    ).json()
    client.post(f"/teams/{team['id']}/players", json={"name": "Alex Kim"})
    client.post(f"/teams/{team['id']}/players", json={"name": "Jordan Lee"})
    client.post(f"/teams/{other_team['id']}/players", json={"name": "Sam Park"})

    response = client.get(f"/teams/{team['id']}/players")

    assert response.status_code == 200
    names = [player["name"] for player in response.json()]
    assert names == ["Alex Kim", "Jordan Lee"]


def test_delete_player_removes_them_from_the_roster(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    player = client.post(f"/teams/{team['id']}/players", json={"name": "Alex Kim"}).json()
    client.post(f"/teams/{team['id']}/players", json={"name": "Jordan Lee"})

    response = client.delete(f"/teams/{team['id']}/players/{player['id']}")

    assert response.status_code == 204
    names = [p["name"] for p in client.get(f"/teams/{team['id']}/players").json()]
    assert names == ["Jordan Lee"]


def test_delete_player_returns_404_for_missing_team(client):
    response = client.delete("/teams/999/players/1")

    assert response.status_code == 404


def test_delete_player_returns_404_when_player_belongs_to_a_different_team(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    other_team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"}
    ).json()
    player = client.post(f"/teams/{other_team['id']}/players", json={"name": "Sam Park"}).json()

    response = client.delete(f"/teams/{team['id']}/players/{player['id']}")

    assert response.status_code == 404

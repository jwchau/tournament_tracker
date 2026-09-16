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

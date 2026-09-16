def test_create_team_returns_it_under_the_tournament(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()

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
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    other_tournament = client.post("/tournaments", json={"name": "Fall Invitational"}).json()
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"})
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"})
    client.post(f"/tournaments/{other_tournament['id']}/teams", json={"name": "Sand Sharks"})

    response = client.get(f"/tournaments/{tournament['id']}/teams")

    assert response.status_code == 200
    names = [team["name"] for team in response.json()]
    assert names == ["Ice Wolves", "Fire Hawks"]

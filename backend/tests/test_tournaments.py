def test_create_tournament_returns_it_with_defaults(client):
    response = client.post("/tournaments", json={"name": "Spring Classic"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Spring Classic"
    assert body["stage"] == "draft"
    assert body["id"] is not None


def test_list_tournaments_returns_created_tournaments(client):
    client.post("/tournaments", json={"name": "Spring Classic"})
    client.post("/tournaments", json={"name": "Fall Invitational"})

    response = client.get("/tournaments")

    assert response.status_code == 200
    names = [tournament["name"] for tournament in response.json()]
    assert names == ["Spring Classic", "Fall Invitational"]


def test_list_tournaments_includes_team_count(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    empty_tournament = client.post("/tournaments", json={"name": "Fall Invitational"}).json()
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"})
    client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"})

    response = client.get("/tournaments")

    assert response.status_code == 200
    counts_by_id = {t["id"]: t["team_count"] for t in response.json()}
    assert counts_by_id[tournament["id"]] == 2
    assert counts_by_id[empty_tournament["id"]] == 0


def test_get_tournament_returns_it_by_id(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()

    response = client.get(f"/tournaments/{tournament['id']}")

    assert response.status_code == 200
    assert response.json()["name"] == "Spring Classic"


def test_get_tournament_returns_404_for_missing_tournament(client):
    response = client.get("/tournaments/999")

    assert response.status_code == 404


def test_patch_tournament_updates_provided_fields(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()

    response = client.patch(
        f"/tournaments/{tournament['id']}",
        json={"name": "Spring Classic 2026", "court_count": 4},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Spring Classic 2026"
    assert body["court_count"] == 4
    assert body["advance_per_pool"] == 1
    assert body["playoff_bracket_count"] == 1


def test_patch_tournament_returns_404_for_missing_tournament(client):
    response = client.patch("/tournaments/999", json={"name": "Nope"})

    assert response.status_code == 404


def test_delete_tournament_removes_it(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()

    response = client.delete(f"/tournaments/{tournament['id']}")

    assert response.status_code == 204
    assert client.get(f"/tournaments/{tournament['id']}").status_code == 404


def test_delete_tournament_returns_404_for_missing_tournament(client):
    response = client.delete("/tournaments/999")

    assert response.status_code == 404


def test_delete_tournament_cascades_to_teams_and_players(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    player = client.post(
        f"/teams/{team['id']}/players", json={"name": "Alex Kim"}
    ).json()

    response = client.delete(f"/tournaments/{tournament['id']}")

    assert response.status_code == 204
    assert client.get(f"/teams/{team['id']}").status_code == 404
    assert client.get(f"/teams/{team['id']}/players").json() == []
    assert player is not None


def test_delete_tournament_cascades_to_the_bracket(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    team_a = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves"}
    ).json()
    team_b = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks"}
    ).json()
    for team in (team_a, team_b):
        client.post(f"/teams/{team['id']}/players", json={"name": "Player"})
    client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    response = client.delete(f"/tournaments/{tournament['id']}")

    assert response.status_code == 204
    assert client.get(f"/tournaments/{tournament['id']}/bracket").json() == []

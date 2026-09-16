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

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


def test_patch_team_updates_seed(client):
    tournament = create_tournament(client)
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Aces", "seed": 3}
    ).json()

    response = client.patch(f"/teams/{team['id']}", json={"seed": 1})

    assert response.status_code == 200
    assert response.json()["seed"] == 1
    assert client.get(f"/teams/{team['id']}").json()["seed"] == 1


def test_seed_must_be_at_least_one(client):
    tournament = create_tournament(client)
    team = client.post(f"/tournaments/{tournament['id']}/teams", json={"name": "Aces"}).json()

    assert client.patch(f"/teams/{team['id']}", json={"seed": 0}).status_code == 422


def test_seeds_are_locked_once_play_starts_but_names_are_not(client):
    tournament = create_tournament(client)
    teams = _teams_with_players(client, tournament["id"], ["Aces", "Blockers"])
    match = client.post(f"/tournaments/{tournament['id']}/bracket/generate").json()[0]
    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"]},
    )

    seed_change = client.patch(f"/teams/{teams[0]['id']}", json={"seed": 2})
    rename = client.patch(f"/teams/{teams[0]['id']}", json={"name": "Aces High"})

    assert seed_change.status_code == 400
    assert "play has started" in seed_change.json()["detail"]
    assert rename.status_code == 200


def test_deleting_a_team_removes_it_and_its_players(client):
    tournament = create_tournament(client)
    team = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "No Shows"}
    ).json()
    client.post(f"/teams/{team['id']}/players", json={"name": "Alex Kim"})

    response = client.delete(f"/teams/{team['id']}")

    assert response.status_code == 204
    assert client.get(f"/teams/{team['id']}").status_code == 404
    assert client.get(f"/teams/{team['id']}/players").json() == []
    assert client.get(f"/tournaments/{tournament['id']}/teams").json() == []


def test_deleting_a_missing_team_returns_404(client):
    assert client.delete("/teams/999").status_code == 404


def _teams_with_players(client, tournament_id, names):
    teams = []
    for name in names:
        team = client.post(f"/tournaments/{tournament_id}/teams", json={"name": name}).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"{name} captain"})
        teams.append(team)
    return teams


def test_a_team_in_a_scheduled_pool_cannot_be_deleted(client):
    tournament = create_tournament(client)
    pool = client.post(f"/tournaments/{tournament['id']}/pools", json={"name": "Pool A"}).json()
    teams = _teams_with_players(client, tournament["id"], ["Aces", "Blockers", "Diggers"])
    for team in teams:
        client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
    client.post(f"/pools/{pool['id']}/generate-schedule")

    response = client.delete(f"/teams/{teams[0]['id']}")

    assert response.status_code == 400
    assert "schedule" in response.json()["detail"]
    assert client.get(f"/teams/{teams[0]['id']}").status_code == 200


def test_a_team_without_a_scheduled_pool_can_still_be_deleted(client):
    tournament = create_tournament(client)
    pool = client.post(f"/tournaments/{tournament['id']}/pools", json={"name": "Pool A"}).json()
    teams = _teams_with_players(client, tournament["id"], ["Aces", "Blockers"])
    client.patch(f"/teams/{teams[0]['id']}", json={"pool_id": pool["id"]})

    assert client.delete(f"/teams/{teams[0]['id']}").status_code == 204


def test_no_team_can_be_deleted_once_brackets_exist(client):
    tournament = create_tournament(client)
    teams = _teams_with_players(client, tournament["id"], ["Aces", "Blockers", "Diggers"])
    client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    response = client.delete(f"/teams/{teams[0]['id']}")

    assert response.status_code == 400
    assert "bracket" in response.json()["detail"]

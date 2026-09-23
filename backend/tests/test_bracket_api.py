def _create_tournament_with_teams(client, seeds_and_names):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    teams = [
        client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": name, "seed": seed},
        ).json()
        for seed, name in seeds_and_names
    ]
    for team in teams:
        client.post(f"/teams/{team['id']}/players", json={"name": f"{team['name']} Player"})
    return tournament, teams


def test_generate_bracket_persists_matches_with_resolved_winner_next(client):
    tournament, teams = _create_tournament_with_teams(
        client, [(1, "Ice Wolves"), (2, "Fire Hawks"), (3, "Sand Sharks")]
    )

    response = client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    assert response.status_code == 201
    matches = response.json()
    assert len(matches) == 3

    round1 = sorted(
        [m for m in matches if m["round"] == 1], key=lambda m: m["position"]
    )
    final = next(m for m in matches if m["round"] == 2)

    assert round1[0]["team1_id"] == teams[0]["id"]
    assert round1[0]["team2_id"] is None
    assert round1[0]["status"] == "complete"
    assert round1[0]["winner_id"] == teams[0]["id"]
    assert round1[0]["winner_next_match_id"] == final["id"]
    assert round1[0]["winner_next_slot"] == 1

    assert round1[1]["team1_id"] == teams[1]["id"]
    assert round1[1]["team2_id"] == teams[2]["id"]
    assert round1[1]["status"] == "ready"
    assert round1[1]["winner_next_match_id"] == final["id"]
    assert round1[1]["winner_next_slot"] == 2

    assert final["team1_id"] == teams[0]["id"]
    assert final["team2_id"] is None
    assert final["status"] == "pending"


def test_a_generated_bracket_is_the_tournaments_single_tier_one_playoff_bracket(client):
    tournament, _ = _create_tournament_with_teams(
        client, [(1, "Ice Wolves"), (2, "Fire Hawks"), (3, "Sand Sharks")]
    )
    generated = client.post(
        f"/tournaments/{tournament['id']}/bracket/generate", json={"format": "double"}
    ).json()

    [bracket] = client.get(f"/tournaments/{tournament['id']}/playoff-brackets").json()

    assert (bracket["tier"], bracket["format"]) == (1, "double")
    matches = client.get(f"/playoff-brackets/{bracket['id']}/matches").json()
    assert {m["id"] for m in matches} == {m["id"] for m in generated}
    assert client.get(f"/tournaments/{tournament['id']}").json()["stage"] == "playoffs"


def _three_team_tournament(client):
    tournament, _ = _create_tournament_with_teams(
        client, [(1, "Ice Wolves"), (2, "Fire Hawks"), (3, "Sand Sharks")]
    )
    return tournament["id"]


def test_a_tournament_gets_only_one_bracket(client):
    tournament_id = _three_team_tournament(client)
    first = client.post(f"/tournaments/{tournament_id}/bracket/generate").json()

    again = client.post(f"/tournaments/{tournament_id}/bracket/generate", json={"format": "double"})
    advance = client.post(f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": "double"})

    assert (again.status_code, advance.status_code) == (400, 400)
    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert bracket["format"] == "single"
    matches = client.get(f"/playoff-brackets/{bracket['id']}/matches").json()
    assert {m["id"] for m in matches} == {m["id"] for m in first}


def test_resetting_unscored_brackets_lets_the_tournament_generate_again(client):
    tournament_id = _three_team_tournament(client)
    first = client.post(f"/tournaments/{tournament_id}/bracket/generate").json()

    response = client.delete(f"/tournaments/{tournament_id}/playoff-brackets")

    assert response.status_code == 204
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []
    assert client.get(f"/matches/{first[0]['id']}").status_code == 404
    assert client.get(f"/tournaments/{tournament_id}").json()["stage"] == "draft"
    again = client.post(f"/tournaments/{tournament_id}/bracket/generate", json={"format": "double"})
    assert again.status_code == 201


def test_brackets_cant_be_reset_once_a_playoff_match_has_a_score(client):
    tournament_id = _three_team_tournament(client)
    matches = client.post(f"/tournaments/{tournament_id}/bracket/generate").json()
    ready = next(m for m in matches if m["status"] == "ready")
    client.patch(
        f"/matches/{ready['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": ready["version"], "complete": False},
    )

    response = client.delete(f"/tournaments/{tournament_id}/playoff-brackets")

    assert response.status_code == 400
    assert "scored" in response.json()["detail"]
    assert len(client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()) == 1


def test_a_single_playoff_bracket_reports_whether_play_has_started(client):
    tournament_id = _three_team_tournament(client)
    matches = client.post(f"/tournaments/{tournament_id}/bracket/generate").json()
    bracket_id = matches[0]["playoff_bracket_id"]

    before = client.get(f"/playoff-brackets/{bracket_id}").json()
    ready = next(m for m in matches if m["status"] == "ready")
    client.patch(
        f"/matches/{ready['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": ready["version"], "complete": False},
    )
    after = client.get(f"/playoff-brackets/{bracket_id}").json()

    assert (before["tournament_id"], before["tier"], before["has_scores"]) == (tournament_id, 1, False)
    assert after["has_scores"] is True
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()[0]["has_scores"] is True
    assert client.get("/playoff-brackets/9999").status_code == 404


def test_the_old_tournament_wide_bracket_endpoint_is_gone(client):
    tournament_id = _three_team_tournament(client)
    client.post(f"/tournaments/{tournament_id}/bracket/generate")

    assert client.get(f"/tournaments/{tournament_id}/bracket").status_code in (404, 405)


def test_a_tournament_with_pools_advances_instead_of_generating(client):
    tournament_id = _three_team_tournament(client)
    client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Pool A"})

    response = client.post(f"/tournaments/{tournament_id}/bracket/generate")

    assert response.status_code == 400
    assert "advance" in response.json()["detail"]
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []


def test_generate_bracket_rejects_fewer_than_two_teams(client):
    tournament, _ = _create_tournament_with_teams(client, [(1, "Ice Wolves")])

    response = client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    assert response.status_code == 400
    assert "at least 2 teams" in response.json()["detail"]


def test_generate_bracket_rejects_a_team_with_no_players(client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Ice Wolves", "seed": 1}
    )
    team2 = client.post(
        f"/tournaments/{tournament['id']}/teams", json={"name": "Fire Hawks", "seed": 2}
    ).json()
    client.post(f"/teams/{team2['id']}/players", json={"name": "Sam"})

    response = client.post(f"/tournaments/{tournament['id']}/bracket/generate")

    assert response.status_code == 400
    assert "Ice Wolves" in response.json()["detail"]

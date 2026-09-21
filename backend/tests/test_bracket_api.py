def _create_tournament_with_teams(client, seeds_and_names):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()
    teams = [
        client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": name, "seed": seed},
        ).json()
        for seed, name in seeds_and_names
    ]
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


def test_get_bracket_returns_the_generated_matches(client):
    tournament, _ = _create_tournament_with_teams(
        client, [(1, "Ice Wolves"), (2, "Fire Hawks"), (3, "Sand Sharks")]
    )
    generated = client.post(f"/tournaments/{tournament['id']}/bracket/generate").json()

    response = client.get(f"/tournaments/{tournament['id']}/bracket")

    assert response.status_code == 200
    ids = {m["id"] for m in response.json()}
    assert ids == {m["id"] for m in generated}

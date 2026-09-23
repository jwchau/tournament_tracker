def _tournament_with_teams(client, team_count, court_count=None):
    tournament = client.post("/tournaments", json={"name": "Pool Cup"}).json()
    if court_count is not None:
        client.patch(f"/tournaments/{tournament['id']}", json={"court_count": court_count})
    teams = [
        client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": f"Seed {seed}", "seed": seed},
        ).json()
        for seed in range(1, team_count + 1)
    ]
    return tournament["id"], teams


def _create_pools(client, tournament_id, count):
    return [
        client.post(f"/tournaments/{tournament_id}/pools", json={"name": f"Pool {i}"}).json()
        for i in range(1, count + 1)
    ]


def _pool_of_each_seed(client, tournament_id, pools):
    pool_number = {pool["id"]: number for number, pool in enumerate(pools, start=1)}
    teams = client.get(f"/tournaments/{tournament_id}/teams").json()
    return {team["seed"]: pool_number.get(team["pool_id"]) for team in teams}


def test_auto_assign_snake_seeds_teams_across_pools_of_different_sizes(client):
    tournament_id, _ = _tournament_with_teams(client, 7, court_count=3)
    client.patch(f"/tournaments/{tournament_id}", json={"target_pool_size": 2})
    pools = _create_pools(client, tournament_id, 3)

    response = client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert response.status_code == 200
    # Seeds 1-3 go to pools 1-3, seeds 4-6 snake back 3-1, seed 7 starts over at pool 1.
    assert _pool_of_each_seed(client, tournament_id, pools) == {
        1: 1, 2: 2, 3: 3,
        4: 3, 5: 2, 6: 1,
        7: 1,
    }


def _courts_by_pool(client, tournament_id):
    return [pool["courts"] for pool in client.get(f"/tournaments/{tournament_id}/pools").json()]


def test_courts_are_split_evenly_with_extras_going_to_earlier_pools(client):
    tournament_id, _ = _tournament_with_teams(client, 0, court_count=5)
    _create_pools(client, tournament_id, 3)

    assert _courts_by_pool(client, tournament_id) == [[1, 2], [3, 4], [5]]

    client.patch(f"/tournaments/{tournament_id}", json={"court_count": 7})
    assert _courts_by_pool(client, tournament_id) == [[1, 2, 3], [4, 5], [6, 7]]


def test_pools_beyond_the_court_count_get_no_court(client):
    tournament_id, _ = _tournament_with_teams(client, 0, court_count=2)
    _create_pools(client, tournament_id, 3)

    assert _courts_by_pool(client, tournament_id) == [[1], [2], []]


def test_a_team_can_be_moved_to_another_pool_by_hand(client):
    tournament_id, teams = _tournament_with_teams(client, 4)
    pools = _create_pools(client, tournament_id, 2)
    client.patch(f"/teams/{teams[0]['id']}", json={"pool_id": pools[0]["id"]})

    response = client.patch(f"/teams/{teams[0]['id']}", json={"pool_id": pools[1]["id"]})

    assert response.status_code == 200
    assert response.json()["name"] == "Seed 1"
    assert _pool_of_each_seed(client, tournament_id, pools)[1] == 2

    client.patch(f"/teams/{teams[0]['id']}", json={"pool_id": None})
    assert _pool_of_each_seed(client, tournament_id, pools)[1] is None


def test_a_team_cannot_join_another_tournaments_pool(client):
    tournament_id, teams = _tournament_with_teams(client, 1)
    other_tournament_id, _ = _tournament_with_teams(client, 0)
    [other_pool] = _create_pools(client, other_tournament_id, 1)

    response = client.patch(f"/teams/{teams[0]['id']}", json={"pool_id": other_pool["id"]})

    assert response.status_code == 400


def _pool_sizes(client, tournament_id):
    pools = client.get(f"/tournaments/{tournament_id}/pools").json()
    teams = client.get(f"/tournaments/{tournament_id}/teams").json()
    return {pool["name"]: sum(t["pool_id"] == pool["id"] for t in teams) for pool in pools}


def test_auto_assign_creates_the_pool_count_closest_to_the_target_size(client):
    tournament_id, _ = _tournament_with_teams(client, 13, court_count=4)
    assert client.get(f"/tournaments/{tournament_id}").json()["target_pool_size"] == 4

    response = client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert response.status_code == 200
    # 3 pools average 4.3 teams, closer to 4 than 4 pools' 3.25.
    assert _pool_sizes(client, tournament_id) == {"Pool A": 5, "Pool B": 4, "Pool C": 4}


def test_auto_assign_never_makes_more_pools_than_courts(client):
    tournament_id, _ = _tournament_with_teams(client, 13, court_count=2)

    client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert _pool_sizes(client, tournament_id) == {"Pool A": 7, "Pool B": 6}


def test_auto_assign_keeps_the_earliest_pools_and_drops_the_newest_extras(client):
    tournament_id, _ = _tournament_with_teams(client, 8, court_count=8)
    client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Gold"})
    for name in ("Silver", "Bronze", "Iron"):
        client.post(f"/tournaments/{tournament_id}/pools", json={"name": name})

    client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert _pool_sizes(client, tournament_id) == {"Gold": 4, "Silver": 4}


def test_auto_assign_fills_in_missing_pools_after_ones_already_named(client):
    tournament_id, _ = _tournament_with_teams(client, 12, court_count=3)
    client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Pool B"})

    client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert _pool_sizes(client, tournament_id) == {"Pool B": 4, "Pool A": 4, "Pool C": 4}


def test_auto_assign_is_refused_once_pool_play_has_started(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 4)
    _generate_schedule(client, pool["id"])
    match = _pool_matches(client, pool["id"])[0]
    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"], "complete": False},
    )

    response = client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    assert response.status_code == 400
    assert len(_pool_matches(client, pool["id"])) == 6


def test_target_pool_size_must_be_at_least_two(client):
    tournament_id, _ = _tournament_with_teams(client, 0)

    assert client.patch(
        f"/tournaments/{tournament_id}", json={"target_pool_size": 1}
    ).status_code == 422


def _pool_with_teams(client, team_count, court_count=2, pool_count=1):
    """`pool_count` pools holding the teams in a snake (1..P, P..1, ...), assigned by hand."""
    tournament_id, teams = _tournament_with_teams(client, team_count, court_count=court_count)
    pools = _create_pools(client, tournament_id, pool_count)
    for index, team in enumerate(teams):
        lap, offset = divmod(index, pool_count)
        pool = pools[offset if lap % 2 == 0 else pool_count - 1 - offset]
        client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
    return tournament_id, pools, teams


def _generate_schedule(client, pool_id, n=None):
    """Generate a pool's schedule, first setting the tournament's games per pairing to `n` if given."""
    if n is not None:
        tournament_id = client.get(f"/pools/{pool_id}").json()["tournament_id"]
        client.patch(f"/tournaments/{tournament_id}", json={"games_per_pairing": n})
    return client.post(f"/pools/{pool_id}/generate-schedule")


def test_games_per_pairing_is_a_tournament_setting_defaulting_to_one(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 3)
    assert client.get(f"/tournaments/{tournament_id}").json()["games_per_pairing"] == 1

    client.patch(f"/tournaments/{tournament_id}", json={"games_per_pairing": 3})
    response = client.post(f"/pools/{pool['id']}/generate-schedule")

    assert response.status_code == 201
    pairings = [frozenset((m["team1_id"], m["team2_id"])) for m in response.json()]
    assert len(pairings) == 3 * 3 and all(pairings.count(p) == 3 for p in pairings)


def test_games_per_pairing_must_be_at_least_one(client):
    tournament_id, _ = _tournament_with_teams(client, 0)

    response = client.patch(f"/tournaments/{tournament_id}", json={"games_per_pairing": 0})

    assert response.status_code == 422


def _pool_matches(client, pool_id):
    return client.get(f"/pools/{pool_id}/matches").json()


def test_generating_a_schedule_stores_pool_matches_on_the_pools_courts(client):
    _, pools, _ = _pool_with_teams(client, 5, court_count=5, pool_count=2)
    first_pool = pools[0]  # 3 teams (seeds 1, 4, 5) on courts 1-3

    response = _generate_schedule(client, first_pool["id"], n=2)

    assert response.status_code == 201
    matches = _pool_matches(client, first_pool["id"])
    assert len(matches) == 2 * 3
    assert {m["court"] for m in matches} <= {1, 2, 3}
    assert all(m["bracket"] == "pool" and m["pool_id"] == first_pool["id"] for m in matches)
    assert all(m["status"] == "ready" for m in matches)
    slots = [m["round"] for m in matches]
    assert slots == sorted(slots) and slots[0] == 1


def test_regenerating_replaces_an_unplayed_schedule(client):
    _, [pool], _ = _pool_with_teams(client, 4)
    _generate_schedule(client, pool["id"], n=1)

    response = _generate_schedule(client, pool["id"], n=2)

    assert response.status_code == 201
    assert len(_pool_matches(client, pool["id"])) == 12


def test_regenerating_is_refused_once_a_pool_match_has_a_score(client):
    _, [pool], _ = _pool_with_teams(client, 4)
    _generate_schedule(client, pool["id"])
    match = _pool_matches(client, pool["id"])[0]
    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"], "complete": False},
    )

    response = _generate_schedule(client, pool["id"], n=2)

    assert response.status_code == 400
    assert len(_pool_matches(client, pool["id"])) == 6


def test_a_pool_without_a_court_cannot_be_scheduled(client):
    _, pools, _ = _pool_with_teams(client, 6, court_count=1, pool_count=2)

    assert _generate_schedule(client, pools[1]["id"]).status_code == 400


def test_a_pool_needs_at_least_two_teams(client):
    _, [pool], _ = _pool_with_teams(client, 1)

    assert _generate_schedule(client, pool["id"]).status_code == 400


def _score_first_match(client, pool_id, complete=True):
    match = _pool_matches(client, pool_id)[0]
    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 21, "team2_score": 10, "version": match["version"], "complete": complete},
    )
    return match


def test_pool_matches_are_not_part_of_any_playoff_bracket(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 4)
    matches = _generate_schedule(client, pool["id"]).json()

    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []
    assert {m["playoff_bracket_id"] for m in matches} == {None}


def test_deleting_the_tournament_removes_its_pools_and_their_matches(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 4)
    _generate_schedule(client, pool["id"])

    assert client.delete(f"/tournaments/{tournament_id}").status_code == 204
    assert client.get(f"/pools/{pool['id']}/matches").status_code == 404


def test_standings_survive_a_team_being_moved_out_after_playing(client):
    _, pools, _ = _pool_with_teams(client, 4, court_count=2, pool_count=2)
    _generate_schedule(client, pools[0]["id"])
    played = _score_first_match(client, pools[0]["id"])

    client.patch(f"/teams/{played['team1_id']}", json={"pool_id": pools[1]["id"]})

    standings = client.get(f"/pools/{pools[0]['id']}/standings")
    assert standings.status_code == 200
    assert [row["team_id"] for row in standings.json()] == [played["team2_id"]]


def test_a_pool_can_be_renamed(client):
    _, [pool], _ = _pool_with_teams(client, 2)

    response = client.patch(f"/pools/{pool['id']}", json={"name": "Court A pool"})

    assert response.status_code == 200
    assert response.json()["name"] == "Court A pool"


def test_deleting_a_pool_unassigns_its_teams_and_drops_its_unplayed_schedule(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 3)
    _generate_schedule(client, pool["id"])

    assert client.delete(f"/pools/{pool['id']}").status_code == 204

    teams = client.get(f"/tournaments/{tournament_id}/teams").json()
    assert all(team["pool_id"] is None for team in teams)
    assert client.get(f"/tournaments/{tournament_id}/pools").json() == []


def test_a_pool_with_scored_matches_cannot_be_deleted(client):
    _, [pool], _ = _pool_with_teams(client, 3)
    _generate_schedule(client, pool["id"])
    _score_first_match(client, pool["id"], complete=False)

    assert client.delete(f"/pools/{pool['id']}").status_code == 400


def test_a_single_pool_can_be_fetched_with_its_courts(client):
    tournament_id, _ = _tournament_with_teams(client, 0, court_count=3)
    pools = _create_pools(client, tournament_id, 2)

    response = client.get(f"/pools/{pools[1]['id']}")

    assert response.status_code == 200
    assert response.json() == {
        "id": pools[1]["id"],
        "tournament_id": tournament_id,
        "name": "Pool 2",
        "courts": [3],
    }
    assert client.get("/pools/999").status_code == 404

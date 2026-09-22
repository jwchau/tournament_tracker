from tests.test_pools_api import _generate_schedule, _pool_matches, _pool_with_teams


def _play_pool(client, pool_id, results):
    """Complete every pool match. `results` maps frozenset({a, b}) -> (winner, winner_pts, loser_pts)."""
    for match in _pool_matches(client, pool_id):
        winner, winner_points, loser_points = results[
            frozenset((match["team1_id"], match["team2_id"]))
        ]
        team1_won = winner == match["team1_id"]
        client.patch(
            f"/matches/{match['id']}/score",
            json={
                "team1_score": winner_points if team1_won else loser_points,
                "team2_score": loser_points if team1_won else winner_points,
                "version": match["version"],
                "complete": True,
            },
        )


def _standings(client, pool_id):
    return client.get(f"/pools/{pool_id}/standings").json()


def _single_pool(client, team_count):
    _, [pool], teams = _pool_with_teams(client, team_count)
    _generate_schedule(client, pool["id"])
    return pool["id"], [team["id"] for team in teams]


def test_standings_award_three_points_per_win_and_rank_by_points(client):
    pool_id, (a, b, c) = _single_pool(client, 3)
    _play_pool(
        client,
        pool_id,
        {
            frozenset((a, b)): (a, 21, 10),
            frozenset((a, c)): (a, 21, 15),
            frozenset((b, c)): (b, 21, 19),
        },
    )

    standings = _standings(client, pool_id)

    assert [(row["team_id"], row["wins"], row["losses"], row["points"]) for row in standings] == [
        (a, 2, 0, 6),
        (b, 1, 1, 3),
        (c, 0, 2, 0),
    ]
    assert [row["rank"] for row in standings] == [1, 2, 3]
    top = standings[0]
    assert (top["played"], top["points_for"], top["point_diff"]) == (2, 42, 17)
    assert top["name"] == "Seed 1"


def test_teams_level_on_points_are_separated_by_head_to_head_first(client):
    pool_id, (a, b, c, d) = _single_pool(client, 4)
    _play_pool(
        client,
        pool_id,
        {
            # A and B both win twice; A beat B, though B's differential is far better.
            frozenset((a, b)): (a, 21, 20),
            frozenset((a, c)): (c, 21, 10),
            frozenset((a, d)): (a, 21, 19),
            frozenset((b, c)): (b, 21, 0),
            frozenset((b, d)): (b, 21, 0),
            # C and D both win once; D beat C.
            frozenset((c, d)): (d, 21, 10),
        },
    )

    assert [row["team_id"] for row in _standings(client, pool_id)] == [a, b, d, c]


def test_a_head_to_head_cycle_falls_back_to_point_differential(client):
    pool_id, (a, b, c) = _single_pool(client, 3)
    _play_pool(
        client,
        pool_id,
        {
            # Each team wins once, so head-to-head can't split them.
            frozenset((a, b)): (a, 21, 19),  # A +2
            frozenset((b, c)): (b, 21, 5),  # B +16
            frozenset((a, c)): (c, 21, 10),  # C +11
        },
    )

    standings = _standings(client, pool_id)

    # Differentials: B +14, C -5, A -9 (not the order the teams were created in).
    assert [(row["team_id"], row["point_diff"]) for row in standings] == [
        (b, 14),
        (c, -5),
        (a, -9),
    ]


def test_equal_differentials_fall_back_to_points_scored(client):
    pool_id, (a, b, c) = _single_pool(client, 3)
    _play_pool(
        client,
        pool_id,
        {
            # A cycle where every margin is 10, so every differential is 0.
            frozenset((a, b)): (a, 21, 11),
            frozenset((b, c)): (b, 25, 15),
            frozenset((a, c)): (c, 20, 10),
        },
    )

    standings = _standings(client, pool_id)

    # Points scored: B 36, C 35, A 31.
    assert [(row["team_id"], row["point_diff"], row["points_for"]) for row in standings] == [
        (b, 0, 36),
        (c, 0, 35),
        (a, 0, 31),
    ]

from tests.test_pools_api import _create_pools, _generate_schedule, _pool_matches, _tournament_with_teams


def _setup(client, pool_sizes, advance_per_pool, playoff_bracket_count, court_count=None):
    """A tournament whose pools hold `pool_sizes` teams, seeded 1..N in pool order.

    Returns (tournament_id, pools, team ids per pool in seed order).
    """
    tournament_id, teams = _tournament_with_teams(
        client, sum(pool_sizes), court_count=court_count or len(pool_sizes)
    )
    client.patch(
        f"/tournaments/{tournament_id}",
        json={
            "advance_per_pool": advance_per_pool,
            "playoff_bracket_count": playoff_bracket_count,
        },
    )
    pools = _create_pools(client, tournament_id, len(pool_sizes))
    team_ids_by_pool, remaining = [], iter(teams)
    for pool, size in zip(pools, pool_sizes):
        members = [next(remaining)["id"] for _ in range(size)]
        for team_id in members:
            client.patch(f"/teams/{team_id}", json={"pool_id": pool["id"]})
        _generate_schedule(client, pool["id"])
        team_ids_by_pool.append(members)
    return tournament_id, pools, team_ids_by_pool


def _play(client, pool_id, margin=lambda winner, loser: (21, 10)):
    """Complete every match in a pool; the team listed earlier in the pool always wins.

    Team ids ascend in seed order, so the lower id wins. `margin` gives
    the (winner, loser) score for a pairing.
    """
    for match in _pool_matches(client, pool_id):
        winner, loser = sorted((match["team1_id"], match["team2_id"]))
        winner_points, loser_points = margin(winner, loser)
        team1_won = match["team1_id"] == winner
        client.patch(
            f"/matches/{match['id']}/score",
            json={
                "team1_score": winner_points if team1_won else loser_points,
                "team2_score": loser_points if team1_won else winner_points,
                "version": match["version"],
                "complete": True,
            },
        )


def _advance(client, tournament_id, format="single"):
    return client.post(
        f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": format}
    )


def _bracket_teams(client, bracket_id):
    matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    return {
        team_id
        for match in matches
        for team_id in (match["team1_id"], match["team2_id"])
        if team_id is not None
    }


def test_a_pool_of_six_sends_its_top_two_to_bracket_one_and_the_rest_to_the_catch_all(client):
    tournament_id, [pool], [teams] = _setup(client, [6], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])

    response = _advance(client, tournament_id)

    assert response.status_code == 201
    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert [bracket["tier"] for bracket in brackets] == [1, 2]
    assert _bracket_teams(client, brackets[0]["id"]) == set(teams[:2])
    assert _bracket_teams(client, brackets[1]["id"]) == set(teams[2:])


def test_the_catch_all_bracket_absorbs_every_remainder_from_pools_of_different_sizes(client):
    tournament_id, pools, [big, small] = _setup(
        client, [5, 3], advance_per_pool=1, playoff_bracket_count=3
    )
    for pool in pools:
        _play(client, pool["id"])

    _advance(client, tournament_id)

    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert [_bracket_teams(client, bracket["id"]) for bracket in brackets] == [
        {big[0], small[0]},
        {big[1], small[1]},
        {*big[2:], small[2]},
    ]


def _first_match(client, bracket_id):
    matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    return next(m for m in matches if m["round"] == 1 and m["position"] == 1)


def test_cross_pool_seeding_breaks_a_points_tie_on_point_differential(client):
    tournament_id, pools, [a, b] = _setup(client, [3, 3], advance_per_pool=1, playoff_bracket_count=2)
    _play(client, pools[0]["id"], margin=lambda winner, loser: (21, 19))
    _play(client, pools[1]["id"], margin=lambda winner, loser: (21, 5))

    _advance(client, tournament_id)

    tier_one = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()[0]
    final = _first_match(client, tier_one["id"])
    # Both pool winners have 6 points; pool B's winner has the better differential.
    assert (final["team1_id"], final["team2_id"]) == (b[0], a[0])


def test_cross_pool_seeding_falls_back_to_points_scored(client):
    tournament_id, pools, [a, b] = _setup(client, [3, 3], advance_per_pool=1, playoff_bracket_count=2)
    _play(client, pools[0]["id"], margin=lambda winner, loser: (30, 20))
    _play(client, pools[1]["id"], margin=lambda winner, loser: (21, 11))

    _advance(client, tournament_id)

    tier_one = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()[0]
    final = _first_match(client, tier_one["id"])
    # Same points and differential (+20); pool A's winner scored 60 to pool B's 42.
    assert (final["team1_id"], final["team2_id"]) == (a[0], b[0])


def _score(client, match, team1_score, team2_score):
    return client.patch(
        f"/matches/{match['id']}/score",
        json={
            "team1_score": team1_score,
            "team2_score": team2_score,
            "version": match["version"],
            "complete": True,
        },
    ).json()


def _match_in(client, bracket_id, bracket, round_):
    matches = client.get(f"/playoff-brackets/{bracket_id}/matches").json()
    return next((m for m in matches if m["bracket"] == bracket and m["round"] == round_), None)


def _force_grand_final_reset(client, bracket_id):
    """Winners final to slot 1's team, then grand final 1 to the losers champion."""
    _score(client, _match_in(client, bracket_id, "winners", 1), 21, 10)
    return _score(client, _match_in(client, bracket_id, "grand_final", 1), 10, 21)


def test_each_double_elimination_tier_keeps_its_own_grand_final_reset(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id, format="double").json()
    _force_grand_final_reset(client, tier_one["id"])
    grand_final = _force_grand_final_reset(client, tier_two["id"])

    # Correcting tier 2's grand final so the winners champion wins removes only its reset.
    client.patch(
        f"/matches/{grand_final['id']}/correct",
        json={"team1_score": 21, "team2_score": 10, "version": grand_final["version"]},
    )

    assert _match_in(client, tier_one["id"], "grand_final", 2) is not None
    assert _match_in(client, tier_two["id"], "grand_final", 2) is None
    assert client.get(f"/tournaments/{tournament_id}").json()["format"] == "double"


def test_deleting_a_tournament_removes_its_playoff_brackets(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    brackets = _advance(client, tournament_id).json()

    client.delete(f"/tournaments/{tournament_id}")

    for bracket in brackets:
        assert client.get(f"/playoff-brackets/{bracket['id']}/matches").status_code == 404


def test_advancing_is_refused_while_any_pool_match_is_unfinished(client):
    tournament_id, pools, _ = _setup(client, [3, 3], advance_per_pool=1, playoff_bracket_count=2)
    _play(client, pools[0]["id"])

    response = _advance(client, tournament_id)

    assert response.status_code == 400
    assert "incomplete" in response.json()["detail"]
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []
    assert client.get(f"/tournaments/{tournament_id}").json()["stage"] != "playoffs"


def _readiness(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}/playoff-readiness").json()


def test_readiness_explains_what_blocks_advancing_until_nothing_does(client):
    tournament_id, pools, _ = _setup(client, [3, 3], advance_per_pool=1, playoff_bracket_count=2)
    _play(client, pools[0]["id"])

    assert _readiness(client, tournament_id) == {
        "ready": False,
        "reason": "Pool 2 has incomplete matches",
    }

    _play(client, pools[1]["id"])

    assert _readiness(client, tournament_id) == {"ready": True, "reason": None}


def test_a_pool_whose_schedule_was_never_generated_counts_as_unfinished(client):
    tournament_id, _ = _tournament_with_teams(client, 4)
    _create_pools(client, tournament_id, 1)
    client.post(f"/tournaments/{tournament_id}/pools/auto-assign")

    response = _advance(client, tournament_id)

    assert response.status_code == 400
    assert "no schedule" in response.json()["detail"]


def test_advancing_twice_is_refused_and_keeps_the_first_brackets(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    first = _advance(client, tournament_id).json()

    response = _advance(client, tournament_id)

    assert response.status_code == 400
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == first


def test_advancing_is_refused_when_a_bracket_would_have_fewer_than_two_teams(client):
    # Two pools of 2 with k=2 fill bracket 1 and leave the catch-all empty.
    tournament_id, pools, _ = _setup(client, [2, 2], advance_per_pool=2, playoff_bracket_count=2)
    for pool in pools:
        _play(client, pool["id"])

    response = _advance(client, tournament_id)

    assert response.status_code == 400
    assert "Bracket 2 would have 0 teams" in response.json()["detail"]
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []

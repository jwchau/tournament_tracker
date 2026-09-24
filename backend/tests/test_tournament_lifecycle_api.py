from tests.helpers import create_tournament


def _stage(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}").json()["stage"]


def _pooled(client, pool_sizes=(2,)):
    """A tournament with pools of seeded teams, no schedules yet."""
    tournament_id = create_tournament(client, "Pool Cup")["id"]
    client.patch(f"/tournaments/{tournament_id}", json={"court_count": len(pool_sizes)})
    pools, seed = [], 1
    for number, size in enumerate(pool_sizes, start=1):
        pool = client.post(f"/tournaments/{tournament_id}/pools", json={"name": f"Pool {number}"}).json()
        for _ in range(size):
            team = client.post(
                f"/tournaments/{tournament_id}/teams", json={"name": f"Team {seed}", "seed": seed}
            ).json()
            client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
            seed += 1
        pools.append(pool)
    return tournament_id, pools


def test_generating_the_first_pool_schedule_starts_pool_play(client):
    tournament_id, [pool] = _pooled(client)
    assert _stage(client, tournament_id) == "draft"

    assert client.post(f"/pools/{pool['id']}/generate-schedule").status_code == 201

    assert _stage(client, tournament_id) == "pool_play"


def test_auto_assign_clearing_every_schedule_goes_back_to_draft(client):
    tournament_id, [pool] = _pooled(client, (4,))
    client.post(f"/pools/{pool['id']}/generate-schedule")

    assert client.post(f"/tournaments/{tournament_id}/pools/auto-assign").status_code == 200

    assert _stage(client, tournament_id) == "draft"


def test_deleting_the_last_scheduled_pool_goes_back_to_draft(client):
    tournament_id, [first, second] = _pooled(client, (2, 2))
    client.post(f"/pools/{first['id']}/generate-schedule")
    client.post(f"/pools/{second['id']}/generate-schedule")

    client.delete(f"/pools/{first['id']}")
    assert _stage(client, tournament_id) == "pool_play"

    client.delete(f"/pools/{second['id']}")
    assert _stage(client, tournament_id) == "draft"


def _bracket(client, team_count, format="single"):
    """A pool-less tournament with a generated bracket; its matches keyed (bracket, round, position)."""
    tournament_id = create_tournament(client, "Bracket Cup")["id"]
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament_id}/teams", json={"name": f"Team {seed}", "seed": seed}
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    response = client.post(f"/tournaments/{tournament_id}/bracket/generate", json={"format": format})
    assert response.status_code == 201, response.json()
    return tournament_id, {(m["bracket"], m["round"], m["position"]): m["id"] for m in response.json()}


def _complete(client, match_id, team1_wins=True):
    match = client.get(f"/matches/{match_id}").json()
    response = client.patch(
        f"/matches/{match_id}/score",
        json={
            "team1_score": 21 if team1_wins else 10,
            "team2_score": 10 if team1_wins else 21,
            "version": match["version"],
            "complete": True,
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()


def _correct(client, match_id, team1_wins):
    match = client.get(f"/matches/{match_id}").json()
    response = client.patch(
        f"/matches/{match_id}/correct",
        json={
            "team1_score": 21 if team1_wins else 15,
            "team2_score": 15 if team1_wins else 21,
            "version": match["version"],
        },
    )
    assert response.status_code == 200, response.json()


def test_the_final_completes_a_single_elimination_tournament(client):
    tournament_id, matches = _bracket(client, 4)
    assert _stage(client, tournament_id) == "playoffs"

    _complete(client, matches[("winners", 1, 1)])
    _complete(client, matches[("winners", 1, 2)])
    assert _stage(client, tournament_id) == "playoffs"

    _complete(client, matches[("winners", 2, 1)])
    assert _stage(client, tournament_id) == "complete"


def test_the_reset_match_decides_double_elimination_not_grand_final_one(client):
    tournament_id, matches = _bracket(client, 2, "double")
    _complete(client, matches[("winners", 1, 1)])

    _complete(client, matches[("grand_final", 1, 1)], team1_wins=False)
    assert _stage(client, tournament_id) == "playoffs"

    reset = next(
        m for m in client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
        for m in client.get(f"/playoff-brackets/{m['id']}/matches").json()
        if m["bracket"] == "grand_final" and m["round"] == 2
    )
    _complete(client, reset["id"])
    assert _stage(client, tournament_id) == "complete"


def test_the_winners_champion_taking_grand_final_one_completes_double_elimination(client):
    tournament_id, matches = _bracket(client, 2, "double")
    _complete(client, matches[("winners", 1, 1)])

    _complete(client, matches[("grand_final", 1, 1)])

    assert _stage(client, tournament_id) == "complete"


def test_correcting_grand_final_one_into_a_reset_goes_back_to_playoffs(client):
    tournament_id, matches = _bracket(client, 2, "double")
    _complete(client, matches[("winners", 1, 1)])
    _complete(client, matches[("grand_final", 1, 1)])

    _correct(client, matches[("grand_final", 1, 1)], team1_wins=False)

    assert _stage(client, tournament_id) == "playoffs"


def test_a_correction_that_undecides_the_champion_goes_back_to_playoffs(client):
    tournament_id, matches = _bracket(client, 4)
    for key in [("winners", 1, 1), ("winners", 1, 2), ("winners", 2, 1)]:
        _complete(client, matches[key])

    _correct(client, matches[("winners", 2, 1)], team1_wins=False)
    assert _stage(client, tournament_id) == "complete"

    _correct(client, matches[("winners", 1, 1)], team1_wins=False)
    assert _stage(client, tournament_id) == "playoffs"

    _complete(client, matches[("winners", 2, 1)])
    assert _stage(client, tournament_id) == "complete"


def test_a_best_of_series_final_completes_the_tournament(client):
    tournament_id = create_tournament(client, "Series Cup")["id"]
    client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": 3})
    for seed in (1, 2):
        team = client.post(
            f"/tournaments/{tournament_id}/teams", json={"name": f"Team {seed}", "seed": seed}
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    [final] = client.post(f"/tournaments/{tournament_id}/bracket/generate").json()

    for _ in range(2):
        version = client.get(f"/matches/{final['id']}").json()["version"]
        client.post(
            f"/matches/{final['id']}/games",
            json={"team1_score": 21, "team2_score": 10, "version": version},
        )

    assert _stage(client, tournament_id) == "complete"


def _advanced(client, tiers):
    """A pooled tournament advanced to `tiers` single-elimination playoff brackets."""
    tournament_id, [pool] = _pooled(client, (2 * tiers,))
    client.patch(
        f"/tournaments/{tournament_id}",
        json={"advance_per_pool": 2, "playoff_bracket_count": tiers},
    )
    client.post(f"/pools/{pool['id']}/generate-schedule")
    for match in client.get(f"/pools/{pool['id']}/matches").json():
        _complete(client, match["id"])
    response = client.post(f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": "single"})
    assert response.status_code == 201, response.json()
    return tournament_id, response.json()


def test_every_playoff_tier_needs_a_champion_to_complete(client):
    tournament_id, [first, second] = _advanced(client, 2)
    assert _stage(client, tournament_id) == "playoffs"

    [first_final] = client.get(f"/playoff-brackets/{first['id']}/matches").json()
    _complete(client, first_final["id"])
    assert _stage(client, tournament_id) == "playoffs"

    [second_final] = client.get(f"/playoff-brackets/{second['id']}/matches").json()
    _complete(client, second_final["id"])
    assert _stage(client, tournament_id) == "complete"


def test_resetting_brackets_goes_back_to_pool_play_after_pools(client):
    tournament_id, _ = _advanced(client, 1)

    assert client.delete(f"/tournaments/{tournament_id}/playoff-brackets").status_code == 204

    assert _stage(client, tournament_id) == "pool_play"


def test_resetting_brackets_goes_back_to_draft_without_pools(client):
    tournament_id, _ = _bracket(client, 4)

    assert client.delete(f"/tournaments/{tournament_id}/playoff-brackets").status_code == 204

    assert _stage(client, tournament_id) == "draft"


def _names(group):
    return [team["name"] for team in group]


def test_results_are_refused_until_the_tournament_is_complete(client):
    tournament_id, matches = _bracket(client, 2)

    response = client.get(f"/tournaments/{tournament_id}/results")

    assert response.status_code == 400
    assert response.json()["detail"] == "the tournament isn't complete yet"


def test_single_elimination_results_group_the_rest_by_the_round_they_went_out(client):
    tournament_id, matches = _bracket(client, 5)
    # Seeds 1, 2 and 3 have first-round byes; 4 beats 5.
    for key in [("winners", 1, 2), ("winners", 2, 1), ("winners", 2, 2), ("winners", 3, 1)]:
        _complete(client, matches[key])

    [tier] = client.get(f"/tournaments/{tournament_id}/results").json()

    assert tier["tier"] == 1
    assert tier["format"] == "single"
    assert tier["champion"]["name"] == "Team 1"
    assert tier["runner_up"]["name"] == "Team 2"
    assert [(g["bracket"], g["round"], _names(g["teams"])) for g in tier["eliminated"]] == [
        ("winners", 2, ["Team 4", "Team 3"]),
        ("winners", 1, ["Team 5"]),
    ]


def test_double_elimination_results_place_teams_by_their_second_loss(client):
    tournament_id, matches = _bracket(client, 3, "double")
    # Seed 1 has a bye; 3 drops into the losers bracket and gets a bye there too.
    _complete(client, matches[("winners", 1, 2)])
    _complete(client, matches[("winners", 2, 1)])
    _complete(client, matches[("losers", 2, 1)], team1_wins=True)
    _complete(client, matches[("grand_final", 1, 1)])

    [tier] = client.get(f"/tournaments/{tournament_id}/results").json()

    assert tier["champion"]["name"] == "Team 1"
    assert tier["runner_up"]["name"] == "Team 3"
    assert [(g["bracket"], g["round"], _names(g["teams"])) for g in tier["eliminated"]] == [
        ("losers", 2, ["Team 2"]),
    ]


def test_double_elimination_results_after_a_reset_match(client):
    tournament_id, matches = _bracket(client, 2, "double")
    _complete(client, matches[("winners", 1, 1)])
    _complete(client, matches[("grand_final", 1, 1)], team1_wins=False)
    reset = next(
        m for m in client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
        for m in client.get(f"/playoff-brackets/{m['id']}/matches").json()
        if m["bracket"] == "grand_final" and m["round"] == 2
    )
    _complete(client, reset["id"])

    [tier] = client.get(f"/tournaments/{tournament_id}/results").json()

    assert tier["champion"]["name"] == "Team 1"
    assert tier["runner_up"]["name"] == "Team 2"
    assert tier["eliminated"] == []


def test_results_list_every_tier_in_order(client):
    tournament_id, brackets = _advanced(client, 2)
    for bracket in brackets:
        [final] = client.get(f"/playoff-brackets/{bracket['id']}/matches").json()
        _complete(client, final["id"])

    results = client.get(f"/tournaments/{tournament_id}/results").json()

    assert [tier["tier"] for tier in results] == [1, 2]
    assert [tier["playoff_bracket_id"] for tier in results] == [b["id"] for b in brackets]

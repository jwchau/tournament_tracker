from tests.test_bracket_api import _create_tournament_with_teams
from tests.test_playoff_advancement_api import _advance, _bracket_teams, _first_match, _play, _setup


def _seeding(client, tournament_id):
    return client.get(f"/tournaments/{tournament_id}/playoff-seeding").json()


def _team_ids(seeding):
    return [[entry["team_id"] for entry in tier["teams"]] for tier in seeding["tiers"]]


def test_the_seeding_preview_lists_each_bracket_in_the_order_it_would_start_with(client):
    tournament_id, [pool], [teams] = _setup(client, [6], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])

    seeding = _seeding(client, tournament_id)

    assert seeding["ready"] is True
    assert seeding["reason"] is None
    assert [tier["tier"] for tier in seeding["tiers"]] == [1, 2]
    assert _team_ids(seeding) == [teams[:2], teams[2:]]
    first = seeding["tiers"][0]["teams"][0]
    assert first["pool"] == pool["name"]
    assert first["pool_rank"] == 1
    assert first["name"]


def test_the_seeding_preview_says_why_it_is_not_ready(client):
    tournament_id, pools, _ = _setup(client, [3, 3], advance_per_pool=1, playoff_bracket_count=2)
    _play(client, pools[0]["id"])

    seeding = _seeding(client, tournament_id)

    assert seeding["ready"] is False
    assert "incomplete" in seeding["reason"]
    assert seeding["tiers"] == []


def test_advancing_with_a_changed_seeding_starts_the_bracket_in_that_order(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=4, playoff_bracket_count=1)
    _play(client, pool["id"])
    [tier] = _team_ids(_seeding(client, tournament_id))
    reordered = [tier[3], tier[1], tier[2], tier[0]]

    response = client.post(
        f"/tournaments/{tournament_id}/advance-to-playoffs",
        json={"format": "single", "seeding": [reordered]},
    )

    assert response.status_code == 201
    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    # Seed 1 meets seed 4 in the first match.
    first = _first_match(client, bracket["id"])
    assert (first["team1_id"], first["team2_id"]) == (reordered[0], reordered[3])


def test_a_seeding_that_moves_a_team_to_another_bracket_is_refused(client):
    tournament_id, [pool], _ = _setup(client, [6], advance_per_pool=2, playoff_bracket_count=2)
    _play(client, pool["id"])
    first, second = _team_ids(_seeding(client, tournament_id))

    response = client.post(
        f"/tournaments/{tournament_id}/advance-to-playoffs",
        json={"format": "single", "seeding": [[first[0], second[0]], [first[1], *second[1:]]]},
    )

    assert response.status_code == 400
    assert "same teams" in response.json()["detail"]
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []
    assert client.get(f"/tournaments/{tournament_id}").json()["stage"] != "playoffs"


def test_a_seeding_with_a_missing_or_repeated_team_is_refused(client):
    tournament_id, [pool], _ = _setup(client, [4], advance_per_pool=4, playoff_bracket_count=1)
    _play(client, pool["id"])
    [tier] = _team_ids(_seeding(client, tournament_id))

    for bad in ([tier[:3]], [[tier[0], tier[0], tier[1], tier[2]]], [tier, tier], []):
        response = client.post(
            f"/tournaments/{tournament_id}/advance-to-playoffs",
            json={"format": "single", "seeding": bad},
        )
        assert response.status_code == 400
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []


def test_advancing_without_a_seeding_still_uses_the_standings_order(client):
    tournament_id, [pool], [teams] = _setup(client, [4], advance_per_pool=4, playoff_bracket_count=1)
    _play(client, pool["id"])

    assert _advance(client, tournament_id).status_code == 201

    [bracket] = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    first = _first_match(client, bracket["id"])
    assert (first["team1_id"], first["team2_id"]) == (teams[0], teams[3])
    assert _bracket_teams(client, bracket["id"]) == set(teams)


def test_a_tournament_without_pools_previews_its_teams_by_seed_and_can_reorder_them(client):
    tournament, teams = _create_tournament_with_teams(
        client, [(1, "Ice Wolves"), (2, "Fire Hawks"), (3, "Sand Sharks"), (4, "Reef Rays")]
    )
    by_seed = [team["id"] for team in teams]

    seeding = _seeding(client, tournament["id"])

    assert seeding["ready"] is True
    assert _team_ids(seeding) == [by_seed]
    assert seeding["tiers"][0]["teams"][0]["pool"] is None

    reordered = [by_seed[2], by_seed[0], by_seed[1], by_seed[3]]
    response = client.post(
        f"/tournaments/{tournament['id']}/bracket/generate",
        json={"format": "single", "seeding": [reordered]},
    )

    assert response.status_code == 201
    first = next(m for m in response.json() if m["round"] == 1 and m["position"] == 1)
    assert (first["team1_id"], first["team2_id"]) == (reordered[0], reordered[3])


def test_the_preview_for_a_tournament_without_pools_says_when_teams_are_not_ready(client):
    tournament, _ = _create_tournament_with_teams(client, [(1, "Ice Wolves")])

    seeding = _seeding(client, tournament["id"])

    assert seeding["ready"] is False
    assert seeding["reason"]

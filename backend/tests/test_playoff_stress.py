"""Stress tests for the pool -> playoff transition across many tournament settings.

Every scenario builds a tournament through the API, plays its pools with
seeded random scores, advances, and then checks the result against an
independent model of the PRD §5 rules: which teams land in each tier, how
each tier is seeded, how many match rows its bracket has, and that every
tier plays out to exactly one champion.

Slow, so skipped by default; run with `pytest -m stress`.
"""

import random
from dataclasses import dataclass

import pytest

pytestmark = pytest.mark.stress


@dataclass(frozen=True)
class Settings:
    pool_sizes: tuple[int, ...]
    advance_per_pool: int
    bracket_count: int
    court_count: int
    games_per_pairing: int = 1


# --- building and playing a tournament through the API ---------------------


def _build(client, settings: Settings) -> tuple[int, list[dict]]:
    tournament_id = client.post("/tournaments", json={"name": "Stress Cup"}).json()["id"]
    client.patch(
        f"/tournaments/{tournament_id}",
        json={
            "advance_per_pool": settings.advance_per_pool,
            "playoff_bracket_count": settings.bracket_count,
            "court_count": settings.court_count,
        },
    )
    pools, seed = [], 1
    for number, size in enumerate(settings.pool_sizes, start=1):
        pool = client.post(f"/tournaments/{tournament_id}/pools", json={"name": f"Pool {number}"}).json()
        for _ in range(size):
            team = client.post(
                f"/tournaments/{tournament_id}/teams", json={"name": f"Team {seed}", "seed": seed}
            ).json()
            client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
            seed += 1
        if size >= 2:
            client.post(
                f"/pools/{pool['id']}/generate-schedule", json={"n": settings.games_per_pairing}
            )
        pools.append(pool)
    return tournament_id, pools


def _complete(client, match, rng, winner_slot=None):
    """Complete a match with a random (never tied) score; returns the response."""
    winner_slot = winner_slot or rng.choice((1, 2))
    loser_points = rng.randint(0, 19)
    team1_score, team2_score = (21, loser_points) if winner_slot == 1 else (loser_points, 21)
    return client.patch(
        f"/matches/{match['id']}/score",
        json={
            "team1_score": team1_score,
            "team2_score": team2_score,
            "version": match["version"],
            "complete": True,
        },
    )


def _play_pools(client, pools, rng, skip_last=False):
    matches = [m for pool in pools for m in client.get(f"/pools/{pool['id']}/matches").json()]
    for match in matches[:-1] if skip_last else matches:
        assert _complete(client, match, rng).status_code == 200


def _standings(client, pools) -> list[list[dict]]:
    return [client.get(f"/pools/{pool['id']}/standings").json() for pool in pools]


def _advance(client, tournament_id, format):
    return client.post(f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": format})


def _tier_matches(client, bracket_id):
    return client.get(f"/playoff-brackets/{bracket_id}/matches").json()


# --- the independent model -----------------------------------------------


def expected_tiers(standings: list[list[dict]], k: int, bracket_count: int) -> list[list[int]]:
    """PRD §5: ranks split into tiers of k per pool, the last tier a catch-all,
    each tier seeded by points, differential, then points scored (pool order on ties)."""
    tiers = [[] for _ in range(bracket_count)]
    for rows in standings:
        for rank, row in enumerate(rows):
            tiers[min(rank // k, bracket_count - 1)].append(row)
    return [
        [
            row["team_id"]
            for row in sorted(tier, key=lambda r: (-r["points"], -r["point_diff"], -r["points_for"]))
        ]
        for tier in tiers
    ]


def _bracket_size(team_count):
    size = 1
    while size < team_count:
        size *= 2
    return size


def expected_match_rows(team_count, format):
    size = _bracket_size(team_count)
    return size - 1 if format == "single" else 2 * size - 2


def expected_first_round(seeds: list[int]) -> set[frozenset]:
    """Standard seeding pairs seed s with seed P+1-s; a missing seed is a bye (None)."""
    size = _bracket_size(len(seeds))

    def team(seed):
        return seeds[seed - 1] if seed <= len(seeds) else None

    return {frozenset((team(s), team(size + 1 - s))) for s in range(1, size // 2 + 1)}


# --- invariants checked on every advanced tournament ----------------------


def _play_out(client, bracket_id, rng):
    """Score ready matches at random until nothing is left to play."""
    for _ in range(500):
        playable = [
            m
            for m in _tier_matches(client, bracket_id)
            if m["status"] in ("ready", "in_progress") and m["team1_id"] and m["team2_id"]
        ]
        if not playable:
            return
        assert _complete(client, rng.choice(playable), rng).status_code == 200
    raise AssertionError("tier never finished")


def _losses(matches) -> dict[int, int]:
    losses = {}
    for m in matches:
        for team in (m["team1_id"], m["team2_id"]):
            if team is not None:
                losses.setdefault(team, 0)
        if m["status"] == "complete" and m["team1_id"] and m["team2_id"]:
            loser = m["team2_id"] if m["winner_id"] == m["team1_id"] else m["team1_id"]
            losses[loser] += 1
    return losses


def assert_tier_plays_to_one_champion(client, bracket_id, format, team_ids, rng):
    _play_out(client, bracket_id, rng)
    matches = _tier_matches(client, bracket_id)
    assert all(m["status"] == "complete" for m in matches), "a match was left unplayed"

    losses = _losses(matches)
    assert set(losses) == set(team_ids)
    unbeaten_limit = 0 if format == "single" else 1
    eliminated_at = 1 if format == "single" else 2
    champions = [team for team, count in losses.items() if count <= unbeaten_limit]
    assert len(champions) == 1, f"champions: {champions}, losses: {losses}"
    assert all(count == eliminated_at for team, count in losses.items() if team != champions[0])


def assert_advanced_correctly(client, tournament_id, pools, settings, format, rng):
    tiers = expected_tiers(
        _standings(client, pools), settings.advance_per_pool, settings.bracket_count
    )
    response = _advance(client, tournament_id, format)
    assert response.status_code == 201, response.json()

    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()
    assert [b["tier"] for b in brackets] == list(range(1, settings.bracket_count + 1))
    assert {b["format"] for b in brackets} == {format}
    tournament = client.get(f"/tournaments/{tournament_id}").json()
    assert (tournament["stage"], tournament["format"]) == ("playoffs", format)

    all_teams = [row["team_id"] for rows in _standings(client, pools) for row in rows]
    assert sorted(t for tier in tiers for t in tier) == sorted(all_teams)

    for bracket, seeds in zip(brackets, tiers):
        matches = _tier_matches(client, bracket["id"])
        assert len(matches) == expected_match_rows(len(seeds), format)
        first_round = {
            frozenset((m["team1_id"], m["team2_id"]))
            for m in matches
            if m["bracket"] == "winners" and m["round"] == 1
        }
        assert first_round == expected_first_round(seeds), f"tier {bracket['tier']} seeding"
    for bracket, seeds in zip(brackets, tiers):
        assert_tier_plays_to_one_champion(client, bracket["id"], format, seeds, rng)


# --- valid scenarios --------------------------------------------------------

SCENARIOS = {
    "S1 one catch-all bracket": Settings((4, 4), 2, 1, 2),
    "S2 even pools": Settings((4, 4), 2, 2, 2),
    "S3 uneven pools": Settings((5, 3), 2, 2, 2),
    "S4 three tiers, two-team catch-all": Settings((5, 5, 4), 2, 3, 3),
    "S5 four byes per tier": Settings((6, 6, 6, 6), 3, 2, 8),
    "S6 k=4, catch-all with 3 byes": Settings((8, 5), 4, 2, 4),
    "S7 four tiers": Settings((7, 7, 6), 2, 4, 6),
    "S8 big pools, k=3, four tiers": Settings((10, 10), 3, 4, 2),
    "S9 volume, two games per pairing": Settings((8, 8, 8, 8), 4, 2, 8, games_per_pairing=2),
    "S10 uneven court split": Settings((4, 4, 4), 2, 2, 5),
    "E1 single-team pool": Settings((5, 1), 2, 2, 2),
}


@pytest.mark.parametrize("format", ["single", "double"])
@pytest.mark.parametrize("settings", SCENARIOS.values(), ids=SCENARIOS.keys())
def test_scenario_advances_and_plays_out(client, settings, format):
    rng = random.Random(f"{settings}-{format}")
    tournament_id, pools = _build(client, settings)
    _play_pools(client, pools, rng)

    assert client.get(f"/tournaments/{tournament_id}/playoff-readiness").json()["ready"]
    assert_advanced_correctly(client, tournament_id, pools, settings, format, rng)


@pytest.mark.parametrize("format", ["single", "double"])
def test_random_settings_sweep(client, format):
    """Seeded random settings; each one either advances correctly or is refused with a reason."""
    rng = random.Random(f"sweep-{format}")
    for _ in range(25):
        pool_count = rng.randint(1, 4)
        settings = Settings(
            pool_sizes=tuple(rng.randint(2, 8) for _ in range(pool_count)),
            advance_per_pool=rng.randint(2, 4),
            bracket_count=rng.randint(1, 4),
            court_count=rng.randint(pool_count, 8),
        )
        tournament_id, pools = _build(client, settings)
        _play_pools(client, pools, rng)
        tiers = expected_tiers(
            _standings(client, pools), settings.advance_per_pool, settings.bracket_count
        )
        readiness = client.get(f"/tournaments/{tournament_id}/playoff-readiness").json()

        if min(len(tier) for tier in tiers) < 2:
            assert not readiness["ready"], settings
            assert _advance(client, tournament_id, format).status_code == 400, settings
        else:
            assert readiness["ready"], (settings, readiness)
            assert_advanced_correctly(client, tournament_id, pools, settings, format, rng)


def test_identical_pools_fall_back_to_pool_order(client):
    """E2: every tie-breaker level across pools, so each tier keeps pool order."""
    settings = Settings((3, 3), 1, 3, 2)
    tournament_id, pools = _build(client, settings)
    for pool in pools:
        for match in client.get(f"/pools/{pool['id']}/matches").json():
            # The lower id (earlier-created team) always wins 21-10 in both pools.
            slot = 1 if match["team1_id"] < match["team2_id"] else 2
            response = client.patch(
                f"/matches/{match['id']}/score",
                json={
                    "team1_score": 21 if slot == 1 else 10,
                    "team2_score": 10 if slot == 1 else 21,
                    "version": match["version"],
                    "complete": True,
                },
            )
            assert response.status_code == 200
    first_pool, second_pool = _standings(client, pools)

    brackets = _advance(client, tournament_id, "single").json()

    for bracket, rank in zip(brackets, range(3)):
        [final] = _tier_matches(client, bracket["id"])
        assert (final["team1_id"], final["team2_id"]) == (
            first_pool[rank]["team_id"],
            second_pool[rank]["team_id"],
        )


def test_brackets_ignore_setting_changes_and_pool_corrections_after_advancing(client):
    """E4 and E5: advancing is a one-off snapshot of the standings."""
    rng = random.Random("snapshot")
    settings = Settings((4, 4), 2, 2, 2)
    tournament_id, pools = _build(client, settings)
    _play_pools(client, pools, rng)
    brackets = _advance(client, tournament_id, "double").json()
    before = [_tier_matches(client, b["id"]) for b in brackets]

    client.patch(
        f"/tournaments/{tournament_id}",
        json={"advance_per_pool": 3, "playoff_bracket_count": 4, "court_count": 8},
    )
    pool_match = client.get(f"/pools/{pools[0]['id']}/matches").json()[0]
    flipped = 2 if pool_match["winner_id"] == pool_match["team1_id"] else 1
    correction = client.patch(
        f"/matches/{pool_match['id']}/correct",
        json={
            "team1_score": 21 if flipped == 1 else 5,
            "team2_score": 5 if flipped == 1 else 21,
            "version": pool_match["version"],
        },
    )
    assert correction.status_code == 200

    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == brackets
    assert [_tier_matches(client, b["id"]) for b in brackets] == before


# --- refusals ---------------------------------------------------------------

REFUSALS = {
    "R1 empty catch-all": (Settings((4, 4, 4, 4), 4, 2, 4), "Bracket 2 would have 0 teams"),
    "R2 one-team catch-all": (Settings((3, 2), 2, 2, 2), "Bracket 2 would have 1 team;"),
    "R3 pool left without a court": (Settings((3, 3, 3), 1, 2, 2), "Pool 3 has no schedule yet"),
}


@pytest.mark.parametrize("settings, reason", REFUSALS.values(), ids=REFUSALS.keys())
def test_refused_settings_explain_why_and_create_nothing(client, settings, reason):
    tournament_id, pools = _build(client, settings)
    _play_pools(client, pools, random.Random(reason))

    readiness = client.get(f"/tournaments/{tournament_id}/playoff-readiness").json()
    response = _advance(client, tournament_id, "double")

    assert not readiness["ready"] and reason in readiness["reason"]
    assert response.status_code == 400 and reason in response.json()["detail"]
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == []
    assert client.get(f"/tournaments/{tournament_id}").json()["stage"] == "draft"


def test_one_unplayed_pool_match_blocks_advancing(client):
    """R4"""
    tournament_id, pools = _build(client, Settings((6, 5), 2, 2, 4))
    _play_pools(client, pools, random.Random("r4"), skip_last=True)

    response = _advance(client, tournament_id, "single")

    assert response.status_code == 400
    assert response.json()["detail"] == "Pool 2 has incomplete matches"


def test_advancing_twice_is_refused(client):
    """R5"""
    tournament_id, pools = _build(client, Settings((4, 4), 2, 2, 2))
    _play_pools(client, pools, random.Random("r5"))
    first = _advance(client, tournament_id, "single").json()

    response = _advance(client, tournament_id, "double")

    assert response.status_code == 400
    assert client.get(f"/tournaments/{tournament_id}/playoff-brackets").json() == first


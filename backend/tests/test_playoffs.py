import pytest

from app.playoffs import playoff_tiers, pool_split
from app.pools import StandingsRow


def _row(team_id, played, wins, points_for, points_against):
    return StandingsRow(
        team_id=team_id,
        name=f"Team {team_id}",
        played=played,
        wins=wins,
        losses=played - wins,
        points=3 * wins,
        points_for=points_for,
        points_against=points_against,
    )


def test_pool_winners_from_pools_of_different_sizes_are_seeded_per_match_played():
    # From the dress rehearsal: Servers won a pool of 5 (3–1, 9 points, +11
    # over 4 matches); Setters won a pool of 4 unbeaten (3–0, 9 points, +10
    # over 3). Setters did better per match, so they're seeded first.
    servers = _row(1, played=4, wins=3, points_for=82, points_against=71)
    setters = _row(2, played=3, wins=3, points_for=68, points_against=58)

    [tier] = playoff_tiers([[servers], [setters]], advance_per_pool=1, bracket_count=1)

    assert tier == [2, 1]


def test_equal_points_per_match_fall_back_to_point_differential_per_match():
    # Both win every match; the pool of 3's winner does it by more per match.
    big = _row(1, played=4, wins=4, points_for=84, points_against=64)  # +5 per match
    small = _row(2, played=2, wins=2, points_for=42, points_against=26)  # +8 per match

    [tier] = playoff_tiers([[big], [small]], advance_per_pool=1, bracket_count=1)

    assert tier == [2, 1]


def test_then_points_scored_per_match():
    big = _row(1, played=4, wins=2, points_for=80, points_against=80)  # 20 per match
    small = _row(2, played=2, wins=1, points_for=44, points_against=44)  # 22 per match

    [tier] = playoff_tiers([[big], [small]], advance_per_pool=1, bracket_count=1)

    assert tier == [2, 1]


def test_teams_level_per_match_keep_pool_order():
    first = _row(1, played=4, wins=2, points_for=84, points_against=84)
    second = _row(2, played=2, wins=1, points_for=42, points_against=42)

    [tier] = playoff_tiers([[first], [second]], advance_per_pool=1, bracket_count=1)

    assert tier == [1, 2]


@pytest.mark.parametrize(
    ("pool_size", "advance", "brackets", "expected"),
    [
        # A number of places: ranks 1..k to bracket 1, and so on; the last takes the rest.
        (6, 2, 2, [2, 4]),
        (6, 2, 3, [2, 2, 2]),
        (5, 3, 3, [3, 2, 0]),
        (8, 4, 1, [8]),
        # Automatic: an even split, the extras going to the later brackets.
        (7, 0, 2, [3, 4]),
        (8, 0, 3, [2, 3, 3]),
        (6, 0, 3, [2, 2, 2]),
        (6, 0, 4, [1, 1, 2, 2]),
        (4, 0, 1, [4]),
        # Fewer teams than brackets: one each to the first brackets.
        (2, 0, 3, [1, 1, 0]),
        (1, 0, 2, [1, 0]),
    ],
)
def test_a_pool_is_split_across_the_brackets(pool_size, advance, brackets, expected):
    sizes = pool_split(pool_size, advance, brackets)

    assert sizes == expected
    assert sum(sizes) == pool_size


def test_automatic_tiers_take_each_pools_teams_in_rank_order():
    pool_a = [_row(team_id, 3, 3 - index, 30, 10) for index, team_id in enumerate([1, 2, 3, 4])]
    pool_b = [_row(team_id, 3, 3 - index, 30, 10) for index, team_id in enumerate([5, 6, 7, 8, 9])]

    tiers = playoff_tiers([pool_a, pool_b], 0, 2)

    # A pool of 4 sends 2 and 2; a pool of 5 sends 2 and 3.
    assert {team for team in tiers[0]} == {1, 2, 5, 6}
    assert {team for team in tiers[1]} == {3, 4, 7, 8, 9}

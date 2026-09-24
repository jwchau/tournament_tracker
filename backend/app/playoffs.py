from fractions import Fraction

from app.pools import StandingsRow


def playoff_tiers(
    pool_standings: list[list[StandingsRow]], advance_per_pool: int, bracket_count: int
) -> list[list[int]]:
    """Team ids for each playoff bracket, tier 1 first.

    Each pool's ranks 1..k go to bracket 1, k+1..2k to bracket 2, and so on;
    the last bracket is a catch-all taking every remaining rank.

    Each tier's list is its seed order: teams from different pools never
    played each other, so they're ranked on points, then point differential,
    then points scored. Each is taken per match played, since pools of
    different sizes play different numbers of matches. Teams level on all
    three keep pool order.
    """
    tiers: list[list[StandingsRow]] = [[] for _ in range(bracket_count)]
    for standings in pool_standings:
        for index, row in enumerate(standings):
            tier = min(index // advance_per_pool, bracket_count - 1)
            tiers[tier].append(row)
    return [
        [row.team_id for row in sorted(tier, key=_per_match_rank)] for tier in tiers
    ]


def _per_match_rank(row: StandingsRow) -> tuple[Fraction, Fraction, Fraction]:
    # A team with no matches (a pool of one) ranks as if it played one.
    played = max(row.played, 1)
    return (
        -Fraction(row.points, played),
        -Fraction(row.point_diff, played),
        -Fraction(row.points_for, played),
    )

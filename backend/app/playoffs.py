from fractions import Fraction

from app.pools import StandingsRow


def pool_split(pool_size: int, advance_per_pool: int, bracket_count: int) -> list[int]:
    """How many of a pool's teams go to each bracket, best ranks first.

    With advance_per_pool set, ranks 1..k go to bracket 1, k+1..2k to bracket 2,
    and so on; the last bracket is a catch-all taking every remaining rank.

    With 0 (automatic) the pool is split evenly, and the teams left over go
    to the later brackets, one each: 7 teams over 2 brackets is 3 and 4, and 8
    over 3 is 2, 3 and 3. A pool with fewer teams than brackets sends one team
    to each of the first brackets.
    """
    if advance_per_pool > 0:
        sizes, left = [], pool_size
        for index in range(bracket_count):
            take = left if index == bracket_count - 1 else min(advance_per_pool, left)
            sizes.append(take)
            left -= take
        return sizes
    base, extra = divmod(pool_size, bracket_count)
    if base == 0:
        return [1] * pool_size + [0] * (bracket_count - pool_size)
    return [base + (1 if index >= bracket_count - extra else 0) for index in range(bracket_count)]


def playoff_tiers(
    pool_standings: list[list[StandingsRow]], advance_per_pool: int, bracket_count: int
) -> list[list[int]]:
    """Team ids for each playoff bracket, tier 1 first (see pool_split for who goes where).

    Each tier's list is its seed order: teams from different pools never
    played each other, so they're ranked on points, then point differential,
    then points scored. Each is taken per match played, since pools of
    different sizes play different numbers of matches. Teams level on all
    three keep pool order.
    """
    tiers: list[list[StandingsRow]] = [[] for _ in range(bracket_count)]
    for standings in pool_standings:
        ranked = iter(standings)
        for tier, size in zip(tiers, pool_split(len(standings), advance_per_pool, bracket_count)):
            tier.extend(next(ranked) for _ in range(size))
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

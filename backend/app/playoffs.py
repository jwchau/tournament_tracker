from app.pools import StandingsRow


def playoff_tiers(
    pool_standings: list[list[StandingsRow]], advance_per_pool: int, bracket_count: int
) -> list[list[int]]:
    """Team ids for each playoff bracket, tier 1 first.

    Each pool's ranks 1..k go to bracket 1, k+1..2k to bracket 2, and so on;
    the last bracket is a catch-all taking every remaining rank.

    Each tier's list is its seed order: teams from different pools never
    played each other, so they're ranked on points, then point differential,
    then points scored. Teams level on all three keep pool order.
    """
    tiers: list[list[StandingsRow]] = [[] for _ in range(bracket_count)]
    for standings in pool_standings:
        for index, row in enumerate(standings):
            tier = min(index // advance_per_pool, bracket_count - 1)
            tiers[tier].append(row)
    return [
        [
            row.team_id
            for row in sorted(
                tier, key=lambda row: (-row.points, -row.point_diff, -row.points_for)
            )
        ]
        for tier in tiers
    ]

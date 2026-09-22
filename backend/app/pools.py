import random
from dataclasses import dataclass
from itertools import combinations


@dataclass(frozen=True)
class ScheduledMatch:
    team1_id: int
    team2_id: int
    court: int


SEARCH_ATTEMPTS = 300

Pairing = tuple[int, int]


def generate_round_robin(
    team_ids: list[int], courts: list[int], n: int
) -> list[list[ScheduledMatch]]:
    """A pool's round-robin as a list of slots, each holding simultaneous matches.

    Pairings are grouped into rounds of up to one pairing per court, with no
    team in two pairings of the same round. Each round runs for `n`
    consecutive slots, so every pairing plays its `n` matches back-to-back
    on one court. Filling the courts comes first: several seeded-random
    orderings are tried and the one needing the fewest rounds wins.
    """
    rng = random.Random(0)
    pairings = list(combinations(team_ids, 2))
    best, best_score = None, None
    for _ in range(SEARCH_ATTEMPTS):
        rounds = _schedule_attempt(team_ids, pairings, len(courts), n, rng)
        score = (len(rounds), _rotation_violations(rounds, team_ids, n))
        if best_score is None or score < best_score:
            best, best_score = rounds, score

    slots = []
    for round_pairings in best:
        for _ in range(n):
            slots.append(
                [
                    ScheduledMatch(team1, team2, court)
                    for (team1, team2), court in zip(round_pairings, courts)
                ]
            )
    return slots


MAX_RUN = 2


def _schedule_attempt(
    team_ids: list[int],
    pairings: list[Pairing],
    court_count: int,
    n: int,
    rng: random.Random,
) -> list[list[Pairing]]:
    """One randomized greedy pass: fill each round with the most urgent pairings.

    Urgency favours teams that have been idle longest (above all, ones whose
    idle run would otherwise pass the limit) and avoids teams on a playing
    run that would pass it. A little random jitter makes each attempt differ.
    """
    remaining = list(pairings)
    # Each team's current run: (playing?, length in slots).
    runs = {team: (False, 0) for team in team_ids}

    def urgency(pairing: Pairing) -> float:
        total = 0.0
        for team in pairing:
            playing, length = runs[team]
            over_limit = length + n > MAX_RUN
            total += -length - (10 if over_limit else 0) if playing else length + (
                10 if over_limit else 0
            )
        return total + rng.random() * 3

    rounds = []
    while remaining:
        remaining.sort(key=urgency, reverse=True)
        chosen, busy = [], set()
        for pairing in remaining:
            if len(chosen) == court_count:
                break
            if busy.isdisjoint(pairing):
                chosen.append(pairing)
                busy.update(pairing)
        remaining = [pairing for pairing in remaining if pairing not in chosen]
        rounds.append(chosen)
        for team in team_ids:
            playing = team in busy
            was_playing, length = runs[team]
            runs[team] = (playing, length + n if playing == was_playing else n)
    return rounds


def _rotation_violations(rounds: list[list[Pairing]], team_ids: list[int], n: int) -> int:
    """Slots beyond MAX_RUN in a row of playing or idle, summed over teams."""
    total = 0
    for team in team_ids:
        states = [any(team in pairing for pairing in round_) for round_ in rounds]
        length = 0
        for index, state in enumerate(states):
            length = length + n if index and state == states[index - 1] else n
            ends_run = index == len(states) - 1 or states[index + 1] != state
            if ends_run:
                total += max(0, length - MAX_RUN)
    return total


def pool_courts(court_count: int, pool_count: int) -> list[list[int]]:
    """Court numbers each pool gets, in pool creation order.

    Courts are split as evenly as possible; the remainder goes one each to
    the earliest pools. Numbering runs across pools (pool 1 gets 1..a, pool
    2 gets a+1..b, ...). With fewer courts than pools, the later pools get
    none and can't be scheduled.
    """
    base, extra = divmod(court_count, pool_count) if pool_count else (0, 0)
    courts, next_court = [], 1
    for index in range(pool_count):
        size = base + (1 if index < extra else 0)
        courts.append(list(range(next_court, next_court + size)))
        next_court += size
    return courts


def snake_assign(team_ids: list[int], pool_ids: list[int]) -> dict[int, int]:
    """Deal teams (best seed first) into pools in a snake: 1..P, then P..1, ...

    Returns team id -> pool id. Pools end up different sizes when the team
    count doesn't divide evenly.
    """
    assignment = {}
    for index, team_id in enumerate(team_ids):
        lap, offset = divmod(index, len(pool_ids))
        position = offset if lap % 2 == 0 else len(pool_ids) - 1 - offset
        assignment[team_id] = pool_ids[position]
    return assignment


WIN_POINTS = 3


@dataclass
class StandingsRow:
    team_id: int
    name: str
    played: int = 0
    wins: int = 0
    losses: int = 0
    points: int = 0
    points_for: int = 0
    points_against: int = 0
    rank: int = 0

    @property
    def point_diff(self) -> int:
        return self.points_for - self.points_against


def _head_to_head_points(rows, matches: list) -> dict[int, int]:
    """Points each team earned only against teams level with it on points.

    For a two-way tie that's just who won their meeting(s); for a larger tie
    it's a mini-table of the games among the tied teams.
    """
    points_of = {row.team_id: row.points for row in rows}
    earned = {team_id: 0 for team_id in points_of}
    for match in matches:
        if match.status != "complete":
            continue
        if match.team1_id not in points_of or match.team2_id not in points_of:
            continue
        if points_of[match.team1_id] == points_of[match.team2_id]:
            earned[match.winner_id] += WIN_POINTS
    return earned


def pool_standings(teams: list[tuple[int, str]], matches: list) -> list[StandingsRow]:
    """Rank a pool's teams from its completed matches: win = 3, loss = 0.

    Teams level on points are separated by head-to-head among just those
    teams, then point differential over the whole pool, then points scored.
    """
    rows = {team_id: StandingsRow(team_id, name) for team_id, name in teams}
    for match in matches:
        if match.status != "complete":
            continue
        for team_id, scored, conceded in (
            (match.team1_id, match.team1_score, match.team2_score),
            (match.team2_id, match.team2_score, match.team1_score),
        ):
            # A team moved to another pool after playing keeps no row here.
            row = rows.get(team_id)
            if row is None:
                continue
            row.played += 1
            row.points_for += scored
            row.points_against += conceded
            if match.winner_id == team_id:
                row.wins += 1
                row.points += WIN_POINTS
            else:
                row.losses += 1

    head_to_head = _head_to_head_points(rows.values(), matches)
    ranked = sorted(
        rows.values(),
        key=lambda row: (
            -row.points,
            -head_to_head[row.team_id],
            -row.point_diff,
            -row.points_for,
        ),
    )
    for rank, row in enumerate(ranked, start=1):
        row.rank = rank
    return ranked

from dataclasses import dataclass


@dataclass
class GeneratedMatch:
    round: int
    position: int
    team1_id: int | None
    team2_id: int | None
    status: str
    winner_id: int | None
    winner_next: tuple[int, int, int] | None


def _seed_order(bracket_size: int) -> list[int]:
    if bracket_size == 1:
        return [1]

    half = _seed_order(bracket_size // 2)
    order = []
    for seed in half:
        order.append(seed)
        order.append(bracket_size + 1 - seed)
    return order


def _next_power_of_two(n: int) -> int:
    size = 1
    while size < n:
        size *= 2
    return size


def _winner_next(round_: int, position: int, num_rounds: int) -> tuple[int, int, int] | None:
    if round_ >= num_rounds:
        return None
    next_position = (position + 1) // 2
    slot = 1 if position % 2 == 1 else 2
    return (round_ + 1, next_position, slot)


def generate_single_elimination(team_ids: list[int]) -> dict[tuple[int, int], GeneratedMatch]:
    bracket_size = _next_power_of_two(len(team_ids))
    order = _seed_order(bracket_size)
    num_rounds = bracket_size.bit_length() - 1

    def team_for_seed(seed: int) -> int | None:
        return team_ids[seed - 1] if seed <= len(team_ids) else None

    matches: dict[tuple[int, int], GeneratedMatch] = {}

    round1_size = bracket_size // 2
    for position in range(1, round1_size + 1):
        seed1 = order[2 * (position - 1)]
        seed2 = order[2 * (position - 1) + 1]
        team1 = team_for_seed(seed1)
        team2 = team_for_seed(seed2)

        if team1 is None or team2 is None:
            status = "complete"
            winner_id = team1 if team1 is not None else team2
        else:
            status = "ready"
            winner_id = None

        matches[(1, position)] = GeneratedMatch(
            round=1,
            position=position,
            team1_id=team1,
            team2_id=team2,
            status=status,
            winner_id=winner_id,
            winner_next=_winner_next(1, position, num_rounds),
        )

    for round_ in range(2, num_rounds + 1):
        size = bracket_size // (2**round_)
        for position in range(1, size + 1):
            matches[(round_, position)] = GeneratedMatch(
                round=round_,
                position=position,
                team1_id=None,
                team2_id=None,
                status="pending",
                winner_id=None,
                winner_next=_winner_next(round_, position, num_rounds),
            )

    for match in matches.values():
        if match.status == "complete" and match.winner_next is not None:
            next_round, next_position, slot = match.winner_next
            next_match = matches[(next_round, next_position)]
            if slot == 1:
                next_match.team1_id = match.winner_id
            else:
                next_match.team2_id = match.winner_id

            if next_match.team1_id is not None and next_match.team2_id is not None:
                next_match.status = "ready"

    return matches

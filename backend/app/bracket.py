from dataclasses import dataclass

from app.models import Player, Team


class BracketNotReady(Exception):
    pass


def validate_teams_for_bracket(teams: list[Team], players: list[Player]) -> None:
    if len(teams) < 2:
        raise BracketNotReady("at least 2 teams are required to generate a bracket")

    teams_with_players = {player.team_id for player in players}
    missing = [team.name for team in teams if team.id not in teams_with_players]
    if missing:
        raise BracketNotReady(
            "every team needs at least one player before generating a bracket: "
            + ", ".join(missing)
        )


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


MatchKey = tuple[str, int, int]
SlotRef = tuple[str, int, int, int]


@dataclass
class BracketMatch:
    bracket: str
    round: int
    position: int
    team1_id: int | None
    team2_id: int | None
    status: str
    winner_id: int | None
    winner_next: SlotRef | None
    loser_next: SlotRef | None = None


def _pending(bracket: str, round_: int, position: int) -> BracketMatch:
    return BracketMatch(bracket, round_, position, None, None, "pending", None, None)


def generate_bracket(team_ids: list[int], format: str) -> dict[MatchKey, BracketMatch]:
    if format == "double":
        return generate_double_elimination(team_ids)
    return _as_winners_bracket(generate_single_elimination(team_ids), final_next=None)


def _as_winners_bracket(
    winners: dict[tuple[int, int], GeneratedMatch], final_next: SlotRef | None
) -> dict[MatchKey, BracketMatch]:
    return {
        ("winners", round_, position): BracketMatch(
            "winners",
            round_,
            position,
            match.team1_id,
            match.team2_id,
            match.status,
            match.winner_id,
            ("winners", *match.winner_next) if match.winner_next is not None else final_next,
        )
        for (round_, position), match in winners.items()
    }


def generate_double_elimination(team_ids: list[int]) -> dict[MatchKey, BracketMatch]:
    winners = generate_single_elimination(team_ids)
    wr_rounds = max(round_ for round_, _ in winners)
    grand_final_key = ("grand_final", 1, 1)

    matches = _as_winners_bracket(winners, final_next=(*grand_final_key, 1))

    if wr_rounds == 1:
        # Two teams: no losers bracket, the final's loser is the losers champion.
        matches[("winners", 1, 1)].loser_next = (*grand_final_key, 2)
        matches[grand_final_key] = _pending(*grand_final_key)
        return matches

    def wr_round_size(round_: int) -> int:
        return sum(1 for r, _ in winners if r == round_)

    # Losers round 1 pairs off winners round 1's losers.
    lb_round = 1
    for position in range(1, wr_round_size(1) // 2 + 1):
        matches[("losers", 1, position)] = _pending("losers", 1, position)
    for position in range(1, wr_round_size(1) + 1):
        matches[("winners", 1, position)].loser_next = (
            "losers",
            1,
            (position + 1) // 2,
            1 if position % 2 == 1 else 2,
        )

    for wr_round in range(2, wr_rounds + 1):
        # Drop round: this winners round's losers face the losers-bracket
        # survivors one-for-one. Every other drop reverses the order so
        # teams that just met don't immediately meet again.
        size = wr_round_size(wr_round)
        drop_round = lb_round + 1
        reverse = wr_round % 2 == 0
        for position in range(1, size + 1):
            matches[("losers", drop_round, position)] = _pending("losers", drop_round, position)
            matches[("losers", lb_round, position)].winner_next = ("losers", drop_round, position, 1)
            target = size + 1 - position if reverse else position
            matches[("winners", wr_round, position)].loser_next = ("losers", drop_round, target, 2)
        lb_round = drop_round

        if wr_round == wr_rounds:
            break

        # Consolidation round: survivors play each other before the next drop.
        consolidation_round = lb_round + 1
        for position in range(1, size // 2 + 1):
            matches[("losers", consolidation_round, position)] = _pending(
                "losers", consolidation_round, position
            )
        for position in range(1, size + 1):
            matches[("losers", lb_round, position)].winner_next = (
                "losers",
                consolidation_round,
                (position + 1) // 2,
                1 if position % 2 == 1 else 2,
            )
        lb_round = consolidation_round

    matches[("losers", lb_round, 1)].winner_next = (*grand_final_key, 2)
    matches[grand_final_key] = _pending(*grand_final_key)

    _resolve_losers_bracket_byes(matches)
    return matches


def _resolve_losers_bracket_byes(matches: dict[MatchKey, BracketMatch]) -> None:
    """A bye never produces a loser, so some losers-bracket slots can never fill.

    A losers match with no incoming link on either side can never be played:
    it's marked complete with no teams and feeds nothing, which in turn
    leaves a dead slot in the round after it. A match with exactly one dead
    side stays pending and auto-advances its one team once it arrives
    (handled at scoring time).
    """
    for match in matches.values():
        if match.bracket == "winners" and match.round == 1 and match.status == "complete":
            match.loser_next = None

    losers = sorted(
        (match for match in matches.values() if match.bracket == "losers"),
        key=lambda match: (match.round, match.position),
    )
    for match in losers:
        fed = any(
            ref is not None and ref[:3] == ("losers", match.round, match.position)
            for other in matches.values()
            for ref in (other.winner_next, other.loser_next)
        )
        if not fed:
            match.status = "complete"
            match.winner_next = None

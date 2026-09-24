"""Who won each playoff bracket, and the tournament stage that follows from it."""

from dataclasses import dataclass

from sqlmodel import Session, select, update

from app.models import Match, PlayoffBracket, Tournament


def deciding_match(matches: list[Match]) -> Match:
    """The match whose winner takes the bracket.

    Single elimination: the winners-bracket final. Double elimination: grand
    final 1, or the reset match once the losers champion has forced one.
    """
    grand_finals = sorted((m for m in matches if m.bracket == "grand_final"), key=lambda m: m.round)
    if grand_finals:
        return grand_finals[-1]
    return next(m for m in matches if m.bracket == "winners" and m.winner_next_match_id is None)


def champion_id(matches: list[Match]) -> int | None:
    """The bracket's champion, or None while it's still being played."""
    final = deciding_match(matches)
    if final.status != "complete":
        return None
    if final.bracket == "grand_final" and final.round == 1 and final.winner_id == final.team2_id:
        return None  # the losers champion won game one, so a reset match decides it
    return final.winner_id


_SECTION_ORDER = {"winners": 0, "losers": 1, "grand_final": 2}


@dataclass
class Placings:
    champion_id: int
    runner_up_id: int
    # (bracket, round, team ids in match order), the latest round out first
    eliminated: list[tuple[str, int, list[int]]]


def placings(matches: list[Match]) -> Placings | None:
    """Champion, runner-up, and everyone else by the round of their last loss.

    A team's last loss is the one that put it out: its only loss in single
    elimination, its losers-bracket loss in double. Byes aren't losses.
    None while the bracket is still being played.
    """
    champion = champion_id(matches)
    if champion is None:
        return None
    final = deciding_match(matches)
    runner_up = final.team2_id if champion == final.team1_id else final.team1_id

    last_loss: dict[int, Match] = {}
    for match in sorted(
        matches, key=lambda m: (_SECTION_ORDER[m.bracket], m.round, m.position)
    ):
        if match.status == "complete" and match.team1_id and match.team2_id:
            loser = match.team2_id if match.winner_id == match.team1_id else match.team1_id
            last_loss[loser] = match
    groups: dict[tuple[str, int], list[int]] = {}
    for team_id, match in sorted(last_loss.items(), key=lambda item: item[1].position):
        if team_id not in (champion, runner_up):
            groups.setdefault((match.bracket, match.round), []).append(team_id)
    eliminated = [
        (bracket, round_, team_ids)
        for (bracket, round_), team_ids in sorted(
            groups.items(), key=lambda item: (_SECTION_ORDER[item[0][0]], item[0][1]), reverse=True
        )
    ]
    return Placings(champion, runner_up, eliminated)


def sync_playoff_stage(session: Session, tournament_id: int) -> None:
    """Mark the tournament complete once every bracket has a champion, else back to playoffs.

    Uncommitted, so it lands in the same transaction as the score that caused it.
    """
    bracket_ids = session.exec(
        select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == tournament_id)
    ).all()
    # Scoring writes with bulk UPDATEs, so re-read rows already in the session.
    matches = session.exec(
        select(Match)
        .where(Match.playoff_bracket_id.in_(bracket_ids))
        .execution_options(populate_existing=True)
    ).all()
    decided = all(
        champion_id([m for m in matches if m.playoff_bracket_id == bracket_id]) is not None
        for bracket_id in bracket_ids
    )
    session.execute(
        update(Tournament)
        .where(Tournament.id == tournament_id, Tournament.stage.in_(("playoffs", "complete")))
        .values(stage="complete" if decided else "playoffs")
    )

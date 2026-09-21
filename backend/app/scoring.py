from sqlalchemy import case
from sqlmodel import Session, update

from app.models import Match


class MatchNotFound(Exception):
    pass


class InvalidScore(Exception):
    pass


class VersionConflict(Exception):
    pass


def submit_score(
    session: Session,
    match_id: int,
    team1_score: int,
    team2_score: int,
    expected_version: int,
    complete: bool,
) -> Match:
    match = session.get(Match, match_id)
    if match is None:
        raise MatchNotFound(match_id)
    if match.status == "complete" and match.version == expected_version:
        raise InvalidScore(
            "match is already complete; correction is not supported yet"
        )

    values = {"team1_score": team1_score, "team2_score": team2_score}

    winner_id = None
    if complete:
        if match.team1_id is None or match.team2_id is None:
            raise InvalidScore("both teams must be known to complete a match")
        if team1_score == team2_score:
            raise InvalidScore("cannot complete a match with a tied score")
        winner_id = match.team1_id if team1_score > team2_score else match.team2_id
        values["status"] = "complete"
        values["winner_id"] = winner_id
    else:
        values["status"] = "in_progress"

    result = session.execute(
        update(Match)
        .where(Match.id == match_id, Match.version == expected_version)
        .values(**values, version=Match.version + 1)
    )
    if result.rowcount == 0:
        session.rollback()
        raise VersionConflict(match_id)

    if complete and match.winner_next_match_id is not None:
        _advance_winner(session, match.winner_next_match_id, match.winner_next_slot, winner_id)

    session.commit()
    session.refresh(match)
    return match


def _advance_winner(session: Session, next_match_id: int, slot: int, winner_id: int) -> None:
    slot_column = Match.team1_id if slot == 1 else Match.team2_id
    other_column = Match.team2_id if slot == 1 else Match.team1_id
    session.execute(
        update(Match)
        .where(Match.id == next_match_id)
        .values(
            **{slot_column.key: winner_id},
            status=case((other_column.is_not(None), "ready"), else_=Match.status),
        )
    )

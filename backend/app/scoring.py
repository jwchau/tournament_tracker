from dataclasses import dataclass

from sqlalchemy import case
from sqlmodel import Session, update

from app.models import CorrectionLog, Match


@dataclass
class Correction:
    match: Match
    reset_matches: list[Match]
    log: CorrectionLog


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
            "match is already complete; use the correction endpoint to change its result"
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


def correct_score(
    session: Session,
    match_id: int,
    team1_score: int,
    team2_score: int,
    expected_version: int,
) -> Correction:
    """Re-score a completed match and unplay every match that consumed its old winner.

    The whole cascade is one transaction: every write is version-checked
    against what was read, so any concurrent change rolls everything back
    with a VersionConflict instead of being silently overwritten.
    """
    match, winner_id = _validate_correction(session, match_id, team1_score, team2_score)
    old_winner_id = match.winner_id
    log = CorrectionLog(
        match_id=match_id,
        old_team1_score=match.team1_score,
        old_team2_score=match.team2_score,
        old_winner_id=old_winner_id,
        new_team1_score=team1_score,
        new_team2_score=team2_score,
        new_winner_id=winner_id,
    )

    _update_or_conflict(
        session,
        match,
        expected_version,
        team1_score=team1_score,
        team2_score=team2_score,
        winner_id=winner_id,
    )

    # Walk the chain only after the first write, once this transaction holds
    # the write lock, so the versions read here can't be stale.
    reset_matches = _matches_to_reset(session, match) if winner_id != old_winner_id else []
    upstream, team_id = match, winner_id
    for downstream in reset_matches:
        _unplay(session, downstream, upstream.winner_next_slot, team_id)
        upstream, team_id = downstream, None

    log.reset_match_ids = [reset.id for reset in reset_matches]
    session.add(log)
    session.commit()
    for row in [match, log, *reset_matches]:
        session.refresh(row)
    return Correction(match=match, reset_matches=reset_matches, log=log)


def preview_correction(
    session: Session, match_id: int, team1_score: int, team2_score: int
) -> list[Match]:
    """The matches `correct_score` would reset, without changing anything."""
    match, winner_id = _validate_correction(session, match_id, team1_score, team2_score)
    if winner_id == match.winner_id:
        return []
    return _matches_to_reset(session, match)


def _validate_correction(
    session: Session, match_id: int, team1_score: int, team2_score: int
) -> tuple[Match, int]:
    match = session.get(Match, match_id)
    if match is None:
        raise MatchNotFound(match_id)
    if match.status != "complete":
        raise InvalidScore("only completed matches can be corrected")
    if team1_score == team2_score:
        raise InvalidScore("cannot correct a match to a tied score")
    winner_id = match.team1_id if team1_score > team2_score else match.team2_id
    return match, winner_id


def _matches_to_reset(session: Session, match: Match) -> list[Match]:
    """Downstream matches holding a result that depends on `match`'s winner.

    The next match always takes the new winner. If it had been completed,
    its own winner had advanced too, so the chain continues from there.
    """
    affected = []
    upstream = match
    while upstream.winner_next_match_id is not None:
        downstream = session.get(Match, upstream.winner_next_match_id)
        affected.append(downstream)
        if downstream.status != "complete":
            break
        upstream = downstream
    return affected


def _unplay(session: Session, match: Match, slot: int, team_id: int | None) -> None:
    """Put `team_id` (or nothing) into `slot` and clear the match's result."""
    slot_column = Match.team1_id if slot == 1 else Match.team2_id
    other_column = Match.team2_id if slot == 1 else Match.team1_id
    _update_or_conflict(
        session,
        match,
        match.version,
        **{slot_column.key: team_id},
        team1_score=None,
        team2_score=None,
        winner_id=None,
        status=(
            case((other_column.is_not(None), "ready"), else_="pending")
            if team_id is not None
            else "pending"
        ),
    )


def _update_or_conflict(session: Session, match: Match, expected_version: int, **values) -> None:
    result = session.execute(
        update(Match)
        .where(Match.id == match.id, Match.version == expected_version)
        .values(**values, version=Match.version + 1)
    )
    if result.rowcount == 0:
        session.rollback()
        raise VersionConflict(match.id)


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

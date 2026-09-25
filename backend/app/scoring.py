from collections import deque
from dataclasses import dataclass

from sqlalchemy import case, or_
from sqlmodel import Session, delete, select, update

from app.dispatch import dispatch
from app.models import CorrectionLog, Game, Match
from app.results import sync_playoff_stage


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
    if match.on_hold:
        raise InvalidScore("this match is on hold; release it before scoring it")

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
        _place_team(session, match.winner_next_match_id, match.winner_next_slot, winner_id)
    if complete and match.loser_next_match_id is not None:
        loser_id = match.team2_id if winner_id == match.team1_id else match.team1_id
        _place_team(session, match.loser_next_match_id, match.loser_next_slot, loser_id)
    if complete and _forces_bracket_reset(match, winner_id):
        _create_bracket_reset(session, match)
    if match.playoff_bracket_id is not None:
        if complete:
            sync_playoff_stage(session, match.tournament_id)
        dispatch(session, match.tournament_id)

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
    reset_matches, refills = (
        _reset_plan(session, match, winner_id) if winner_id != old_winner_id else ([], [])
    )
    cleared_slots: dict[int, list[int]] = {}
    for refill in refills:
        cleared_slots.setdefault(refill.match.id, []).append(refill.slot)
    for downstream in reset_matches:
        _unplay(session, downstream, cleared_slots[downstream.id])
    for refill in refills:
        if refill.team_id is not None:
            _place_team(session, refill.match.id, refill.slot, refill.team_id)

    stale_reset = (
        _stale_bracket_reset(session, match, winner_id, reset_matches)
        if winner_id != old_winner_id
        else None
    )
    if stale_reset is not None:
        session.execute(delete(CorrectionLog).where(CorrectionLog.match_id == stale_reset.id))
        session.execute(delete(Game).where(Game.match_id == stale_reset.id))
        _delete_or_conflict(session, stale_reset)
        reset_matches.append(stale_reset)
    if winner_id != old_winner_id and _forces_bracket_reset(match, winner_id):
        _create_bracket_reset(session, match)

    if match.playoff_bracket_id is not None:
        sync_playoff_stage(session, match.tournament_id)
        dispatch(session, match.tournament_id)

    log.reset_match_ids = [reset.id for reset in reset_matches]
    session.add(log)
    session.commit()
    for row in [match, log, *reset_matches]:
        if row is not stale_reset:
            session.refresh(row)
    return Correction(match=match, reset_matches=reset_matches, log=log)


def preview_correction(
    session: Session, match_id: int, team1_score: int, team2_score: int
) -> list[Match]:
    """The matches `correct_score` would reset, without changing anything."""
    match, winner_id = _validate_correction(session, match_id, team1_score, team2_score)
    if winner_id == match.winner_id:
        return []
    reset_matches, _ = _reset_plan(session, match, winner_id)
    stale_reset = _stale_bracket_reset(session, match, winner_id, reset_matches)
    return reset_matches + ([stale_reset] if stale_reset is not None else [])


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


@dataclass
class _Refill:
    match: Match
    slot: int
    team_id: int | None


def _reset_plan(
    session: Session, match: Match, new_winner_id: int
) -> tuple[list[Match], list[_Refill]]:
    """Downstream matches holding a result that depends on `match`'s outcome.

    Both of `match`'s outgoing links change: the winner's slot gets the new
    winner and (in double elimination) the loser's slot the new loser. A
    downstream match that had been completed had sent its own winner and
    loser on too, so those slots are cleared and the walk continues from
    there. Returns the matches to reset (each once, in the order reached)
    and every slot to refill, with the team it gets (None to leave it empty).
    """
    new_loser_id = match.team2_id if new_winner_id == match.team1_id else match.team1_id
    affected: dict[int, Match] = {}
    refills: list[_Refill] = []
    queue = deque([(match, new_winner_id, new_loser_id)])
    while queue:
        upstream, winner_id, loser_id = queue.popleft()
        for next_id, slot, team_id in (
            (upstream.winner_next_match_id, upstream.winner_next_slot, winner_id),
            (upstream.loser_next_match_id, upstream.loser_next_slot, loser_id),
        ):
            if next_id is None:
                continue
            downstream = session.get(Match, next_id)
            refills.append(_Refill(downstream, slot, team_id))
            if downstream.id in affected:
                continue
            affected[downstream.id] = downstream
            if downstream.status == "complete":
                queue.append((downstream, None, None))
    return list(affected.values()), refills


def _unplay(session: Session, match: Match, slots: list[int]) -> None:
    """Empty the given slots and clear the match's result, including any series games.

    It also gives up its court and its place in the court queue: if it's
    ready again once its slots are refilled, it queues from the back.
    """
    session.execute(delete(Game).where(Game.match_id == match.id))
    _update_or_conflict(
        session,
        match,
        match.version,
        **{(Match.team1_id if slot == 1 else Match.team2_id).key: None for slot in slots},
        team1_score=None,
        team2_score=None,
        game_team1_score=None,
        game_team2_score=None,
        winner_id=None,
        status="pending",
        court=None,
        court_set_at=None,
        ready_order=None,
    )


def _stale_bracket_reset(
    session: Session, corrected: Match, new_winner_id: int, reset_matches: list[Match]
) -> Match | None:
    """The grand-finals reset match, if this correction means it shouldn't exist.

    It only exists while the losers champion has won grand final 1, so it goes
    whenever grand final 1 is reset, or is corrected so the winners champion
    (slot 1) wins it.
    """
    if _is_grand_final_one(corrected):
        if new_winner_id == corrected.team2_id:
            return None
        grand_final = corrected
    else:
        grand_final = next((m for m in reset_matches if _is_grand_final_one(m)), None)
        if grand_final is None:
            return None
    return session.exec(
        select(Match).where(
            Match.tournament_id == grand_final.tournament_id,
            Match.playoff_bracket_id == grand_final.playoff_bracket_id,
            Match.bracket == "grand_final",
            Match.round == 2,
        )
    ).first()


def _is_grand_final_one(match: Match) -> bool:
    return match.bracket == "grand_final" and match.round == 1


def _delete_or_conflict(session: Session, match: Match) -> None:
    result = session.execute(
        delete(Match).where(Match.id == match.id, Match.version == match.version)
    )
    if result.rowcount == 0:
        session.rollback()
        raise VersionConflict(match.id)


def _update_or_conflict(session: Session, match: Match, expected_version: int, **values) -> None:
    result = session.execute(
        update(Match)
        .where(Match.id == match.id, Match.version == expected_version)
        .values(**values, version=Match.version + 1)
    )
    if result.rowcount == 0:
        session.rollback()
        raise VersionConflict(match.id)


def _forces_bracket_reset(match: Match, winner_id: int | None) -> bool:
    """The losers champion (slot 2) beating the winners champion in grand final 1.

    The winners champion has then lost only once, so a second grand final
    decides the tournament.
    """
    return (
        _is_grand_final_one(match)
        and winner_id is not None
        and winner_id == match.team2_id
    )


def _create_bracket_reset(session: Session, grand_final: Match) -> None:
    session.add(
        Match(
            tournament_id=grand_final.tournament_id,
            playoff_bracket_id=grand_final.playoff_bracket_id,
            bracket="grand_final",
            round=2,
            position=1,
            team1_id=grand_final.team1_id,
            team2_id=grand_final.team2_id,
            status="ready",
        )
    )


def _place_team(session: Session, match_id: int, slot: int, team_id: int) -> None:
    """Write `team_id` into one slot of a match that's waiting on it.

    If nothing can ever fill the other slot (a losers-bracket bye), the
    match completes on the spot with this team as winner, and that winner
    moves on the same way.
    """
    slot_column = Match.team1_id if slot == 1 else Match.team2_id
    other_column = Match.team2_id if slot == 1 else Match.team1_id
    session.execute(
        update(Match)
        .where(Match.id == match_id)
        .values(
            **{slot_column.key: team_id},
            status=case((other_column.is_not(None), "ready"), else_=Match.status),
        )
    )

    # Dead slots only exist in the losers bracket (a winners-bracket bye
    # never produces a loser); everywhere else an empty slot is just waiting.
    match = session.get(Match, match_id)
    if match.bracket != "losers" or _slot_is_fed(session, match_id, 2 if slot == 1 else 1):
        return
    session.execute(
        update(Match)
        .where(Match.id == match_id)
        .values(status="complete", winner_id=team_id, version=Match.version + 1)
    )
    if match.winner_next_match_id is not None:
        _place_team(session, match.winner_next_match_id, match.winner_next_slot, team_id)


def _slot_is_fed(session: Session, match_id: int, slot: int) -> bool:
    """Whether any match's winner or loser is routed into this slot."""
    feeder = session.exec(
        select(Match.id).where(
            or_(
                (Match.winner_next_match_id == match_id) & (Match.winner_next_slot == slot),
                (Match.loser_next_match_id == match_id) & (Match.loser_next_slot == slot),
            )
        )
    ).first()
    return feeder is not None

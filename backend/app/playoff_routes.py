from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select, update

from app.bracket import (
    BracketMatch,
    BracketNotReady,
    MatchKey,
    generate_bracket,
    validate_teams_for_bracket,
)
from app.db import get_session
from app.dispatch import court_occupancy, dispatch, is_overflow, queue
from app.models import CorrectionLog, Match, Player, PlayoffBracket, Team, Tournament
from app.pool_routes import _pool_matches, _pools_in_order, _tournament_or_404
from app.playoffs import playoff_tiers
from app.pools import pool_standings
from app.settings import require_confirmed_settings

router = APIRouter()


class AdvanceRequest(SQLModel):
    format: Literal["single", "double"] = "single"


class PlayoffBracketSummary(SQLModel):
    id: int
    tournament_id: int
    tier: int
    format: str
    has_scores: bool


class NotReady(Exception):
    pass


def _plan_tiers(session: Session, tournament: Tournament) -> list[list[int]]:
    """Each playoff bracket's seeded team ids, or NotReady saying why advancing can't happen yet."""
    if not tournament.settings_confirmed:
        raise NotReady("confirm the tournament settings first")
    if session.exec(
        select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == tournament.id)
    ).first() is not None:
        raise NotReady("this tournament has already advanced to playoffs")
    standings = []
    for pool in _pools_in_order(session, tournament.id):
        matches = _pool_matches(session, pool.id)
        teams = session.exec(select(Team).where(Team.pool_id == pool.id)).all()
        if len(teams) >= 2 and not matches:
            raise NotReady(f"{pool.name} has no schedule yet")
        if any(match.status != "complete" for match in matches):
            raise NotReady(f"{pool.name} has incomplete matches")
        standings.append(pool_standings([(team.id, team.name) for team in teams], matches))
    tiers = playoff_tiers(standings, tournament.advance_per_pool, tournament.playoff_bracket_count)
    for tier, team_ids in enumerate(tiers, start=1):
        if len(team_ids) < 2:
            teams = "team" if len(team_ids) == 1 else "teams"
            raise NotReady(
                f"Bracket {tier} would have {len(team_ids)} {teams}; every playoff bracket "
                "needs at least 2. Lower advance per pool or the playoff bracket count."
            )
    return tiers


class PlayoffReadiness(SQLModel):
    ready: bool
    reason: str | None


@router.get("/tournaments/{tournament_id}/playoff-readiness", response_model=PlayoffReadiness)
def playoff_readiness(
    tournament_id: int, session: Session = Depends(get_session)
) -> PlayoffReadiness:
    try:
        _plan_tiers(session, _tournament_or_404(session, tournament_id))
    except NotReady as exc:
        return PlayoffReadiness(ready=False, reason=str(exc))
    return PlayoffReadiness(ready=True, reason=None)


@router.post(
    "/tournaments/{tournament_id}/advance-to-playoffs",
    response_model=list[PlayoffBracketSummary],
    status_code=201,
)
def advance_to_playoffs(
    tournament_id: int, data: AdvanceRequest, session: Session = Depends(get_session)
) -> list[PlayoffBracketSummary]:
    tournament = _tournament_or_404(session, tournament_id)
    try:
        tiers = _plan_tiers(session, tournament)
    except NotReady as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    created = _create_playoffs(session, tournament_id, tiers, data.format)
    return _summaries(session, [bracket for bracket, _ in created])


@router.post(
    "/tournaments/{tournament_id}/bracket/generate",
    response_model=list[Match],
    status_code=201,
)
def generate_single_bracket(
    tournament_id: int,
    data: AdvanceRequest | None = None,
    session: Session = Depends(get_session),
) -> list[Match]:
    """A tournament without pools: every team in one tier-1 bracket, seeded by seed."""
    require_confirmed_settings(_tournament_or_404(session, tournament_id))
    if _pools_in_order(session, tournament_id):
        raise HTTPException(
            status_code=400,
            detail="this tournament has pools; advance to playoffs once pool play is done",
        )
    format = data.format if data is not None else "single"
    teams = session.exec(select(Team).where(Team.tournament_id == tournament_id)).all()
    players = session.exec(
        select(Player).where(Player.team_id.in_([team.id for team in teams]))
    ).all()
    try:
        validate_teams_for_bracket(teams, players)
    except BracketNotReady as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    seeded = [team.id for team in sorted(teams, key=lambda team: (team.seed is None, team.seed))]
    [(_, matches)] = _create_playoffs(session, tournament_id, [seeded], format)
    return matches


@router.delete("/tournaments/{tournament_id}/playoff-brackets", status_code=204)
def reset_playoff_brackets(tournament_id: int, session: Session = Depends(get_session)) -> None:
    """Undo generating or advancing, e.g. after picking the wrong format, until play starts."""
    tournament = _tournament_or_404(session, tournament_id)
    brackets = session.exec(
        select(PlayoffBracket).where(PlayoffBracket.tournament_id == tournament_id)
    ).all()
    matches = session.exec(
        select(Match).where(Match.playoff_bracket_id.in_([b.id for b in brackets]))
    ).all()
    if any(m.team1_score is not None or m.team2_score is not None for m in matches):
        raise HTTPException(
            status_code=400, detail="a playoff match has been scored; brackets can't be reset"
        )
    for log in session.exec(
        select(CorrectionLog).where(CorrectionLog.match_id.in_([m.id for m in matches]))
    ).all():
        session.delete(log)
    for match in matches:
        session.delete(match)
    session.flush()
    for bracket in brackets:
        session.delete(bracket)
    tournament.stage = "draft"
    session.add(tournament)
    session.commit()


def _create_playoffs(
    session: Session, tournament_id: int, tiers: list[list[int]], format: str
) -> list[tuple[PlayoffBracket, list[Match]]]:
    """One bracket per tier of seeded team ids; a tournament gets playoffs only once.

    Planning only read, so a simultaneous request may have planned too. The
    first write takes the database's write lock; a request that claims the
    stage second finds it already taken and stops before adding brackets.
    """
    claimed = session.execute(
        update(Tournament)
        .where(Tournament.id == tournament_id, Tournament.stage != "playoffs")
        .values(stage="playoffs", format=format)
    )
    if claimed.rowcount == 0:
        session.rollback()
        raise HTTPException(status_code=400, detail="this tournament has already advanced to playoffs")

    created = []
    for tier, team_ids in enumerate(tiers, start=1):
        bracket = PlayoffBracket(tournament_id=tournament_id, tier=tier, format=format)
        session.add(bracket)
        session.flush()
        matches = _save_matches(session, tournament_id, generate_bracket(team_ids, format), bracket.id)
        created.append((bracket, matches))
    # Only once every tier exists, since the court split depends on how many there are.
    dispatch(session, tournament_id)
    session.commit()
    for bracket, matches in created:
        for row in [bracket, *matches]:
            session.refresh(row)
    return created


def _save_matches(
    session: Session,
    tournament_id: int,
    generated: dict[MatchKey, BracketMatch],
    playoff_bracket_id: int,
) -> list[Match]:
    """Add a generated bracket's matches, with their advancement links, uncommitted."""
    rows_by_key = {}
    for key, generated_match in generated.items():
        row = Match(
            tournament_id=tournament_id,
            playoff_bracket_id=playoff_bracket_id,
            bracket=generated_match.bracket,
            round=generated_match.round,
            position=generated_match.position,
            team1_id=generated_match.team1_id,
            team2_id=generated_match.team2_id,
            status=generated_match.status,
            winner_id=generated_match.winner_id,
        )
        session.add(row)
        rows_by_key[key] = row
    session.flush()

    for key, generated_match in generated.items():
        row = rows_by_key[key]
        if generated_match.winner_next is not None:
            *next_key, slot = generated_match.winner_next
            row.winner_next_match_id = rows_by_key[tuple(next_key)].id
            row.winner_next_slot = slot
        if generated_match.loser_next is not None:
            *next_key, slot = generated_match.loser_next
            row.loser_next_match_id = rows_by_key[tuple(next_key)].id
            row.loser_next_slot = slot
    return list(rows_by_key.values())


def _summaries(session: Session, brackets: list[PlayoffBracket]) -> list[PlayoffBracketSummary]:
    """Brackets with whether any of their matches has a score (so they can't be reset)."""
    scored = set(
        session.exec(
            select(Match.playoff_bracket_id)
            .where(
                Match.playoff_bracket_id.in_([b.id for b in brackets]),
                (Match.team1_score.is_not(None)) | (Match.team2_score.is_not(None)),
            )
            .distinct()
        ).all()
    )
    return [
        PlayoffBracketSummary(**bracket.model_dump(), has_scores=bracket.id in scored)
        for bracket in brackets
    ]


@router.get(
    "/tournaments/{tournament_id}/playoff-brackets", response_model=list[PlayoffBracketSummary]
)
def list_playoff_brackets(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[PlayoffBracketSummary]:
    _tournament_or_404(session, tournament_id)
    brackets = session.exec(
        select(PlayoffBracket)
        .where(PlayoffBracket.tournament_id == tournament_id)
        .order_by(PlayoffBracket.tier)
    ).all()
    return _summaries(session, list(brackets))


@router.get("/playoff-brackets/{bracket_id}", response_model=PlayoffBracketSummary)
def get_playoff_bracket(
    bracket_id: int, session: Session = Depends(get_session)
) -> PlayoffBracketSummary:
    bracket = session.get(PlayoffBracket, bracket_id)
    if bracket is None:
        raise HTTPException(status_code=404, detail="Playoff bracket not found")
    return _summaries(session, [bracket])[0]


class CourtOccupancy(SQLModel):
    court: int
    match_id: int | None


class DispatchStatus(SQLModel):
    # The courts the bracket's matches can go on: its own, or when it owns
    # none (overflow), every bracket's.
    courts: list[CourtOccupancy]
    # Matches in line for those courts, first in line first. A bracket with
    # courts shares its line with the overflow brackets' matches.
    queue: list[int]
    overflow: bool


@router.get("/playoff-brackets/{bracket_id}/dispatch", response_model=DispatchStatus)
def get_bracket_dispatch(
    bracket_id: int, session: Session = Depends(get_session)
) -> DispatchStatus:
    """The bracket's courts with the match on each, and the matches waiting for one."""
    if session.get(PlayoffBracket, bracket_id) is None:
        raise HTTPException(status_code=404, detail="Playoff bracket not found")
    return DispatchStatus(
        courts=[
            CourtOccupancy(court=court, match_id=match_id)
            for court, match_id in court_occupancy(session, bracket_id).items()
        ],
        queue=queue(session, bracket_id),
        overflow=is_overflow(session, bracket_id),
    )


@router.get("/playoff-brackets/{bracket_id}/matches", response_model=list[Match])
def list_playoff_bracket_matches(
    bracket_id: int, session: Session = Depends(get_session)
) -> list[Match]:
    if session.get(PlayoffBracket, bracket_id) is None:
        raise HTTPException(status_code=404, detail="Playoff bracket not found")
    return list(
        session.exec(select(Match).where(Match.playoff_bracket_id == bracket_id)).all()
    )

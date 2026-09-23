from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select, update

from app.bracket import generate_bracket
from app.db import get_session
from app.models import Match, PlayoffBracket, Team, Tournament
from app.pool_routes import _pool_matches, _pools_in_order, _tournament_or_404
from app.playoffs import playoff_tiers
from app.pools import pool_standings
from app.routers import save_bracket

router = APIRouter()


class AdvanceRequest(SQLModel):
    format: Literal["single", "double"] = "single"


class NotReady(Exception):
    pass


def _plan_tiers(session: Session, tournament: Tournament) -> list[list[int]]:
    """Each playoff bracket's seeded team ids, or NotReady saying why advancing can't happen yet."""
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
    response_model=list[PlayoffBracket],
    status_code=201,
)
def advance_to_playoffs(
    tournament_id: int, data: AdvanceRequest, session: Session = Depends(get_session)
) -> list[PlayoffBracket]:
    tournament = _tournament_or_404(session, tournament_id)
    try:
        tiers = _plan_tiers(session, tournament)
    except NotReady as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Planning only read, so a simultaneous request may have planned too. The
    # first write takes the database's write lock; a request that claims the
    # stage second finds it already taken and stops before adding brackets.
    claimed = session.execute(
        update(Tournament)
        .where(Tournament.id == tournament_id, Tournament.stage != "playoffs")
        .values(stage="playoffs", format=data.format)
    )
    if claimed.rowcount == 0:
        session.rollback()
        raise HTTPException(status_code=400, detail="this tournament has already advanced to playoffs")

    brackets = []
    for tier, team_ids in enumerate(tiers, start=1):
        bracket = PlayoffBracket(tournament_id=tournament_id, tier=tier, format=data.format)
        session.add(bracket)
        session.flush()
        save_bracket(session, tournament_id, generate_bracket(team_ids, data.format), bracket.id)
        brackets.append(bracket)
    session.commit()
    for bracket in brackets:
        session.refresh(bracket)
    return brackets


@router.get("/tournaments/{tournament_id}/playoff-brackets", response_model=list[PlayoffBracket])
def list_playoff_brackets(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[PlayoffBracket]:
    _tournament_or_404(session, tournament_id)
    return list(
        session.exec(
            select(PlayoffBracket)
            .where(PlayoffBracket.tournament_id == tournament_id)
            .order_by(PlayoffBracket.tier)
        ).all()
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

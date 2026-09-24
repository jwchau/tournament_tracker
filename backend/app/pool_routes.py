from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from app.db import get_session
from app.models import Match, Pool, PoolCreate, PoolSummary, Team, Tournament
from app.settings import require_confirmed_settings
from app.pools import (
    balanced_pool_count,
    generate_round_robin,
    pool_courts,
    pool_standings,
    snake_assign,
)

router = APIRouter()


def _tournament_or_404(session: Session, tournament_id: int) -> Tournament:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament


def _pools_in_order(session: Session, tournament_id: int) -> list[Pool]:
    return list(
        session.exec(
            select(Pool).where(Pool.tournament_id == tournament_id).order_by(Pool.id)
        ).all()
    )


@router.post("/tournaments/{tournament_id}/pools", response_model=Pool, status_code=201)
def create_pool(
    tournament_id: int, data: PoolCreate, session: Session = Depends(get_session)
) -> Pool:
    require_confirmed_settings(_tournament_or_404(session, tournament_id))
    pool = Pool(tournament_id=tournament_id, name=data.name)
    session.add(pool)
    session.commit()
    session.refresh(pool)
    return pool


@router.get("/tournaments/{tournament_id}/pools", response_model=list[PoolSummary])
def list_pools(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[PoolSummary]:
    return _pool_summaries(session, _tournament_or_404(session, tournament_id))


def _pool_summaries(session: Session, tournament: Tournament) -> list[PoolSummary]:
    pools = _pools_in_order(session, tournament.id)
    courts = pool_courts(tournament.court_count, len(pools))
    return [
        PoolSummary(**pool.model_dump(), courts=pool_court_numbers)
        for pool, pool_court_numbers in zip(pools, courts)
    ]


@router.post("/tournaments/{tournament_id}/pools/auto-assign", response_model=list[Team])
def auto_assign_pools(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[Team]:
    """Split every team into balanced pools sized near the tournament's target, snake-seeded.

    Keeps the earliest pools, creates any more that are needed ("Pool A",
    "Pool B", ...), and deletes the newest extras. Pool schedules are
    dropped since their teams change, so this is refused once any pool
    match has a score.
    """
    tournament = _tournament_or_404(session, tournament_id)
    require_confirmed_settings(tournament)
    pools = _pools_in_order(session, tournament_id)
    schedules =[match for pool in pools for match in _pool_matches(session, pool.id)]
    if _any_scored(schedules):
        raise HTTPException(
            status_code=400, detail="pool play has started; teams can't be reassigned"
        )
    teams = sorted(
        session.exec(select(Team).where(Team.tournament_id == tournament_id)).all(),
        key=lambda team: (team.seed is None, team.seed, team.id),
    )
    for match in schedules:
        session.delete(match)

    count = balanced_pool_count(len(teams), tournament.target_pool_size, tournament.court_count)
    for extra in pools[count:]:
        session.delete(extra)
    pools = pools[:count]
    taken = {pool.name for pool in pools}
    letters = (f"Pool {chr(ord('A') + i)}" for i in range(26))
    while len(pools) < count:
        name = next(letter for letter in letters if letter not in taken)
        pool = Pool(tournament_id=tournament_id, name=name)
        session.add(pool)
        pools.append(pool)
    session.flush()

    assignment = snake_assign([team.id for team in teams], [pool.id for pool in pools])
    for team in teams:
        team.pool_id = assignment[team.id]
        session.add(team)
    _sync_pool_stage(session, tournament)
    session.commit()
    for team in teams:
        session.refresh(team)
    return teams


def _pool_or_404(session: Session, pool_id: int) -> Pool:
    pool = session.get(Pool, pool_id)
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    return pool


def _pool_matches(session: Session, pool_id: int) -> list[Match]:
    return list(
        session.exec(
            select(Match).where(Match.pool_id == pool_id).order_by(Match.round, Match.position)
        ).all()
    )


def _any_scored(matches: list[Match]) -> bool:
    """Whether any of these matches has a score, so its results must be kept."""
    return any(m.team1_score is not None or m.team2_score is not None for m in matches)


def pre_playoff_stage(session: Session, tournament_id: int) -> str:
    """`pool_play` once any pool has a schedule, else `draft`."""
    scheduled = session.exec(
        select(Match.id).where(Match.tournament_id == tournament_id, Match.pool_id.is_not(None))
    ).first()
    return "draft" if scheduled is None else "pool_play"


def _sync_pool_stage(session: Session, tournament: Tournament) -> None:
    """Move between draft and pool play as schedules come and go, uncommitted.

    Leaves a tournament already in playoffs alone.
    """
    if tournament.stage in ("draft", "pool_play"):
        tournament.stage = pre_playoff_stage(session, tournament.id)
        session.add(tournament)


@router.post("/pools/{pool_id}/generate-schedule", response_model=list[Match], status_code=201)
def generate_pool_schedule(pool_id: int, session: Session = Depends(get_session)) -> list[Match]:
    pool = _pool_or_404(session, pool_id)
    tournament = session.get(Tournament, pool.tournament_id)
    pools = _pools_in_order(session, pool.tournament_id)
    courts = pool_courts(tournament.court_count, len(pools))[
        [p.id for p in pools].index(pool.id)
    ]
    if not courts:
        raise HTTPException(
            status_code=400,
            detail="not enough courts: every pool needs at least one court",
        )
    team_ids = [
        team.id
        for team in session.exec(
            select(Team).where(Team.pool_id == pool.id).order_by(Team.seed, Team.id)
        ).all()
    ]
    if len(team_ids) < 2:
        raise HTTPException(status_code=400, detail="a pool needs at least 2 teams")

    existing = _pool_matches(session, pool.id)
    if _any_scored(existing):
        raise HTTPException(
            status_code=400,
            detail="this pool already has scored matches; its schedule can't be regenerated",
        )
    for match in existing:
        session.delete(match)

    slots = generate_round_robin(team_ids, courts, tournament.games_per_pairing)
    for slot_number, slot in enumerate(slots, start=1):
        for position, scheduled in enumerate(slot, start=1):
            session.add(
                Match(
                    tournament_id=pool.tournament_id,
                    bracket="pool",
                    pool_id=pool.id,
                    round=slot_number,
                    position=position,
                    team1_id=scheduled.team1_id,
                    team2_id=scheduled.team2_id,
                    court=scheduled.court,
                    status="ready",
                )
            )
    _sync_pool_stage(session, tournament)
    session.commit()
    return _pool_matches(session, pool.id)


@router.get("/pools/{pool_id}/matches", response_model=list[Match])
def list_pool_matches(pool_id: int, session: Session = Depends(get_session)) -> list[Match]:
    _pool_or_404(session, pool_id)
    return _pool_matches(session, pool_id)


class StandingsEntry(SQLModel):
    team_id: int
    name: str
    played: int
    wins: int
    losses: int
    points: int
    points_for: int
    point_diff: int
    rank: int


@router.get("/pools/{pool_id}/standings", response_model=list[StandingsEntry])
def get_pool_standings(
    pool_id: int, session: Session = Depends(get_session)
) -> list[StandingsEntry]:
    _pool_or_404(session, pool_id)
    teams = session.exec(select(Team).where(Team.pool_id == pool_id)).all()
    rows = pool_standings([(team.id, team.name) for team in teams], _pool_matches(session, pool_id))
    return [
        StandingsEntry(
            team_id=row.team_id,
            name=row.name,
            played=row.played,
            wins=row.wins,
            losses=row.losses,
            points=row.points,
            points_for=row.points_for,
            point_diff=row.point_diff,
            rank=row.rank,
        )
        for row in rows
    ]


@router.patch("/pools/{pool_id}", response_model=Pool)
def rename_pool(pool_id: int, data: PoolCreate, session: Session = Depends(get_session)) -> Pool:
    pool = _pool_or_404(session, pool_id)
    pool.name = data.name
    session.add(pool)
    session.commit()
    session.refresh(pool)
    return pool


@router.delete("/pools/{pool_id}", status_code=204)
def delete_pool(pool_id: int, session: Session = Depends(get_session)) -> None:
    pool = _pool_or_404(session, pool_id)
    matches = _pool_matches(session, pool_id)
    if _any_scored(matches):
        raise HTTPException(
            status_code=400, detail="this pool has scored matches and can't be deleted"
        )
    for match in matches:
        session.delete(match)
    for team in session.exec(select(Team).where(Team.pool_id == pool_id)).all():
        team.pool_id = None
        session.add(team)
    session.delete(pool)
    _sync_pool_stage(session, session.get(Tournament, pool.tournament_id))
    session.commit()


@router.get("/pools/{pool_id}", response_model=PoolSummary)
def get_pool(pool_id: int, session: Session = Depends(get_session)) -> PoolSummary:
    pool = _pool_or_404(session, pool_id)
    tournament = session.get(Tournament, pool.tournament_id)
    return next(s for s in _pool_summaries(session, tournament) if s.id == pool.id)

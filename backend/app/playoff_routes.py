from dataclasses import dataclass, field
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
from app.dispatch import Snapshot, dispatch
from app.models import CorrectionLog, Match, Player, PlayoffBracket, Team, Tournament
from app.pool_routes import _pool_matches, _pools_in_order, _tournament_or_404, pre_playoff_stage
from app.playoffs import playoff_tiers
from app.pools import pool_standings
from app.results import placings
from app.rows import json_response, match_dicts

router = APIRouter()


class AdvanceRequest(SQLModel):
    format: Literal["single", "double"] = "single"
    # Team ids per bracket, in seed order, when the organizer changed the
    # order the standings gave. It must hold the same teams in each bracket.
    seeding: list[list[int]] | None = None


class PlayoffBracketSummary(SQLModel):
    id: int
    tournament_id: int
    tier: int
    format: str
    has_scores: bool


class NotReady(Exception):
    pass


@dataclass
class Plan:
    """Each playoff bracket's seeded team ids, and where each team finished in its pool."""

    tiers: list[list[int]]
    pool_finish: dict[int, tuple[str, int]] = field(default_factory=dict)


def _plan_tiers(session: Session, tournament: Tournament) -> list[list[int]]:
    return _plan(session, tournament).tiers


def _plan(session: Session, tournament: Tournament) -> Plan:
    """Each playoff bracket's seeded team ids, or NotReady saying why advancing can't happen yet."""
    if session.exec(
        select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == tournament.id)
    ).first() is not None:
        raise NotReady("this tournament has already advanced to playoffs")
    standings = []
    pool_finish: dict[int, tuple[str, int]] = {}
    pools = _pools_in_order(session, tournament.id)
    teams_by_pool: dict[int, list[Team]] = {}
    matches_by_pool: dict[int, list[Match]] = {}
    if pools:
        pool_ids = [pool.id for pool in pools]
        for team in session.exec(select(Team).where(Team.pool_id.in_(pool_ids)).order_by(Team.id)).all():
            teams_by_pool.setdefault(team.pool_id, []).append(team)
        for match in session.exec(
            select(Match).where(Match.pool_id.in_(pool_ids)).order_by(Match.round, Match.position)
        ).all():
            matches_by_pool.setdefault(match.pool_id, []).append(match)
    for pool in pools:
        matches = matches_by_pool.get(pool.id, [])
        teams = teams_by_pool.get(pool.id, [])
        if len(teams) >= 2 and not matches:
            raise NotReady(f"{pool.name} has no schedule yet")
        if any(match.status != "complete" for match in matches):
            raise NotReady(f"{pool.name} has incomplete matches")
        rows = pool_standings([(team.id, team.name) for team in teams], matches)
        standings.append(rows)
        for row in rows:
            pool_finish[row.team_id] = (pool.name, row.rank)
    tiers = playoff_tiers(standings, tournament.advance_per_pool, tournament.playoff_bracket_count)
    for tier, team_ids in enumerate(tiers, start=1):
        if len(team_ids) < 2:
            teams = "team" if len(team_ids) == 1 else "teams"
            raise NotReady(
                f"Bracket {tier} would have {len(team_ids)} {teams}; every playoff bracket "
                "needs at least 2. Lower advance per pool or the playoff bracket count."
            )
    return Plan(tiers, pool_finish)


def _plan_single_bracket(session: Session, tournament: Tournament) -> list[list[int]]:
    """A tournament without pools: every team in one bracket, seeded by seed.

    Raises BracketNotReady when the teams can't make a bracket yet.
    """
    teams = session.exec(select(Team).where(Team.tournament_id == tournament.id)).all()
    players = session.exec(
        select(Player).where(Player.team_id.in_([team.id for team in teams]))
    ).all()
    validate_teams_for_bracket(teams, players)
    return [[team.id for team in sorted(teams, key=lambda team: (team.seed is None, team.seed))]]


def _seeded(planned: list[list[int]], seeding: list[list[int]] | None) -> list[list[int]]:
    """The organizer's order for each bracket, if they gave one; it may only reorder teams."""
    if seeding is None:
        return planned
    if len(seeding) != len(planned) or any(
        sorted(chosen) != sorted(team_ids) for chosen, team_ids in zip(seeding, planned)
    ):
        raise HTTPException(
            status_code=400,
            detail="the seeding must list the same teams in each bracket; reload and try again",
        )
    return seeding


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
    created = _create_playoffs(session, tournament_id, _seeded(tiers, data.seeding), data.format)
    return _summaries(session, [bracket for bracket, _ in created])


class SeedEntry(SQLModel):
    team_id: int
    name: str
    pool: str | None
    pool_rank: int | None


class SeedingTier(SQLModel):
    tier: int
    teams: list[SeedEntry]


class PlayoffSeeding(SQLModel):
    ready: bool
    reason: str | None
    tiers: list[SeedingTier]


@router.get("/tournaments/{tournament_id}/playoff-seeding", response_model=PlayoffSeeding)
def playoff_seeding(tournament_id: int, session: Session = Depends(get_session)) -> PlayoffSeeding:
    """The seed order each bracket would start with, to review or change before creating them."""
    tournament = _tournament_or_404(session, tournament_id)
    try:
        if _pools_in_order(session, tournament_id):
            plan = _plan(session, tournament)
        else:
            if session.exec(
                select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == tournament_id)
            ).first() is not None:
                raise NotReady("this tournament has already advanced to playoffs")
            plan = Plan(_plan_single_bracket(session, tournament))
    except (NotReady, BracketNotReady) as exc:
        return PlayoffSeeding(ready=False, reason=str(exc), tiers=[])
    names = {
        team.id: team.name
        for team in session.exec(select(Team).where(Team.tournament_id == tournament_id)).all()
    }
    return PlayoffSeeding(
        ready=True,
        reason=None,
        tiers=[
            SeedingTier(
                tier=tier,
                teams=[
                    SeedEntry(
                        team_id=team_id,
                        name=names[team_id],
                        pool=plan.pool_finish.get(team_id, (None, None))[0],
                        pool_rank=plan.pool_finish.get(team_id, (None, None))[1],
                    )
                    for team_id in team_ids
                ],
            )
            for tier, team_ids in enumerate(plan.tiers, start=1)
        ],
    )


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
    if _pools_in_order(session, tournament_id):
        raise HTTPException(
            status_code=400,
            detail="this tournament has pools; advance to playoffs once pool play is done",
        )
    format = data.format if data is not None else "single"
    try:
        planned = _plan_single_bracket(session, _tournament_or_404(session, tournament_id))
    except BracketNotReady as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    seeding = data.seeding if data is not None else None
    [(_, matches)] = _create_playoffs(session, tournament_id, _seeded(planned, seeding), format)
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
    tournament.stage = pre_playoff_stage(session, tournament_id)
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
        .where(Tournament.id == tournament_id, Tournament.stage.not_in(("playoffs", "complete")))
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
def get_bracket_dispatch(bracket_id: int, session: Session = Depends(get_session)):
    """The bracket's courts with the match on each, and the matches waiting for one."""
    bracket = session.get(PlayoffBracket, bracket_id)
    if bracket is None:
        raise HTTPException(status_code=404, detail="Playoff bracket not found")
    snapshot = Snapshot(session, bracket.tournament_id, rows=True)
    return json_response(
        {
            "courts": [
                {"court": court, "match_id": match_id}
                for court, match_id in snapshot.occupancy(bracket_id).items()
            ],
            "queue": snapshot.queue(bracket_id),
            "overflow": snapshot.overflow(bracket_id),
        }
    )


@router.get("/playoff-brackets/{bracket_id}/matches", response_model=list[Match])
def list_playoff_bracket_matches(bracket_id: int, session: Session = Depends(get_session)):
    if session.get(PlayoffBracket, bracket_id) is None:
        raise HTTPException(status_code=404, detail="Playoff bracket not found")
    return json_response(match_dicts(session, Match.playoff_bracket_id == bracket_id))


class PlacedTeam(SQLModel):
    team_id: int
    name: str


class EliminatedGroup(SQLModel):
    bracket: str
    round: int
    teams: list[PlacedTeam]


class TierResult(SQLModel):
    tier: int
    playoff_bracket_id: int
    format: str
    champion: PlacedTeam
    runner_up: PlacedTeam
    eliminated: list[EliminatedGroup]


@router.get("/tournaments/{tournament_id}/results", response_model=list[TierResult])
def tournament_results(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[TierResult]:
    """Each playoff tier's final placings, once every tier has a champion."""
    if _tournament_or_404(session, tournament_id).stage != "complete":
        raise HTTPException(status_code=400, detail="the tournament isn't complete yet")
    names = dict(
        session.exec(select(Team.id, Team.name).where(Team.tournament_id == tournament_id)).all()
    )

    def placed(team_id: int) -> PlacedTeam:
        return PlacedTeam(team_id=team_id, name=names[team_id])

    results = []
    for bracket in session.exec(
        select(PlayoffBracket)
        .where(PlayoffBracket.tournament_id == tournament_id)
        .order_by(PlayoffBracket.tier)
    ).all():
        matches = session.exec(select(Match).where(Match.playoff_bracket_id == bracket.id)).all()
        final = placings(list(matches))
        results.append(
            TierResult(
                tier=bracket.tier,
                playoff_bracket_id=bracket.id,
                format=bracket.format,
                champion=placed(final.champion_id),
                runner_up=placed(final.runner_up_id),
                eliminated=[
                    EliminatedGroup(
                        bracket=section, round=round_, teams=[placed(t) for t in team_ids]
                    )
                    for section, round_, team_ids in final.eliminated
                ],
            )
        )
    return results

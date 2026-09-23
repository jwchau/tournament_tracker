from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, func, select, update

from app.db import get_session
from app.models import (
    CorrectionLog,
    Match,
    Player,
    PlayerCreate,
    PlayoffBracket,
    Pool,
    Team,
    TeamCreate,
    TeamSummary,
    TeamUpdate,
    Tournament,
    TournamentCreate,
    TournamentSummary,
    TournamentUpdate,
)
from app.scoring import (
    InvalidScore,
    MatchNotFound,
    VersionConflict,
    correct_score,
    preview_correction,
    submit_score,
)

router = APIRouter()


@router.post("/tournaments", response_model=Tournament, status_code=201)
def create_tournament(
    data: TournamentCreate, session: Session = Depends(get_session)
) -> Tournament:
    tournament = Tournament(name=data.name)
    session.add(tournament)
    session.commit()
    session.refresh(tournament)
    return tournament


@router.get("/tournaments", response_model=list[TournamentSummary])
def list_tournaments(session: Session = Depends(get_session)) -> list[TournamentSummary]:
    tournaments = session.exec(select(Tournament)).all()
    counts = dict(
        session.exec(
            select(Team.tournament_id, func.count(Team.id)).group_by(Team.tournament_id)
        ).all()
    )
    return [
        TournamentSummary(**tournament.model_dump(), team_count=counts.get(tournament.id, 0))
        for tournament in tournaments
    ]


@router.get("/tournaments/{tournament_id}", response_model=Tournament)
def get_tournament(
    tournament_id: int, session: Session = Depends(get_session)
) -> Tournament:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament


@router.patch("/tournaments/{tournament_id}", response_model=Tournament)
def update_tournament(
    tournament_id: int,
    data: TournamentUpdate,
    session: Session = Depends(get_session),
) -> Tournament:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tournament, field, value)

    session.add(tournament)
    session.commit()
    session.refresh(tournament)
    return tournament


@router.delete("/tournaments/{tournament_id}", status_code=204)
def delete_tournament(
    tournament_id: int, session: Session = Depends(get_session)
) -> None:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")

    teams = session.exec(
        select(Team).where(Team.tournament_id == tournament_id)
    ).all()
    team_ids = [team.id for team in teams]
    if team_ids:
        players = session.exec(
            select(Player).where(Player.team_id.in_(team_ids))
        ).all()
        for player in players:
            session.delete(player)

    matches = session.exec(
        select(Match).where(Match.tournament_id == tournament_id)
    ).all()
    corrections = session.exec(
        select(CorrectionLog).where(CorrectionLog.match_id.in_([m.id for m in matches]))
    ).all()
    for correction in corrections:
        session.delete(correction)
    for match in matches:
        session.delete(match)
    session.flush()
    for bracket in session.exec(
        select(PlayoffBracket).where(PlayoffBracket.tournament_id == tournament_id)
    ).all():
        session.delete(bracket)

    for team in teams:
        session.delete(team)

    for pool in session.exec(select(Pool).where(Pool.tournament_id == tournament_id)).all():
        session.delete(pool)

    session.delete(tournament)
    session.commit()


@router.post(
    "/tournaments/{tournament_id}/teams", response_model=Team, status_code=201
)
def create_team(
    tournament_id: int, data: TeamCreate, session: Session = Depends(get_session)
) -> Team:
    if session.get(Tournament, tournament_id) is None:
        raise HTTPException(status_code=404, detail="Tournament not found")

    team = Team(tournament_id=tournament_id, name=data.name, seed=data.seed)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.get("/tournaments/{tournament_id}/teams", response_model=list[TeamSummary])
def list_teams(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[TeamSummary]:
    teams = list(
        session.exec(select(Team).where(Team.tournament_id == tournament_id)).all()
    )
    counts = (
        dict(
            session.exec(
                select(Player.team_id, func.count(Player.id))
                .where(Player.team_id.in_([team.id for team in teams]))
                .group_by(Player.team_id)
            ).all()
        )
        if teams
        else {}
    )
    return [
        TeamSummary(**team.model_dump(), player_count=counts.get(team.id, 0))
        for team in teams
    ]


@router.get("/teams/{team_id}", response_model=Team)
def get_team(team_id: int, session: Session = Depends(get_session)) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.patch("/teams/{team_id}", response_model=Team)
def update_team(
    team_id: int, data: TeamUpdate, session: Session = Depends(get_session)
) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    changes = data.model_dump(exclude_unset=True)
    pool_id = changes.get("pool_id")
    if pool_id is not None:
        pool = session.get(Pool, pool_id)
        if pool is None or pool.tournament_id != team.tournament_id:
            raise HTTPException(status_code=400, detail="Pool not found in this tournament")
    for field, value in changes.items():
        setattr(team, field, value)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.post("/teams/{team_id}/players", response_model=Player, status_code=201)
def create_player(
    team_id: int, data: PlayerCreate, session: Session = Depends(get_session)
) -> Player:
    if session.get(Team, team_id) is None:
        raise HTTPException(status_code=404, detail="Team not found")

    player = Player(team_id=team_id, name=data.name)
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


@router.get("/teams/{team_id}/players", response_model=list[Player])
def list_players(team_id: int, session: Session = Depends(get_session)) -> list[Player]:
    return list(
        session.exec(select(Player).where(Player.team_id == team_id)).all()
    )


@router.delete("/teams/{team_id}/players/{player_id}", status_code=204)
def delete_player(
    team_id: int, player_id: int, session: Session = Depends(get_session)
) -> None:
    if session.get(Team, team_id) is None:
        raise HTTPException(status_code=404, detail="Team not found")

    player = session.get(Player, player_id)
    if player is None or player.team_id != team_id:
        raise HTTPException(status_code=404, detail="Player not found")

    session.delete(player)
    session.commit()


class ScoreSubmission(SQLModel):
    team1_score: int
    team2_score: int
    version: int
    complete: bool = False


@router.get("/matches/{match_id}", response_model=Match)
def get_match(match_id: int, session: Session = Depends(get_session)) -> Match:
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@router.patch("/matches/{match_id}/score", response_model=Match)
def submit_match_score(
    match_id: int, data: ScoreSubmission, session: Session = Depends(get_session)
) -> Match:
    try:
        return submit_score(
            session,
            match_id,
            data.team1_score,
            data.team2_score,
            data.version,
            data.complete,
        )
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(
            status_code=409,
            detail="version conflict: match was updated by someone else, please refetch and retry",
        )


class ScheduleUpdate(SQLModel):
    scheduled_time: datetime | None = None
    court: int | None = None


@router.patch("/matches/{match_id}/schedule", response_model=Match)
def schedule_match(
    match_id: int, data: ScheduleUpdate, session: Session = Depends(get_session)
) -> Match:
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")

    values = data.model_dump(exclude_unset=True)
    court = values.get("court")
    if court is not None:
        court_count = session.get(Tournament, match.tournament_id).court_count
        if not 1 <= court <= court_count:
            raise HTTPException(
                status_code=400, detail=f"court must be between 1 and {court_count}"
            )
    if values:
        session.execute(update(Match).where(Match.id == match_id).values(**values))
        session.commit()
        session.refresh(match)
    return match


class CorrectionPreviewRequest(SQLModel):
    team1_score: int
    team2_score: int


class CorrectionRequest(CorrectionPreviewRequest):
    version: int


class CorrectionPreview(SQLModel):
    reset_matches: list[Match]


class CorrectionResult(CorrectionPreview):
    match: Match


@router.post("/matches/{match_id}/correct/preview", response_model=CorrectionPreview)
def preview_match_correction(
    match_id: int, data: CorrectionPreviewRequest, session: Session = Depends(get_session)
) -> CorrectionPreview:
    try:
        reset_matches = preview_correction(
            session, match_id, data.team1_score, data.team2_score
        )
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return CorrectionPreview(reset_matches=reset_matches)


@router.patch("/matches/{match_id}/correct", response_model=CorrectionResult)
def correct_match_score(
    match_id: int, data: CorrectionRequest, session: Session = Depends(get_session)
) -> CorrectionResult:
    try:
        correction = correct_score(
            session, match_id, data.team1_score, data.team2_score, data.version
        )
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(
            status_code=409,
            detail="version conflict: match was updated by someone else, please refetch and retry",
        )
    return CorrectionResult(match=correction.match, reset_matches=correction.reset_matches)

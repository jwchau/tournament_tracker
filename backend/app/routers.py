from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Player, PlayerCreate, Team, TeamCreate, Tournament, TournamentCreate

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


@router.get("/tournaments", response_model=list[Tournament])
def list_tournaments(session: Session = Depends(get_session)) -> list[Tournament]:
    return list(session.exec(select(Tournament)).all())


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


@router.get("/tournaments/{tournament_id}/teams", response_model=list[Team])
def list_teams(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[Team]:
    return list(
        session.exec(select(Team).where(Team.tournament_id == tournament_id)).all()
    )


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

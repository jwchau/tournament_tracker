from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from app.bracket import BracketNotReady, generate_single_elimination, validate_teams_for_bracket
from app.db import get_session
from app.models import Match, Player, PlayerCreate, Team, TeamCreate, Tournament, TournamentCreate
from app.scoring import InvalidScore, MatchNotFound, VersionConflict, submit_score

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


@router.post(
    "/tournaments/{tournament_id}/bracket/generate",
    response_model=list[Match],
    status_code=201,
)
def generate_bracket(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[Match]:
    if session.get(Tournament, tournament_id) is None:
        raise HTTPException(status_code=404, detail="Tournament not found")

    teams = session.exec(
        select(Team).where(Team.tournament_id == tournament_id)
    ).all()
    players = session.exec(
        select(Player).where(Player.team_id.in_([team.id for team in teams]))
    ).all()
    try:
        validate_teams_for_bracket(teams, players)
    except BracketNotReady as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ordered_team_ids = [
        team.id for team in sorted(teams, key=lambda team: (team.seed is None, team.seed))
    ]

    generated = generate_single_elimination(ordered_team_ids)

    rows_by_key = {}
    for key, generated_match in generated.items():
        row = Match(
            tournament_id=tournament_id,
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
        if generated_match.winner_next is not None:
            next_round, next_position, slot = generated_match.winner_next
            row = rows_by_key[key]
            row.winner_next_match_id = rows_by_key[(next_round, next_position)].id
            row.winner_next_slot = slot

    session.commit()
    for row in rows_by_key.values():
        session.refresh(row)

    return list(rows_by_key.values())


@router.get("/tournaments/{tournament_id}/bracket", response_model=list[Match])
def get_bracket(
    tournament_id: int, session: Session = Depends(get_session)
) -> list[Match]:
    return list(
        session.exec(select(Match).where(Match.tournament_id == tournament_id)).all()
    )


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

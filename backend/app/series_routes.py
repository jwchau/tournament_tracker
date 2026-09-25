from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel

from app.db import get_session
from app.models import Game, Match
from app.scoring import InvalidScore, MatchNotFound, VersionConflict
from app.series import GameNotFound, edit_game, games_of, record_game, set_game_in_play

router = APIRouter()

CONFLICT = "version conflict: match was updated by someone else, please refetch and retry"


class GameSubmission(SQLModel):
    team1_score: int
    team2_score: int
    version: int


@router.get("/matches/{match_id}/games", response_model=list[Game])
def list_games(match_id: int, session: Session = Depends(get_session)) -> list[Game]:
    if session.get(Match, match_id) is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return games_of(session, match_id)


@router.post("/matches/{match_id}/games", response_model=Game, status_code=201)
def add_game(
    match_id: int, data: GameSubmission, session: Session = Depends(get_session)
) -> Game:
    try:
        return record_game(session, match_id, data.team1_score, data.team2_score, data.version)
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(status_code=409, detail=CONFLICT)


@router.put("/matches/{match_id}/game-in-play", response_model=Match)
def save_game_in_play(
    match_id: int, data: GameSubmission, session: Session = Depends(get_session)
) -> Match:
    try:
        return set_game_in_play(
            session, match_id, data.team1_score, data.team2_score, data.version
        )
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(status_code=409, detail=CONFLICT)


@router.patch("/matches/{match_id}/games/{number}", response_model=Game)
def fix_game(
    match_id: int, number: int, data: GameSubmission, session: Session = Depends(get_session)
) -> Game:
    try:
        return edit_game(
            session, match_id, number, data.team1_score, data.team2_score, data.version
        )
    except (MatchNotFound, GameNotFound):
        raise HTTPException(status_code=404, detail="Game not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(status_code=409, detail=CONFLICT)

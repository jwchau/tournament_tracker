from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, func, select, update

from app.db import get_session
from app.models import (
    CorrectionLog,
    Game,
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
    TournamentDetail,
    TournamentSummary,
    TournamentUpdate,
)
from app.series import best_of, replace_games, series_result
from app.settings import require_confirmed_settings
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


def _play_has_started(session: Session, tournament_id: int) -> bool:
    """Whether any of the tournament's matches, pool or playoff, has a score."""
    return (
        session.exec(
            select(Match.id).where(
                Match.tournament_id == tournament_id,
                Match.team1_score.is_not(None) | Match.team2_score.is_not(None),
            )
        ).first()
        is not None
    )


def _detail(session: Session, tournament: Tournament) -> TournamentDetail:
    return TournamentDetail(
        **tournament.model_dump(), settings_locked=_play_has_started(session, tournament.id)
    )


def _tournament_or_404(session: Session, tournament_id: int) -> Tournament:
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament


@router.get("/tournaments/{tournament_id}", response_model=TournamentDetail)
def get_tournament(
    tournament_id: int, session: Session = Depends(get_session)
) -> TournamentDetail:
    return _detail(session, _tournament_or_404(session, tournament_id))


@router.patch("/tournaments/{tournament_id}", response_model=TournamentDetail)
def update_tournament(
    tournament_id: int,
    data: TournamentUpdate,
    session: Session = Depends(get_session),
) -> TournamentDetail:
    """Change the name any time; the other settings only until play starts."""
    tournament = _tournament_or_404(session, tournament_id)
    changes = data.model_dump(exclude_unset=True)
    changed_settings = {
        field for field, value in changes.items()
        if field != "name" and value != getattr(tournament, field)
    }
    if changed_settings and _play_has_started(session, tournament_id):
        raise HTTPException(
            status_code=400,
            detail="play has started, so only the tournament name can still be changed",
        )
    if "playoff_best_of" in changed_settings and session.exec(
        select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == tournament_id)
    ).first() is not None:
        raise HTTPException(
            status_code=400,
            detail="brackets already exist; reset them to change the playoff best-of",
        )

    for field, value in changes.items():
        setattr(tournament, field, value)

    session.add(tournament)
    session.commit()
    session.refresh(tournament)
    return _detail(session, tournament)


@router.post("/tournaments/{tournament_id}/confirm-settings", response_model=TournamentDetail)
def confirm_settings(
    tournament_id: int, session: Session = Depends(get_session)
) -> TournamentDetail:
    """Unlocks teams, pools, and brackets. There's no un-confirming."""
    tournament = _tournament_or_404(session, tournament_id)
    tournament.settings_confirmed = True
    session.add(tournament)
    session.commit()
    session.refresh(tournament)
    return _detail(session, tournament)


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
    for game in session.exec(select(Game).where(Game.match_id.in_([m.id for m in matches]))).all():
        session.delete(game)
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
    tournament = session.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found")
    require_confirmed_settings(tournament)

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
    if (
        "seed" in changes
        and changes["seed"] != team.seed
        and _play_has_started(session, team.tournament_id)
    ):
        raise HTTPException(
            status_code=400, detail="play has started, so seeds can no longer change"
        )
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


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(team_id: int, session: Session = Depends(get_session)) -> None:
    """Remove a team and its roster, e.g. a no-show at check-in."""
    team = session.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if session.exec(
        select(PlayoffBracket.id).where(PlayoffBracket.tournament_id == team.tournament_id)
    ).first() is not None:
        raise HTTPException(
            status_code=400, detail="brackets already exist, so teams can't be deleted"
        )
    if team.pool_id is not None and session.exec(
        select(Match.id).where(Match.pool_id == team.pool_id)
    ).first() is not None:
        raise HTTPException(
            status_code=400,
            detail="this team's pool already has a schedule; re-run auto-assign or delete the pool first",
        )

    for player in session.exec(select(Player).where(Player.team_id == team_id)).all():
        session.delete(player)
    session.delete(team)
    session.commit()


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
    match = session.get(Match, match_id)
    if match is not None and (games := best_of(session, match)) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"this match is best-of-{games}; enter its games one at a time instead",
        )
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


class GameScore(SQLModel):
    team1_score: int
    team2_score: int


class CorrectionPreviewRequest(SQLModel):
    """A single game's corrected score, or for a best-of series every corrected game."""

    team1_score: int | None = None
    team2_score: int | None = None
    games: list[GameScore] | None = None


class CorrectionRequest(CorrectionPreviewRequest):
    version: int


class CorrectionPreview(SQLModel):
    reset_matches: list[Match]


class CorrectionResult(CorrectionPreview):
    match: Match


def _corrected_result(
    session: Session, match_id: int, data: CorrectionPreviewRequest
) -> tuple[int, int, list[tuple[int, int]] | None]:
    """The corrected match score, plus the corrected games when the match is a series."""
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    games_needed = best_of(session, match)
    try:
        if games_needed > 1:
            if not data.games:
                raise InvalidScore(f"this match is best-of-{games_needed}; send its corrected games")
            scores = [(game.team1_score, game.team2_score) for game in data.games]
            wins1, wins2 = series_result(scores, games_needed)
            return wins1, wins2, scores
        if data.team1_score is None or data.team2_score is None:
            raise InvalidScore("send the corrected team1_score and team2_score")
        return data.team1_score, data.team2_score, None
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/matches/{match_id}/correct/preview", response_model=CorrectionPreview)
def preview_match_correction(
    match_id: int, data: CorrectionPreviewRequest, session: Session = Depends(get_session)
) -> CorrectionPreview:
    team1_score, team2_score, _ = _corrected_result(session, match_id, data)
    try:
        reset_matches = preview_correction(session, match_id, team1_score, team2_score)
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return CorrectionPreview(reset_matches=reset_matches)


@router.patch("/matches/{match_id}/correct", response_model=CorrectionResult)
def correct_match_score(
    match_id: int, data: CorrectionRequest, session: Session = Depends(get_session)
) -> CorrectionResult:
    team1_score, team2_score, games = _corrected_result(session, match_id, data)
    try:
        if games is not None:
            # Staged in the correction's transaction: a conflict discards them too.
            replace_games(session, match_id, games)
        correction = correct_score(session, match_id, team1_score, team2_score, data.version)
    except MatchNotFound:
        raise HTTPException(status_code=404, detail="Match not found")
    except InvalidScore as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except VersionConflict:
        raise HTTPException(
            status_code=409,
            detail="version conflict: match was updated by someone else, please refetch and retry",
        )
    return CorrectionResult(match=correction.match, reset_matches=correction.reset_matches)
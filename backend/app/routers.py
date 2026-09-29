from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, func, select, update

from app.db import get_session
from app.dispatch import bump_dispatched, dispatch, redispatch
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
from app.bracket_refs import sync_bracket_refs
from app.refs import eligible_ref_team_ids, reassign_pool_refs
from app.results import champion_id
from app.series import best_of, replace_games, series_result
from app.tournament_settings import (
    changed_settings,
    refuse_locked,
    setting_effects,
    setting_locks,
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
        TournamentSummary(
            **_view(tournament),
            team_count=counts.get(tournament.id, 0),
            champion_name=_champion_name(session, tournament),
        )
        for tournament in tournaments
    ]


def _champion_name(session: Session, tournament: Tournament) -> str | None:
    """The top (tier 1) bracket's winner, once the tournament is complete."""
    if tournament.stage != "complete":
        return None
    top = session.exec(
        select(PlayoffBracket)
        .where(PlayoffBracket.tournament_id == tournament.id)
        .order_by(PlayoffBracket.tier)
    ).first()
    if top is None:
        return None
    matches = list(session.exec(select(Match).where(Match.playoff_bracket_id == top.id)).all())
    winner = champion_id(matches) if matches else None
    team = session.get(Team, winner) if winner is not None else None
    return team.name if team is not None else None


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


def _view(tournament: Tournament) -> dict:
    """The tournament as the API shows it: an automatic advance-per-pool is null, not 0."""
    view = tournament.model_dump()
    view["advance_per_pool"] = tournament.advance_per_pool or None
    return view


def _pool_play_started(session: Session, tournament_id: int) -> bool:
    """Whether any pool match has a score."""
    return (
        session.exec(
            select(Match.id).where(
                Match.tournament_id == tournament_id,
                Match.pool_id.is_not(None),
                Match.team1_score.is_not(None) | Match.team2_score.is_not(None),
            )
        ).first()
        is not None
    )


def _detail(session: Session, tournament: Tournament) -> TournamentDetail:
    return TournamentDetail(
        **_view(tournament),
        setting_locks=setting_locks(session, tournament),
        pool_play_started=_pool_play_started(session, tournament.id),
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
    """Change the name, date and venue any time; each other setting until it locks.

    What locks a setting is in `tournament_settings`.
    """
    tournament = _tournament_or_404(session, tournament_id)
    changes = data.model_dump(exclude_unset=True)
    changed = changed_settings(tournament, changes)
    refuse_locked(session, tournament, changed)

    for field, value in changes.items():
        # An automatic advance-per-pool is stored as 0.
        setattr(tournament, field, (value or 0) if field == "advance_per_pool" else value)

    session.add(tournament)
    if "court_count" in changed:
        redispatch(session, tournament_id)
    session.commit()
    session.refresh(tournament)
    return _detail(session, tournament)


class SettingsPreview(SQLModel):
    effects: list[str]


@router.post("/tournaments/{tournament_id}/settings/preview", response_model=SettingsPreview)
def preview_settings(
    tournament_id: int,
    data: TournamentUpdate,
    session: Session = Depends(get_session),
) -> SettingsPreview:
    """What saving these settings would do to what already exists, before saving them.

    Empty when nothing exists yet to be affected. Refused, as saving would be,
    when a setting has locked.
    """
    tournament = _tournament_or_404(session, tournament_id)
    changed = changed_settings(tournament, data.model_dump(exclude_unset=True))
    refuse_locked(session, tournament, changed)
    return SettingsPreview(effects=setting_effects(session, tournament, changed))


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
    if _pool_play_started(session, tournament_id):
        raise HTTPException(
            status_code=400, detail="pool play has started, so teams can no longer be added"
        )

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
    if court is not None and match.on_hold:
        raise HTTPException(
            status_code=400,
            detail="this match is on hold; release it before putting it on a court",
        )
    if court is not None:
        court_count = session.get(Tournament, match.tournament_id).court_count
        if not 1 <= court <= court_count:
            raise HTTPException(
                status_code=400, detail=f"court must be between 1 and {court_count}"
            )
    if "court" in values:
        values["court_set_at"] = datetime.now() if court is not None else None
    if values:
        session.execute(update(Match).where(Match.id == match_id).values(**values))
        # A court set by hand takes a playoff match out of the queue; one it
        # leaves may go to the next match waiting.
        if match.playoff_bracket_id is not None:
            if court is not None:
                bump_dispatched(session, match.tournament_id, court, match_id)
            dispatch(session, match.tournament_id)
        session.commit()
        session.refresh(match)
    return match


class HoldUpdate(SQLModel):
    on_hold: bool
    version: int


@router.patch("/matches/{match_id}/hold", response_model=Match)
def hold_match(
    match_id: int, data: HoldUpdate, session: Session = Depends(get_session)
) -> Match:
    """Keep a playoff match off courts (e.g. a team isn't there yet), or release it.

    Holding takes an unplayed match off its court, which goes to the next
    match waiting. Releasing puts it back in the queue in its original place.
    """
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.playoff_bracket_id is None:
        raise HTTPException(
            status_code=400,
            detail="only playoff matches can be held; pool matches keep their schedule",
        )
    started = match.team1_score is not None or match.team2_score is not None
    if data.on_hold and (started or match.status == "complete"):
        raise HTTPException(
            status_code=400, detail="this match has a score, so it can't be put on hold"
        )

    values = {"on_hold": data.on_hold}
    if data.on_hold:
        values["court"] = None
        values["court_set_at"] = None
    result = session.execute(
        update(Match)
        .where(Match.id == match_id, Match.version == data.version)
        .values(**values, version=Match.version + 1)
    )
    if result.rowcount == 0:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="version conflict: match was updated by someone else, please refetch and retry",
        )
    dispatch(session, match.tournament_id)
    session.commit()
    session.refresh(match)
    return match


class RefUpdate(SQLModel):
    ref_team_id: int | None = None
    # Hand the ref back to automatic assignment; ref_team_id is then ignored.
    automatic: bool = False
    version: int


class RefOption(SQLModel):
    id: int
    name: str


def _match_or_404(session: Session, match_id: int) -> Match:
    match = session.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@router.get("/matches/{match_id}/ref-options", response_model=list[RefOption])
def list_ref_options(match_id: int, session: Session = Depends(get_session)) -> list[RefOption]:
    """The teams that could ref this match right now, for the Ref dropdown."""
    match = _match_or_404(session, match_id)
    names = dict(
        session.exec(
            select(Team.id, Team.name).where(Team.tournament_id == match.tournament_id)
        ).all()
    )
    return [RefOption(id=team, name=names[team]) for team in eligible_ref_team_ids(session, match)]


@router.patch("/matches/{match_id}/ref", response_model=Match)
def set_match_ref(
    match_id: int, data: RefUpdate, session: Session = Depends(get_session)
) -> Match:
    """Choose a match's ref by hand (a team, or None for N/A), or go back to automatic.

    A pool match's ref comes from its pool's teams not playing that slot; a
    playoff match's from the tournament's teams not on a court right now.
    The other automatic refs are then brought in line, so a team picked here
    isn't also reffing another court. Refs stay editable after the match is
    finished.
    """
    match = _match_or_404(session, match_id)
    if match.pool_id is None and match.playoff_bracket_id is None:
        raise HTTPException(status_code=400, detail="this match isn't in a pool or a bracket")
    if not data.automatic and data.ref_team_id is not None:
        if data.ref_team_id not in eligible_ref_team_ids(session, match):
            ref = session.get(Team, data.ref_team_id)
            name = ref.name if ref is not None else f"Team {data.ref_team_id}"
            where = (
                "isn't in this pool or is playing in this slot"
                if match.pool_id is not None
                else "isn't in this tournament, is in this match, or is on a court"
            )
            raise HTTPException(status_code=400, detail=f"{name} can't ref this match: it {where}")

    if data.automatic:
        # A playoff match's rules pick again now, if it's on a court.
        values = {"ref_set_at": None, "ref_team_id": None, "ref_court": None}
        if match.pool_id is not None:
            values = {"ref_set_at": None}
    else:
        values = {"ref_team_id": data.ref_team_id, "ref_set_at": datetime.now()}
    result = session.execute(
        update(Match)
        .where(Match.id == match_id, Match.version == data.version)
        .values(**values, version=Match.version + 1)
    )
    if result.rowcount == 0:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="version conflict: match was updated by someone else, please refetch and retry",
        )
    session.expire_all()
    if match.pool_id is not None:
        reassign_pool_refs(session, match.pool_id)
    else:
        sync_bracket_refs(session, match.tournament_id)
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
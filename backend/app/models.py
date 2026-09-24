from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Tournament(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    format: str = ""
    stage: str = "draft"
    advance_per_pool: int = 1
    playoff_bracket_count: int = 1
    court_count: int = 1
    games_per_pairing: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
    target_pool_size: int = Field(default=4, sa_column_kwargs={"server_default": "4"})
    playoff_best_of: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
    settings_confirmed: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TournamentCreate(SQLModel):
    name: str


class TournamentUpdate(SQLModel):
    name: str | None = None
    advance_per_pool: int | None = None
    playoff_bracket_count: int | None = None
    court_count: int | None = None
    games_per_pairing: int | None = Field(default=None, ge=1)
    target_pool_size: int | None = Field(default=None, ge=2)
    playoff_best_of: Literal[1, 3, 5, 7] | None = None


class TournamentDetail(SQLModel):
    id: int
    name: str
    format: str
    stage: str
    advance_per_pool: int
    playoff_bracket_count: int
    court_count: int
    games_per_pairing: int
    target_pool_size: int
    playoff_best_of: int
    settings_confirmed: bool
    created_at: datetime
    settings_locked: bool


class TournamentSummary(SQLModel):
    id: int
    name: str
    format: str
    stage: str
    advance_per_pool: int
    playoff_bracket_count: int
    court_count: int
    games_per_pairing: int
    target_pool_size: int
    playoff_best_of: int
    settings_confirmed: bool
    created_at: datetime
    team_count: int


class Pool(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    name: str


class PoolCreate(SQLModel):
    name: str


class PoolSummary(SQLModel):
    id: int
    tournament_id: int
    name: str
    courts: list[int]


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    name: str
    seed: int | None = None
    pool_id: int | None = None


class TeamCreate(SQLModel):
    name: str
    seed: int | None = None


class TeamUpdate(SQLModel):
    name: str | None = None
    seed: int | None = Field(default=None, ge=1)
    pool_id: int | None = None


class TeamSummary(SQLModel):
    id: int
    tournament_id: int
    name: str
    seed: int | None
    pool_id: int | None
    player_count: int


class Player(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="team.id")
    name: str


class PlayerCreate(SQLModel):
    name: str


class PlayoffBracket(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    tier: int
    format: str


class Match(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    bracket: str = Field(default="winners", sa_column_kwargs={"server_default": "winners"})
    pool_id: int | None = Field(default=None, foreign_key="pool.id")
    playoff_bracket_id: int | None = Field(default=None, foreign_key="playoffbracket.id")
    round: int
    position: int
    team1_id: int | None = Field(default=None, foreign_key="team.id")
    team2_id: int | None = Field(default=None, foreign_key="team.id")
    team1_score: int | None = None
    team2_score: int | None = None
    status: str
    winner_id: int | None = Field(default=None, foreign_key="team.id")
    winner_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    winner_next_slot: int | None = None
    loser_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    loser_next_slot: int | None = None
    scheduled_time: datetime | None = None
    court: int | None = None
    # A playoff match's place in the court queue: the order in which the
    # tournament's playoff matches became ready (see app.dispatch).
    ready_order: int | None = None
    # Kept off courts (and out of the queue) until released.
    on_hold: bool = Field(default=False, sa_column_kwargs={"server_default": "0"})
    version: int = 1


class Game(SQLModel, table=True):
    """One game of a best-of playoff series; the match itself holds games won."""

    id: int | None = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id")
    number: int
    team1_score: int
    team2_score: int


class CorrectionLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id")
    old_team1_score: int | None
    old_team2_score: int | None
    old_winner_id: int | None = Field(default=None, foreign_key="team.id")
    new_team1_score: int
    new_team2_score: int
    new_winner_id: int | None = Field(default=None, foreign_key="team.id")
    reset_match_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

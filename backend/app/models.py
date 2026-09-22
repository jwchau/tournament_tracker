from datetime import datetime, timezone

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TournamentCreate(SQLModel):
    name: str


class TournamentUpdate(SQLModel):
    name: str | None = None
    advance_per_pool: int | None = None
    playoff_bracket_count: int | None = None
    court_count: int | None = None


class TournamentSummary(SQLModel):
    id: int
    name: str
    format: str
    stage: str
    advance_per_pool: int
    playoff_bracket_count: int
    court_count: int
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


class Match(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    bracket: str = Field(default="winners", sa_column_kwargs={"server_default": "winners"})
    pool_id: int | None = Field(default=None, foreign_key="pool.id")
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
    version: int = 1


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

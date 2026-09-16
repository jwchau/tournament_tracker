from datetime import datetime, timezone

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


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    name: str
    seed: int | None = None
    pool_id: int | None = None


class TeamCreate(SQLModel):
    name: str
    seed: int | None = None


class Player(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="team.id")
    name: str


class PlayerCreate(SQLModel):
    name: str


class Match(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id")
    round: int
    position: int
    team1_id: int | None = Field(default=None, foreign_key="team.id")
    team2_id: int | None = Field(default=None, foreign_key="team.id")
    status: str
    winner_id: int | None = Field(default=None, foreign_key="team.id")
    winner_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    winner_next_slot: int | None = None
    loser_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    loser_next_slot: int | None = None
    version: int = 1

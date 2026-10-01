from datetime import date as Date
from datetime import datetime, timezone
from typing import Annotated, Literal

from sqlalchemy import JSON, Column, String
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # NOCASE makes the unique constraint and lookups case-insensitive, while
    # keeping the username as it was typed for display.
    username: str = Field(sa_column=Column(String(collation="NOCASE"), unique=True, nullable=False))
    # argon2id; the plain-text password is never stored.
    password_hash: str
    # New users start at the lowest role. The server default is what a database
    # that predates roles backfills into its existing users: all of them could do
    # everything then, so they become admins.
    role: str = Field(default="scorekeeper", sa_column_kwargs={"server_default": "admin"})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPublic(SQLModel):
    id: int
    username: str
    role: str


class UserSession(SQLModel, table=True):
    """A signed-in browser. Only the SHA-256 of the cookie's token is stored."""

    id: int | None = Field(default=None, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime
    expires_at: datetime


class LoginAttempt(SQLModel, table=True):
    """A failed sign-in, kept for the brute-force lockout window."""

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(sa_column=Column(String(collation="NOCASE"), nullable=False, index=True))
    created_at: datetime


class Tournament(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    format: str = ""
    stage: str = "draft"
    # How many of each pool's teams go to bracket 1, then bracket 2, and so on.
    # 0 means automatic: each pool is split evenly across the brackets.
    advance_per_pool: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    playoff_bracket_count: int = 1
    court_count: int = 1
    games_per_pairing: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
    target_pool_size: int = Field(default=4, sa_column_kwargs={"server_default": "4"})
    playoff_best_of: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
    # The losers bracket's and the grand final's best-of in double elimination;
    # 0 means the same as playoff_best_of.
    playoff_best_of_losers: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    playoff_best_of_final: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    # The most points a team can score in a pool game; 0 means no cap.
    pool_point_cap: int = Field(default=0, sa_column_kwargs={"server_default": "0"})
    # The most points a team can score in each set of a playoff match, as
    # comma-separated numbers, the first for set 1 (0 or missing: no cap).
    playoff_point_caps: str = Field(default="", sa_column_kwargs={"server_default": ""})
    # The same for the losers bracket and the grand final of a double elimination;
    # None means the same caps as the winners bracket, "" its own caps with none set.
    playoff_point_caps_losers: str | None = None
    playoff_point_caps_final: str | None = None
    date: Date | None = None
    venue: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def playoff_caps(self) -> list[int]:
        """The winners bracket's playoff point cap of each set, in order."""
        return _caps_list(self.playoff_point_caps)

    def own_caps(self, section: str) -> list[int] | None:
        """A losers bracket's or grand final's own caps, or None when it follows the winners."""
        text = {
            "losers": self.playoff_point_caps_losers,
            "grand_final": self.playoff_point_caps_final,
        }.get(section)
        return None if text is None else _caps_list(text)

    def caps_in(self, section: str) -> list[int]:
        """The point cap of each set for a playoff match in this bracket section.

        The losers bracket and the grand final follow the winners bracket's
        until they have caps of their own.
        """
        own = self.own_caps(section)
        return self.playoff_caps() if own is None else own


def _caps_list(text: str) -> list[int]:
    return [int(part) for part in text.split(",") if part]


class TournamentCreate(SQLModel):
    name: str


class TournamentUpdate(SQLModel):
    name: str | None = None
    date: Date | None = None
    venue: str | None = None
    # null sets it back to automatic
    advance_per_pool: int | None = Field(default=None, ge=1)
    playoff_bracket_count: int | None = None
    court_count: int | None = None
    games_per_pairing: int | None = Field(default=None, ge=1)
    target_pool_size: int | None = Field(default=None, ge=2)
    playoff_best_of: Literal[1, 3, 5, 7] | None = None
    playoff_best_of_losers: Literal[0, 1, 3, 5, 7] | None = None
    playoff_best_of_final: Literal[0, 1, 3, 5, 7] | None = None
    pool_point_cap: int | None = Field(default=None, ge=0)
    playoff_point_caps: list[Annotated[int, Field(ge=0)]] | None = Field(
        default=None, max_length=7
    )
    # null puts the losers bracket's or grand final's caps back to the winners'
    playoff_point_caps_losers: list[Annotated[int, Field(ge=0)]] | None = Field(
        default=None, max_length=7
    )
    playoff_point_caps_final: list[Annotated[int, Field(ge=0)]] | None = Field(
        default=None, max_length=7
    )


class TournamentDetail(SQLModel):
    id: int
    name: str
    format: str
    stage: str
    date: Date | None
    venue: str | None
    advance_per_pool: int | None
    playoff_bracket_count: int
    court_count: int
    games_per_pairing: int
    target_pool_size: int
    playoff_best_of: int
    playoff_best_of_losers: int
    playoff_best_of_final: int
    pool_point_cap: int
    playoff_point_caps: list[int]
    # None: the same as the winners bracket's
    playoff_point_caps_losers: list[int] | None
    playoff_point_caps_final: list[int] | None
    created_at: datetime
    # Settings that can't change right now, each with the reason.
    setting_locks: dict[str, str]
    # Whether any pool match has a score, after which teams can't be added.
    pool_play_started: bool


class TournamentSummary(SQLModel):
    id: int
    name: str
    format: str
    stage: str
    date: Date | None
    venue: str | None
    advance_per_pool: int | None
    playoff_bracket_count: int
    court_count: int
    games_per_pairing: int
    target_pool_size: int
    playoff_best_of: int
    playoff_best_of_losers: int
    playoff_best_of_final: int
    created_at: datetime
    team_count: int
    # The top playoff bracket's winner once the tournament is complete, else None.
    champion_name: str | None = None


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
    # A best-of series' game in play: its running score, saved point by point
    # so spectators can follow it. None between games; cleared when the game
    # is recorded (see app.series).
    game_team1_score: int | None = None
    game_team2_score: int | None = None
    status: str
    winner_id: int | None = Field(default=None, foreign_key="team.id")
    winner_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    winner_next_slot: int | None = None
    loser_next_match_id: int | None = Field(default=None, foreign_key="match.id")
    loser_next_slot: int | None = None
    scheduled_time: datetime | None = None
    court: int | None = None
    # When the court was set by hand; None for a court from dispatch (or no
    # court). Hand-set matches on a court play before dispatched ones, in
    # the order they were set (see app.dispatch).
    court_set_at: datetime | None = None
    # A playoff match's place in the court queue: the order in which the
    # tournament's playoff matches became ready (see app.dispatch).
    ready_order: int | None = None
    # The reffing team, or None for no ref (N/A).
    ref_team_id: int | None = Field(default=None, foreign_key="team.id")
    # When the ref was chosen by hand; None for an automatic ref (see
    # app.refs). A hand-set None ref is a deliberate N/A.
    ref_set_at: datetime | None = None
    # A playoff match's court when its automatic ref was chosen, so the ref
    # isn't chosen again while it stays there (see app.bracket_refs).
    ref_court: int | None = None
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

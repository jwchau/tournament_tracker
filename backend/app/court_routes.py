"""What's on each court right now, for scorekeepers standing at one."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session, SQLModel, select

from app.db import get_session
from app.dispatch import Snapshot
from app.models import Match, PlayoffBracket, Team, Tournament
from app.pool_routes import _pools_in_order, _tournament_or_404
from app.pools import pool_courts
from app.rows import json_response, match_rows
from app.series import best_of_in

router = APIRouter()

UP_NEXT = 3


class CourtMatch(SQLModel):
    """A match with everything its score form needs, so a court page makes no other requests."""

    id: int
    bracket: str
    round: int
    position: int
    pool_id: int | None
    playoff_bracket_id: int | None
    team1_id: int | None
    team2_id: int | None
    team1_name: str | None
    team2_name: str | None
    team1_score: int | None
    team2_score: int | None
    # A series' game in play (see Match).
    game_team1_score: int | None = None
    game_team2_score: int | None = None
    status: str
    court: int | None
    scheduled_time: datetime | None
    best_of: int
    # The most points a team can score in a game of this match; 0 means no cap.
    point_cap: int = 0
    ref_team_id: int | None = None
    ref_name: str | None = None
    ref_set_at: datetime | None = None
    version: int


class CourtSummary(SQLModel):
    court: int
    use: Literal["pool", "playoff"] | None
    # The pool's name or "Bracket N".
    label: str | None
    # "Bracket M" while the court is lent to another bracket (one without
    # courts of its own, or any bracket once this one is finished) and its
    # current match is that bracket's, otherwise None.
    now_playing: str | None = None
    pool_id: int | None
    playoff_bracket_id: int | None
    # The earliest unfinished match on the court with both teams, or None if it's empty.
    current: CourtMatch | None
    # A pool court's next scheduled matches; for a playoff court, any matches
    # set on it by hand behind the one playing, then the front of its
    # bracket's queue (including any overflow brackets' matches, and leaving
    # out held ones), which goes to whichever of the bracket's courts frees
    # first.
    up_next: list[CourtMatch]


# The Match columns a court page needs; the rest of CourtMatch is worked out below.
_COURT_MATCH_FIELDS = tuple(
    name
    for name in CourtMatch.model_fields
    if name not in ("team1_name", "team2_name", "ref_name", "best_of", "point_cap")
)


@router.get("/tournaments/{tournament_id}/courts", response_model=list[CourtSummary])
def list_courts(tournament_id: int, session: Session = Depends(get_session)):
    """Every court with its current match and what's next.

    Once there are playoff brackets the courts are theirs, split by tier;
    before that they're split between pools. Built from plain rows (see app.rows).
    """
    tournament = _tournament_or_404(session, tournament_id)
    names = dict(
        session.exec(select(Team.id, Team.name).where(Team.tournament_id == tournament_id)).all()
    )

    def as_court_match(match) -> dict:
        data = {name: getattr(match, name) for name in _COURT_MATCH_FIELDS}
        data["team1_name"] = names.get(match.team1_id)
        data["team2_name"] = names.get(match.team2_id)
        data["ref_name"] = names.get(match.ref_team_id)
        data["best_of"] = (
            best_of_in(tournament, match.bracket) if match.playoff_bracket_id is not None else 1
        )
        data["point_cap"] = tournament.pool_point_cap if match.pool_id is not None else 0
        return data

    brackets = list(
        session.execute(
            select(PlayoffBracket.id, PlayoffBracket.tier)
            .where(PlayoffBracket.tournament_id == tournament_id)
            .order_by(PlayoffBracket.tier)
        ).all()
    )

    def empty(court: int) -> dict:
        return {
            "court": court,
            "use": None,
            "label": None,
            "now_playing": None,
            "pool_id": None,
            "playoff_bracket_id": None,
            "current": None,
            "up_next": [],
        }

    courts = {court: empty(court) for court in range(1, tournament.court_count + 1)}
    if brackets:
        tiers = {bracket_id: tier for bracket_id, tier in brackets}
        # One read of the playoff matches answers every question below.
        snapshot = Snapshot(session, tournament_id, rows=True)
        lines = snapshot.lines()

        def lent_to(bracket_id: int, current) -> str | None:
            if current is None or current.playoff_bracket_id == bracket_id:
                return None
            return f"Bracket {tiers[current.playoff_bracket_id]}"

        for bracket_id, tier in brackets:
            # A bracket without courts of its own (overflow) waits in line on
            # the others' courts, so its matches show up in their up next.
            if snapshot.overflow(bracket_id):
                continue
            waiting = snapshot.queue(bracket_id)
            for court, match_id in snapshot.occupancy(bracket_id).items():
                current = snapshot.by_id[match_id] if match_id is not None else None
                # Matches set here by hand behind the one playing come before the queue.
                line = lines.get(court, [])[1:] + waiting
                courts[court] = {
                    "court": court,
                    "use": "playoff",
                    "label": f"Bracket {tier}",
                    "now_playing": lent_to(bracket_id, current),
                    "pool_id": None,
                    "playoff_bracket_id": bracket_id,
                    "current": as_court_match(current) if current is not None else None,
                    "up_next": [as_court_match(snapshot.by_id[next_id]) for next_id in line[:UP_NEXT]],
                }
    else:
        pools = _pools_in_order(session, tournament_id)
        # Pool matches always have both teams, in schedule (slot) order. Any pool's
        # match can be on a court: one moved there by hand is played there.
        on_courts: dict[int, list] = {}
        for match in match_rows(
            session,
            Match.tournament_id == tournament_id,
            Match.pool_id.is_not(None),
            Match.court.is_not(None),
            Match.status != "complete",
            order_by=(Match.round, Match.position),
        ):
            on_courts.setdefault(match.court, []).append(match)
        for pool, pool_court_numbers in zip(pools, pool_courts(tournament.court_count, len(pools))):
            for court in pool_court_numbers:
                matches = on_courts.get(court, [])
                courts[court] = {
                    "court": court,
                    "use": "pool",
                    "label": pool.name,
                    "now_playing": None,
                    "pool_id": pool.id,
                    "playoff_bracket_id": None,
                    "current": as_court_match(matches[0]) if matches else None,
                    "up_next": [as_court_match(match) for match in matches[1 : UP_NEXT + 1]],
                }
    return json_response(list(courts.values()))

"""What's on each court right now, for scorekeepers standing at one."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session, SQLModel, select

from app.db import get_session
from app.dispatch import court_occupancy, is_overflow, queue
from app.models import Match, PlayoffBracket, Team, Tournament
from app.pool_routes import _pools_in_order, _tournament_or_404
from app.pools import pool_courts

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
    status: str
    court: int | None
    scheduled_time: datetime | None
    best_of: int
    version: int


class CourtSummary(SQLModel):
    court: int
    use: Literal["pool", "playoff"] | None
    # The pool's name or "Bracket N".
    label: str | None
    pool_id: int | None
    playoff_bracket_id: int | None
    # The earliest unfinished match on the court with both teams, or None if it's empty.
    current: CourtMatch | None
    # A pool court's next scheduled matches; for a playoff court, the front of
    # its bracket's queue (including any overflow brackets' matches, and
    # leaving out held ones), which goes to whichever of the bracket's courts
    # frees first.
    up_next: list[CourtMatch]


@router.get("/tournaments/{tournament_id}/courts", response_model=list[CourtSummary])
def list_courts(tournament_id: int, session: Session = Depends(get_session)) -> list[CourtSummary]:
    """Every court with its current match and what's next.

    Once there are playoff brackets the courts are theirs, split by tier;
    before that they're split between pools.
    """
    tournament = _tournament_or_404(session, tournament_id)
    names = dict(
        session.exec(select(Team.id, Team.name).where(Team.tournament_id == tournament_id)).all()
    )

    def as_court_match(match: Match) -> CourtMatch:
        return CourtMatch(
            **match.model_dump(),
            team1_name=names.get(match.team1_id),
            team2_name=names.get(match.team2_id),
            best_of=tournament.playoff_best_of if match.playoff_bracket_id is not None else 1,
        )

    brackets = list(
        session.exec(
            select(PlayoffBracket)
            .where(PlayoffBracket.tournament_id == tournament_id)
            .order_by(PlayoffBracket.tier)
        ).all()
    )
    courts = {
        court: CourtSummary(
            court=court,
            use=None,
            label=None,
            pool_id=None,
            playoff_bracket_id=None,
            current=None,
            up_next=[],
        )
        for court in range(1, tournament.court_count + 1)
    }
    if brackets:
        for bracket in brackets:
            # A bracket without courts of its own (overflow) waits in line on
            # the others' courts, so its matches show up in their up next.
            if is_overflow(session, bracket.id):
                continue
            waiting = [session.get(Match, match_id) for match_id in queue(session, bracket.id)]
            up_next = [as_court_match(match) for match in waiting[:UP_NEXT]]
            for court, match_id in court_occupancy(session, bracket.id).items():
                current = session.get(Match, match_id) if match_id is not None else None
                courts[court] = CourtSummary(
                    court=court,
                    use="playoff",
                    label=f"Bracket {bracket.tier}",
                    pool_id=None,
                    playoff_bracket_id=bracket.id,
                    current=as_court_match(current) if current is not None else None,
                    up_next=up_next,
                )
    else:
        pools = _pools_in_order(session, tournament_id)
        for pool, pool_court_numbers in zip(pools, pool_courts(tournament.court_count, len(pools))):
            for court in pool_court_numbers:
                # Pool matches always have both teams, in schedule (slot) order.
                # Any pool's: a match moved here by hand is played here.
                matches = session.exec(
                    select(Match)
                    .where(
                        Match.tournament_id == tournament_id,
                        Match.pool_id.is_not(None),
                        Match.court == court,
                        Match.status != "complete",
                    )
                    .order_by(Match.round, Match.position)
                ).all()
                courts[court] = CourtSummary(
                    court=court,
                    use="pool",
                    label=pool.name,
                    pool_id=pool.id,
                    playoff_bracket_id=None,
                    current=as_court_match(matches[0]) if matches else None,
                    up_next=[as_court_match(match) for match in matches[1 : UP_NEXT + 1]],
                )
    return list(courts.values())

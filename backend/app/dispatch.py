"""Playoff court dispatch: each bracket's ready matches queue for that bracket's own courts.

Courts are split across a tournament's playoff brackets the same way they
are across pools (even split, remainder to the earliest tiers). A playoff
match joins its bracket's queue when both its teams are known, and the
queue is first come, first served: whenever a match becomes ready or a
court frees up, the longest-waiting matches go onto the free courts,
lowest court number first.

A match keeps its court once it's complete (it was played there) but only
unfinished matches occupy one. A court set by hand is left alone: it takes
the match out of the queue and occupies that court like any other.
"""

from sqlmodel import Session, func, select, update

from app.models import Match, PlayoffBracket, Tournament
from app.pools import pool_courts

UNFINISHED = ("ready", "in_progress")


def bracket_courts(session: Session, bracket_id: int) -> list[int]:
    """The court numbers a playoff bracket has to itself."""
    bracket = session.get(PlayoffBracket, bracket_id)
    tiers = list(
        session.exec(
            select(PlayoffBracket.id)
            .where(PlayoffBracket.tournament_id == bracket.tournament_id)
            .order_by(PlayoffBracket.tier)
        ).all()
    )
    court_count = session.get(Tournament, bracket.tournament_id).court_count
    return pool_courts(court_count, len(tiers))[tiers.index(bracket_id)]


def _waiting(bracket_id: int):
    """Unfinished matches of the bracket with both teams known."""
    return select(Match.id, Match.court, Match.ready_order).where(
        Match.playoff_bracket_id == bracket_id,
        Match.status.in_(UNFINISHED),
        Match.team1_id.is_not(None),
        Match.team2_id.is_not(None),
    )


def _occupied_courts(session: Session, tournament_id: int) -> dict[int, int]:
    """Court -> the unfinished playoff match on it (the earliest ready, if hand-doubled)."""
    rows = session.exec(
        select(Match.court, Match.id)
        .where(
            Match.tournament_id == tournament_id,
            Match.playoff_bracket_id.is_not(None),
            Match.status.in_(UNFINISHED),
            Match.court.is_not(None),
        )
        .order_by(Match.ready_order.desc(), Match.id.desc())
    ).all()
    return dict(rows)


def queue(session: Session, bracket_id: int) -> list[int]:
    """Ids of the bracket's matches waiting for a court, first in line first."""
    rows = session.exec(
        _waiting(bracket_id).where(Match.court.is_(None)).order_by(Match.ready_order, Match.id)
    ).all()
    return [row.id for row in rows]


def court_occupancy(session: Session, bracket_id: int) -> dict[int, int | None]:
    """Each of the bracket's courts and the unfinished match on it, or None if it's free."""
    tournament_id = session.get(PlayoffBracket, bracket_id).tournament_id
    occupied = _occupied_courts(session, tournament_id)
    return {court: occupied.get(court) for court in bracket_courts(session, bracket_id)}


def dispatch(session: Session, bracket_id: int) -> None:
    """Queue newly ready matches, then fill the bracket's free courts from the queue.

    Runs inside the caller's transaction, uncommitted, after the change that
    made a match ready or freed a court. Court assignment isn't a score
    change, so it doesn't bump match versions.
    """
    newly_ready = session.exec(
        _waiting(bracket_id).where(Match.ready_order.is_(None)).order_by(Match.id)
    ).all()
    last = session.exec(
        select(func.max(Match.ready_order)).where(Match.playoff_bracket_id == bracket_id)
    ).one()
    for order, row in enumerate(newly_ready, start=(last or 0) + 1):
        session.execute(update(Match).where(Match.id == row.id).values(ready_order=order))

    occupancy = court_occupancy(session, bracket_id)
    free = [court for court, match_id in occupancy.items() if match_id is None]
    for match_id, court in zip(queue(session, bracket_id), free):
        session.execute(update(Match).where(Match.id == match_id).values(court=court))


def redispatch(session: Session, tournament_id: int) -> None:
    """Take every unfinished playoff match off its court and dispatch afresh, uncommitted.

    For when the court count changes, which re-splits the courts between
    brackets (only possible before play starts). Queue order is kept.
    """
    session.flush()
    session.execute(
        update(Match)
        .where(
            Match.tournament_id == tournament_id,
            Match.playoff_bracket_id.is_not(None),
            Match.status.in_(UNFINISHED),
        )
        .values(court=None)
    )
    for bracket_id in session.exec(
        select(PlayoffBracket.id)
        .where(PlayoffBracket.tournament_id == tournament_id)
        .order_by(PlayoffBracket.tier)
    ).all():
        dispatch(session, bracket_id)

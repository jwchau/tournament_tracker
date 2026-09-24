"""Playoff court dispatch: each bracket's ready matches queue for that bracket's own courts.

Courts are split across a tournament's playoff brackets the same way they
are across pools (even split, remainder to the earliest tiers). A playoff
match joins the queue when both its teams are known, and the queue is
first come, first served: whenever a match becomes ready or a court frees
up, the longest-waiting matches go onto the free courts, lowest court
number first.

With more brackets than courts, the later brackets own no courts. Their
matches are overflow: any bracket's court that frees up goes to whichever
has waited longest, its own bracket's matches or the overflow ones, so a
bracket without courts is never starved. A bracket that owns courts never
uses another's.

A match keeps its court once it's complete (it was played there) but only
unfinished matches occupy one. A court set by hand is left alone: it takes
the match out of the queue and occupies that court like any other. A match
on hold is skipped until it's released, then waits in its original place.
"""

from sqlmodel import Session, func, select, update

from app.models import Match, PlayoffBracket, Tournament
from app.pools import pool_courts

UNFINISHED = ("ready", "in_progress")


def _courts_by_bracket(session: Session, tournament_id: int) -> dict[int, list[int]]:
    """Each playoff bracket's own court numbers, in tier order (empty for overflow brackets)."""
    bracket_ids = list(
        session.exec(
            select(PlayoffBracket.id)
            .where(PlayoffBracket.tournament_id == tournament_id)
            .order_by(PlayoffBracket.tier)
        ).all()
    )
    court_count = session.get(Tournament, tournament_id).court_count
    return dict(zip(bracket_ids, pool_courts(court_count, len(bracket_ids))))


def _waiting(tournament_id: int):
    """The tournament's unfinished playoff matches with both teams known."""
    return select(Match.id).where(
        Match.tournament_id == tournament_id,
        Match.playoff_bracket_id.is_not(None),
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


def _tournament_of(session: Session, bracket_id: int) -> int:
    return session.get(PlayoffBracket, bracket_id).tournament_id


def is_overflow(session: Session, bracket_id: int) -> bool:
    """Whether the bracket owns no courts, so its matches take any bracket's freed court."""
    return not _courts_by_bracket(session, _tournament_of(session, bracket_id))[bracket_id]


def queue(session: Session, bracket_id: int) -> list[int]:
    """Ids of the matches in line for the bracket's courts, first in line first.

    For a bracket with courts that's its own waiting matches merged with
    every overflow bracket's; for an overflow bracket, just the overflow
    matches, which take whichever court frees first. Held matches aren't
    in line.
    """
    tournament_id = _tournament_of(session, bracket_id)
    courts = _courts_by_bracket(session, tournament_id)
    eligible = [other for other, owned in courts.items() if not owned]
    if courts[bracket_id]:
        eligible.append(bracket_id)
    rows = session.exec(
        _waiting(tournament_id)
        .where(
            Match.playoff_bracket_id.in_(eligible),
            Match.court.is_(None),
            Match.on_hold.is_(False),
        )
        .order_by(Match.ready_order, Match.id)
    ).all()
    return list(rows)


def court_occupancy(session: Session, bracket_id: int) -> dict[int, int | None]:
    """The courts the bracket's matches can go on, each with its unfinished match or None if free.

    A bracket's own courts, or for an overflow bracket every bracket's courts.
    """
    tournament_id = _tournament_of(session, bracket_id)
    courts = _courts_by_bracket(session, tournament_id)
    usable = courts[bracket_id] or sorted(court for owned in courts.values() for court in owned)
    occupied = _occupied_courts(session, tournament_id)
    return {court: occupied.get(court) for court in usable}


def dispatch(session: Session, tournament_id: int) -> None:
    """Queue newly ready playoff matches, then fill every free court from its queue.

    Runs inside the caller's transaction, uncommitted, after the change that
    made a match ready or freed a court. Court assignment isn't a score
    change, so it doesn't bump match versions. The ready order is one
    sequence across the tournament, so overflow matches can be compared
    with any bracket's.
    """
    newly_ready = session.exec(
        _waiting(tournament_id).where(Match.ready_order.is_(None)).order_by(Match.id)
    ).all()
    last = session.exec(
        select(func.max(Match.ready_order)).where(Match.tournament_id == tournament_id)
    ).one()
    for order, match_id in enumerate(newly_ready, start=(last or 0) + 1):
        session.execute(update(Match).where(Match.id == match_id).values(ready_order=order))

    occupied = _occupied_courts(session, tournament_id)
    for bracket_id, courts in _courts_by_bracket(session, tournament_id).items():
        for court in courts:
            if court in occupied:
                continue
            waiting = queue(session, bracket_id)
            if not waiting:
                break
            session.execute(update(Match).where(Match.id == waiting[0]).values(court=court))
            occupied[court] = waiting[0]


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
    dispatch(session, tournament_id)

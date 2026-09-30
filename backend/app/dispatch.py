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
bracket without courts is never starved. A bracket that owns courts
doesn't use another's while that one is still playing, but once a bracket
is finished (every match complete) its courts are lent to every bracket
still playing. A lent court takes the earliest round waiting (grand finals
last), then the longest waiting; a bracket's own courts stay first come,
first served. If a correction reopens a finished bracket, its courts go
back to it as they free up.

A match keeps its court once it's complete (it was played there) but only
unfinished matches occupy one. A court set by hand is left alone: it takes
the match out of the queue and occupies that court like any other. It can
double-book a court: a match already under way there plays on, then the
hand-set matches in the order they were set; an unstarted dispatched match
there goes back to the front of the queue instead. A match
on hold is skipped until it's released, then waits in its original place.
"""

from datetime import datetime

from sqlmodel import Session, select, update

from app.models import Match, PlayoffBracket, Tournament
from app.pools import pool_courts
from app.rows import match_rows

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


def _court_priority(match: Match) -> tuple:
    """Who plays first on a court with several matches: one already under
    way, then those set there by hand in the order they were set, then the
    dispatched one."""
    started = match.team1_score is not None or match.team2_score is not None
    by_hand = match.court_set_at is not None
    return (not started, not by_hand, match.court_set_at or datetime.max, match.ready_order or 0, match.id)


class Snapshot:
    """A tournament's playoff matches and how its courts are split, read once.

    Who is on a court, who is next and which brackets are finished are all
    answered from the same playoff matches. They are read in one query and
    worked out in memory, rather than asked of the database again for each
    court, bracket and question. Reading refreshes the matches from the
    database, so changes made by bulk updates are seen; pending changes are
    flushed first.

    Assigning a court by setting `match.court` here is seen by the next
    question, so a loop that fills courts one after another stays consistent.
    """

    def __init__(self, session: Session, tournament_id: int, rows: bool = False) -> None:
        session.flush()
        self.tournament_id = tournament_id
        self.courts = _courts_by_bracket(session, tournament_id)
        where = (Match.tournament_id == tournament_id, Match.playoff_bracket_id.is_not(None))
        if rows:
            # A read that only looks: plain rows, no ORM objects. (Assigning a court needs the objects.)
            self.matches = list(match_rows(session, *where))
        else:
            self.matches: list[Match] = list(
                session.exec(select(Match).where(*where).execution_options(populate_existing=True)).all()
            )
        self.by_id = {match.id: match for match in self.matches}

    def waiting(self) -> list[Match]:
        """Unfinished playoff matches with both teams known."""
        return [
            match
            for match in self.matches
            if match.status in UNFINISHED and match.team1_id is not None and match.team2_id is not None
        ]

    def finished_brackets(self) -> set[int]:
        """The playoff brackets with every match complete."""
        unfinished = {match.playoff_bracket_id for match in self.matches if match.status != "complete"}
        return {match.playoff_bracket_id for match in self.matches} - unfinished

    def lines(self) -> dict[int, list[int]]:
        """Court -> the unfinished playoff matches on it, the one playing now first."""
        on_courts: dict[int, list[Match]] = {}
        for match in self.matches:
            if match.status in UNFINISHED and match.court is not None:
                on_courts.setdefault(match.court, []).append(match)
        return {
            court: [match.id for match in sorted(line, key=_court_priority)]
            for court, line in on_courts.items()
        }

    def occupied(self) -> dict[int, int]:
        """Court -> the unfinished playoff match playing on it."""
        return {court: line[0] for court, line in self.lines().items()}

    def _in_line(self) -> list[Match]:
        """Waiting matches with no court that aren't on hold."""
        return [match for match in self.waiting() if match.court is None and not match.on_hold]

    def queue(self, bracket_id: int) -> list[int]:
        """Ids of the matches in line for the bracket's courts, first in line first.

        For a bracket with courts that's its own waiting matches merged with
        every overflow bracket's; for an overflow bracket, just the overflow
        matches, which take whichever court frees first; for a finished bracket,
        the other brackets' matches its lent courts take (earliest round first,
        grand finals last). Held matches aren't in line.
        """
        if self.courts[bracket_id] and bracket_id in self.finished_brackets():
            lent = sorted(
                self._in_line(),
                key=lambda m: (m.bracket == "grand_final", m.round, m.ready_order or 0, m.id),
            )
            return [match.id for match in lent]
        eligible = [other for other, owned in self.courts.items() if not owned]
        if self.courts[bracket_id]:
            eligible.append(bracket_id)
        rows = [match for match in self._in_line() if match.playoff_bracket_id in eligible]
        rows.sort(key=lambda m: (m.ready_order is not None, m.ready_order or 0, m.id))
        return [match.id for match in rows]

    def occupancy(self, bracket_id: int) -> dict[int, int | None]:
        """The courts the bracket's matches can go on, each with its unfinished match or None if free.

        A bracket's own courts, or for an overflow bracket every bracket's courts.
        """
        usable = self.courts[bracket_id] or sorted(
            court for owned in self.courts.values() for court in owned
        )
        occupied = self.occupied()
        return {court: occupied.get(court) for court in usable}

    def overflow(self, bracket_id: int) -> bool:
        """Whether the bracket owns no courts, so its matches take any bracket's freed court."""
        return not self.courts[bracket_id]


def bump_dispatched(session: Session, tournament_id: int, court: int, set_by_hand: int) -> None:
    """Send an unstarted dispatched match back to the queue when a match is set on its court by hand.

    It keeps its ready order, so it's at the front of the line for the next
    free court. A match already under way keeps the court. Uncommitted.
    """
    session.execute(
        update(Match)
        .where(
            Match.tournament_id == tournament_id,
            Match.playoff_bracket_id.is_not(None),
            Match.status.in_(UNFINISHED),
            Match.court == court,
            Match.id != set_by_hand,
            Match.court_set_at.is_(None),
            Match.team1_score.is_(None),
            Match.team2_score.is_(None),
        )
        .values(court=None)
    )


def _tournament_of(session: Session, bracket_id: int) -> int:
    return session.get(PlayoffBracket, bracket_id).tournament_id


def _snapshot_for(session: Session, bracket_id: int, snapshot: Snapshot | None) -> Snapshot:
    return snapshot or Snapshot(session, _tournament_of(session, bracket_id))


# These each read the tournament afresh unless given the Snapshot of a caller that asks
# several questions in a row.


def court_lines(
    session: Session, tournament_id: int, snapshot: Snapshot | None = None
) -> dict[int, list[int]]:
    """Court -> the unfinished playoff matches on it, the one playing now first."""
    return (snapshot or Snapshot(session, tournament_id)).lines()


def is_overflow(session: Session, bracket_id: int, snapshot: Snapshot | None = None) -> bool:
    """Whether the bracket owns no courts, so its matches take any bracket's freed court."""
    return _snapshot_for(session, bracket_id, snapshot).overflow(bracket_id)


def queue(session: Session, bracket_id: int, snapshot: Snapshot | None = None) -> list[int]:
    """Ids of the matches in line for the bracket's courts, first in line first (see Snapshot.queue)."""
    return _snapshot_for(session, bracket_id, snapshot).queue(bracket_id)


def court_occupancy(
    session: Session, bracket_id: int, snapshot: Snapshot | None = None
) -> dict[int, int | None]:
    """The courts the bracket's matches can go on, each with its unfinished match or None if free."""
    return _snapshot_for(session, bracket_id, snapshot).occupancy(bracket_id)


def dispatch(session: Session, tournament_id: int) -> None:
    """Queue newly ready playoff matches, then fill every free court from its queue.

    Runs inside the caller's transaction, uncommitted, after the change that
    made a match ready or freed a court. Court assignment isn't a score
    change, so it doesn't bump match versions. The ready order is one
    sequence across the tournament, so overflow matches can be compared
    with any bracket's.
    """
    snapshot = Snapshot(session, tournament_id)
    newly_ready = sorted(
        (match for match in snapshot.waiting() if match.ready_order is None), key=lambda m: m.id
    )
    last = max((m.ready_order for m in snapshot.matches if m.ready_order is not None), default=0)
    for order, match in enumerate(newly_ready, start=last + 1):
        match.ready_order = order

    occupied = snapshot.occupied()
    # Brackets still playing fill their own courts before finished ones lend theirs.
    finished = snapshot.finished_brackets()
    for bracket_id, courts in sorted(snapshot.courts.items(), key=lambda item: item[0] in finished):
        for court in courts:
            if court in occupied:
                continue
            waiting = snapshot.queue(bracket_id)
            if not waiting:
                break
            snapshot.by_id[waiting[0]].court = court
            occupied[court] = waiting[0]

    # Refs follow the courts; they never hold a match back.
    from app.bracket_refs import sync_bracket_refs

    session.flush()
    sync_bracket_refs(session, tournament_id)


def redispatch(session: Session, tournament_id: int) -> None:
    """Take every playoff match not yet started off its court and dispatch afresh, uncommitted.

    For when the court count changes, which re-splits the courts between
    brackets. A match already under way stays on its court, even one that no
    longer exists, and finishes there. Queue order is kept.
    """
    session.flush()
    session.execute(
        update(Match)
        .where(
            Match.tournament_id == tournament_id,
            Match.playoff_bracket_id.is_not(None),
            Match.status == "ready",
        )
        .values(court=None, court_set_at=None)
    )
    dispatch(session, tournament_id)

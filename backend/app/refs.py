from dataclasses import dataclass

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.models import Match, Pool, Team


@dataclass(frozen=True)
class RefSlotMatch:
    """What ref assignment needs to know about one match in a slot."""

    match_id: int
    team1_id: int | None
    team2_id: int | None
    # A hand-set ref (or hand-set N/A), which assignment keeps as it is.
    hand_set: bool = False
    ref_team_id: int | None = None


def assign_refs(team_ids: list[int], slots: list[list[RefSlotMatch]]) -> dict[int, int | None]:
    """A ref (or None for N/A) for each match that isn't hand-set, by match id.

    Slots are taken in order, and each slot's matches in court order. A
    match's candidates are the teams (best seed first in `team_ids`) that
    aren't playing in its slot and aren't already reffing there. The one
    that has reffed the fewest matches so far wins; ties go to a team that
    didn't ref in the previous slot, then to the best seed. Hand-set refs
    count toward those totals like any other.
    """
    order = {team_id: index for index, team_id in enumerate(team_ids)}
    counts = dict.fromkeys(team_ids, 0)
    previous: set[int] = set()
    assigned: dict[int, int | None] = {}
    for slot in slots:
        playing = {team for match in slot for team in (match.team1_id, match.team2_id)}
        reffing = {m.ref_team_id for m in slot if m.hand_set and m.ref_team_id is not None}
        for match in slot:
            if match.hand_set:
                continue
            candidates = [t for t in team_ids if t not in playing and t not in reffing]
            ref = min(
                candidates,
                key=lambda team: (counts[team], team in previous, order[team]),
                default=None,
            )
            assigned[match.match_id] = ref
            if ref is not None:
                reffing.add(ref)
        for ref in reffing:
            if ref in counts:
                counts[ref] += 1
        previous = reffing
    return assigned


def pool_team_ids(session: Session, pool_id: int) -> list[int]:
    """The pool's teams, best seed first (unseeded last)."""
    teams = session.exec(select(Team).where(Team.pool_id == pool_id)).all()
    return [
        team.id for team in sorted(teams, key=lambda t: (t.seed is None, t.seed or 0, t.id))
    ]


def reassign_pool_refs(session: Session, pool_id: int) -> None:
    """Recompute every automatic ref in a pool, uncommitted; hand-set refs stay.

    Only the ref columns change: a match's version is left alone, so a
    scorekeeper mid-match isn't sent a version conflict by someone else's
    ref change.
    """
    matches = session.exec(
        select(Match).where(Match.pool_id == pool_id).order_by(Match.round, Match.position)
    ).all()
    slots: dict[int, list[RefSlotMatch]] = {}
    for match in matches:
        slots.setdefault(match.round, []).append(
            RefSlotMatch(
                match_id=match.id,
                team1_id=match.team1_id,
                team2_id=match.team2_id,
                hand_set=match.ref_set_at is not None,
                ref_team_id=match.ref_team_id,
            )
        )
    assigned = assign_refs(pool_team_ids(session, pool_id), [slots[r] for r in sorted(slots)])
    for match in matches:
        if match.id in assigned and match.ref_team_id != assigned[match.id]:
            match.ref_team_id = assigned[match.id]
            session.add(match)


def backfill_pool_refs(bind: Engine) -> None:
    """Give refs to scheduled pools from before refs were stored. Safe to rerun.

    A pool is skipped once any of its matches has a ref or a hand-set N/A.
    One whose refs all came out N/A (e.g. every team plays every slot) is
    recomputed each time, to the same result.
    """
    with Session(bind) as session:
        for pool in session.exec(select(Pool)).all():
            matches = session.exec(select(Match).where(Match.pool_id == pool.id)).all()
            if not matches or any(
                m.ref_team_id is not None or m.ref_set_at is not None for m in matches
            ):
                continue
            reassign_pool_refs(session, pool.id)
        session.commit()

"""What can change in a tournament's settings, and when, and what a change would do.

The name, date and venue change any time. The rest are locked by how far the
tournament has got:

- games per pairing and pool size: once any match has a score;
- advance per pool and the number of brackets: once the playoff brackets exist;
- the playoff best-of: once a playoff match has a score;
- court count: never. Matches being played stay put (see `redispatch`).
"""

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.models import Match, PlayoffBracket, Team, Tournament
from app.playoffs import pool_split

FREE = {"name", "date", "venue"}

LABELS = {
    "advance_per_pool": "Advance per pool",
    "playoff_bracket_count": "The number of playoff brackets",
    "court_count": "Court count",
    "games_per_pairing": "Games per pairing",
    "target_pool_size": "Pool size",
    "playoff_best_of": "Playoff best-of",
}

PLAY_STARTED = "play has started"
BRACKETS_EXIST = "the playoff brackets exist; reset them first"
PLAYOFF_SCORED = "a playoff match has been scored"


def _any_score(session: Session, tournament_id: int, playoffs_only: bool = False) -> bool:
    query = select(Match.id).where(
        Match.tournament_id == tournament_id,
        Match.team1_score.is_not(None) | Match.team2_score.is_not(None),
    )
    if playoffs_only:
        query = query.where(Match.playoff_bracket_id.is_not(None))
    return session.exec(query).first() is not None


def _brackets(session: Session, tournament_id: int) -> int:
    return session.exec(
        select(func.count(PlayoffBracket.id)).where(PlayoffBracket.tournament_id == tournament_id)
    ).one()


def setting_locks(session: Session, tournament: Tournament) -> dict[str, str]:
    """Each setting that can't change right now, with why."""
    locks: dict[str, str] = {}
    if _any_score(session, tournament.id):
        locks["games_per_pairing"] = locks["target_pool_size"] = PLAY_STARTED
    if _brackets(session, tournament.id):
        locks["advance_per_pool"] = locks["playoff_bracket_count"] = BRACKETS_EXIST
    if _any_score(session, tournament.id, playoffs_only=True):
        locks["playoff_best_of"] = PLAYOFF_SCORED
    return locks


def changed_settings(tournament: Tournament, changes: dict) -> dict:
    """The requested changes to the locked settings that differ from what's set now."""
    normalized = dict(changes)
    if "advance_per_pool" in normalized:
        normalized["advance_per_pool"] = normalized["advance_per_pool"] or 0
    return {
        field: value
        for field, value in normalized.items()
        if field not in FREE and value != getattr(tournament, field)
    }


def refuse_locked(session: Session, tournament: Tournament, changed: dict) -> None:
    locks = setting_locks(session, tournament)
    for field in changed:
        if field in locks:
            raise HTTPException(
                status_code=400, detail=f"{LABELS[field]} can't change now: {locks[field]}"
            )


def _plural(count: int, noun: str, plural: str | None = None) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {plural or noun + 's'}"


def setting_effects(session: Session, tournament: Tournament, changed: dict) -> list[str]:
    """What saving these changes would do to what already exists, in words."""
    effects: list[str] = []
    tournament_id = tournament.id
    pool_matches = session.exec(
        select(func.count(Match.id)).where(
            Match.tournament_id == tournament_id, Match.pool_id.is_not(None)
        )
    ).one()
    brackets = _brackets(session, tournament_id)

    if "court_count" in changed:
        courts = changed["court_count"]
        waiting = session.exec(
            select(func.count(Match.id)).where(
                Match.tournament_id == tournament_id,
                Match.playoff_bracket_id.is_not(None),
                Match.status == "ready",
            )
        ).one()
        if waiting:
            effects.append(
                f"{_plural(waiting, 'playoff match', 'playoff matches')} not yet started will be moved to the "
                f"{_plural(courts, 'court')}. A match being played stays on its court."
            )
        if pool_matches:
            effects.append(
                "Pool schedules that exist keep the courts they were built with. "
                f"The {_plural(courts, 'court')} apply to the playoffs and to any schedule "
                "you generate next."
            )

    if "advance_per_pool" in changed or "playoff_bracket_count" in changed:
        advance = changed.get("advance_per_pool", tournament.advance_per_pool)
        count = changed.get("playoff_bracket_count", tournament.playoff_bracket_count)
        sizes = [
            len(members)
            for members in _pool_members(session, tournament_id).values()
            if members
        ]
        if sizes and count >= 1:
            totals = [0] * count
            for size in sizes:
                for tier, take in enumerate(pool_split(size, advance, count)):
                    totals[tier] += take
            shares = ", ".join(
                f"Bracket {tier}: {_plural(total, 'team')}" for tier, total in enumerate(totals, start=1)
            )
            effects.append(f"Pool play will send {shares}.")
            for tier, total in enumerate(totals, start=1):
                if total < 2:
                    effects.append(
                        f"Bracket {tier} would have {_plural(total, 'team')}; every playoff "
                        "bracket needs at least 2."
                    )

    if "playoff_best_of" in changed and brackets:
        effects.append(
            f"The {_plural(brackets, 'playoff bracket')} that exist will be played best of "
            f"{changed['playoff_best_of']}."
        )

    if ("games_per_pairing" in changed or "target_pool_size" in changed) and pool_matches:
        effects.append(
            "Pool schedules that already exist keep their current games; generate a pool's "
            "schedule again to apply this."
        )
    return effects


def _pool_members(session: Session, tournament_id: int) -> dict[int, list[int]]:
    members: dict[int, list[int]] = {}
    for team in session.exec(
        select(Team).where(Team.tournament_id == tournament_id, Team.pool_id.is_not(None))
    ).all():
        members.setdefault(team.pool_id, []).append(team.id)
    return members

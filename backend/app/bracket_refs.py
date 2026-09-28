"""Refs for playoff matches, chosen when a match gets a court.

A match's ref is chosen once, for the court it's on (`Match.ref_court`), and
isn't recalculated while it stays there, so a ref doesn't change under people
mid-match. The one exception: an automatic ref who is called to play (their
own match gets a court) is replaced. A hand-set ref is never replaced.
Choosing a ref never holds a match back: dispatch fills courts first, then
refs are chosen for whatever is on them.

Who is chosen, among teams not playing on a court, not already reffing one,
and not in the match, best first:

1. The team playing next on the same court (they're already there).
2. The same bracket's knocked-out teams, most recently knocked out first.
3. The same bracket's other teams, waiting for their next match.
4. Another bracket's knocked-out teams, most recently knocked out first.
5. Teams that didn't make the playoffs.
6. Otherwise nobody (N/A).

Ties go to the team with the fewest refs so far (pool and playoff together),
then the lowest id. "Most recently knocked out" is judged by the queue order
(`ready_order`) of the match the team lost, since matches don't record when
they finished.
"""

from collections import Counter

from sqlmodel import Session, select

from app.dispatch import UNFINISHED, _courts_by_bracket, court_lines, queue
from app.models import Match, Team


def _playoff_matches(session: Session, tournament_id: int) -> list[Match]:
    # Dispatch moves matches with bulk updates, so reload rather than trust
    # objects already in the session.
    return list(
        session.exec(
            select(Match)
            .where(Match.tournament_id == tournament_id, Match.playoff_bracket_id.is_not(None))
            .execution_options(populate_existing=True)
        ).all()
    )


def _teams_of(match: Match) -> set[int]:
    return {team for team in (match.team1_id, match.team2_id) if team is not None}


def _on_court(match: Match) -> bool:
    """Whether the match is being played (or waiting its turn) on a court right now."""
    return match.court is not None and match.status in UNFINISHED


def playing_team_ids(session: Session, tournament_id: int) -> set[int]:
    """Teams in a playoff match that's on a court right now."""
    return {
        team
        for match in _playoff_matches(session, tournament_id)
        if _on_court(match)
        for team in _teams_of(match)
    }


def _knocked_out(matches: list[Match]) -> dict[int, int]:
    """Knocked-out team -> ready order of the match it went out in, for one bracket."""
    alive = {team for m in matches if m.status != "complete" for team in _teams_of(m)}
    out: dict[int, int] = {}
    for match in matches:
        if match.status != "complete" or match.winner_id is None:
            continue
        for team in _teams_of(match) - {match.winner_id} - alive:
            out[team] = max(out.get(team, 0), match.ready_order or 0)
    return out


def _next_on_court(session: Session, tournament_id: int, match: Match) -> set[int]:
    """The teams of the match due next on this match's court, as its court page shows it.

    Matches set there by hand behind this one, then the front of the queue of
    the bracket that owns the court.
    """
    line = court_lines(session, tournament_id).get(match.court, [])
    after = line[line.index(match.id) + 1 :] if match.id in line else []
    owner = next(
        (
            bracket_id
            for bracket_id, courts in _courts_by_bracket(session, tournament_id).items()
            if match.court in courts
        ),
        None,
    )
    waiting = queue(session, owner) if owner is not None else []
    upcoming = [match_id for match_id in after + waiting if match_id != match.id]
    if not upcoming:
        return set()
    return _teams_of(session.get(Match, upcoming[0]))


def choose_ref(
    session: Session, tournament_id: int, match: Match, unavailable: set[int]
) -> int | None:
    """The best ref for a playoff match on a court, by the order above, or None."""
    matches = _playoff_matches(session, tournament_id)
    by_bracket: dict[int, list[Match]] = {}
    for m in matches:
        by_bracket.setdefault(m.playoff_bracket_id, []).append(m)
    in_playoffs = {team for m in matches for team in _teams_of(m)}
    teams = session.exec(select(Team.id).where(Team.tournament_id == tournament_id)).all()
    ref_counts = Counter(
        session.exec(
            select(Match.ref_team_id).where(
                Match.tournament_id == tournament_id, Match.ref_team_id.is_not(None)
            )
        ).all()
    )

    own = match.playoff_bracket_id
    own_out = _knocked_out(by_bracket.get(own, []))
    own_alive = {team for m in by_bracket.get(own, []) for team in _teams_of(m)} - set(own_out)
    other_out: dict[int, int] = {}
    for bracket_id, bracket_matches in by_bracket.items():
        if bracket_id != own:
            other_out.update(_knocked_out(bracket_matches))
    next_up = _next_on_court(session, tournament_id, match)

    def rank(team: int) -> tuple | None:
        if team in next_up:
            step, recency = 1, 0
        elif team in own_out:
            step, recency = 2, -own_out[team]
        elif team in own_alive:
            step, recency = 3, 0
        elif team in other_out:
            step, recency = 4, -other_out[team]
        elif team not in in_playoffs:
            step, recency = 5, 0
        else:
            return None
        return (step, recency, ref_counts[team], team)

    ranked = [
        (key, team)
        for team in teams
        if team not in unavailable and team not in _teams_of(match)
        and (key := rank(team)) is not None
    ]
    return min(ranked)[1] if ranked else None


def sync_bracket_refs(session: Session, tournament_id: int) -> None:
    """Bring playoff refs in line with who is on which court, uncommitted.

    An unfinished match off the courts drops its automatic ref. A match on a
    court keeps the automatic ref chosen for that court unless the ref is now
    playing, or is taken by a hand-set ref elsewhere; otherwise it gets a new
    one. Finished matches keep whatever ref they had. Match versions aren't
    touched, like court assignment.
    """
    matches = sorted(_playoff_matches(session, tournament_id), key=lambda m: (m.court or 0, m.id))
    for match in matches:
        if match.status != "complete" and match.court is None and match.ref_set_at is None:
            if match.ref_team_id is not None or match.ref_court is not None:
                match.ref_team_id = None
                match.ref_court = None
                session.add(match)

    on_court = [m for m in matches if _on_court(m)]
    playing = {team for m in on_court for team in _teams_of(m)}
    reffing = {m.ref_team_id for m in on_court if m.ref_set_at is not None} - {None}
    automatic = [m for m in on_court if m.ref_set_at is None]
    needs_ref = []
    for match in automatic:
        keeps = (
            match.ref_court == match.court
            and match.ref_team_id not in playing
            and match.ref_team_id not in reffing
        )
        if keeps:
            if match.ref_team_id is not None:
                reffing.add(match.ref_team_id)
        else:
            needs_ref.append(match)
    for match in needs_ref:
        # Clear first so the ref being replaced doesn't count toward its own total.
        match.ref_team_id = None
        session.add(match)
        session.flush()
        ref = choose_ref(session, tournament_id, match, playing | reffing)
        match.ref_team_id = ref
        match.ref_court = match.court
        session.add(match)
        if ref is not None:
            reffing.add(ref)
    session.flush()


def backfill_bracket_refs(session: Session) -> None:
    """Give on-court playoff matches from before refs were stored a ref, uncommitted.

    Only matches on a court with no ref chosen are affected; finished ones
    stay ref-less, since who reffed them isn't known.
    """
    tournament_ids = set(
        session.exec(
            select(Match.tournament_id).where(
                Match.playoff_bracket_id.is_not(None),
                Match.court.is_not(None),
                Match.status.in_(UNFINISHED),
                Match.ref_court.is_(None),
                Match.ref_set_at.is_(None),
            )
        ).all()
    )
    for tournament_id in sorted(tournament_ids):
        sync_bracket_refs(session, tournament_id)

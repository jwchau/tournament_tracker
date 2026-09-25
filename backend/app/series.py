"""Best-of playoff series: a match played as up to N games, won by the first to a majority.

The match row keeps games won in team1_score/team2_score, so everything that
works off a match's result (advancement, corrections, the diagram) sees the
series result. The individual games live in the Game table.
"""

from sqlmodel import Session, delete, select, update

from app.models import Game, Match, PlayoffBracket, Tournament
from app.scoring import InvalidScore, MatchNotFound, VersionConflict, submit_score


def best_of(session: Session, match: Match) -> int:
    """How many games a match is played over: the tournament's playoff best-of, or 1."""
    if match.playoff_bracket_id is None:
        return 1
    bracket = session.get(PlayoffBracket, match.playoff_bracket_id)
    return session.get(Tournament, bracket.tournament_id).playoff_best_of


def games_of(session: Session, match_id: int) -> list[Game]:
    return list(
        session.exec(select(Game).where(Game.match_id == match_id).order_by(Game.number)).all()
    )


def tally(games: list[Game]) -> tuple[int, int]:
    """Games won by team 1 and team 2."""
    team1 = sum(1 for game in games if game.team1_score > game.team2_score)
    return team1, len(games) - team1


class GameNotFound(Exception):
    pass


def series_result(scores: list[tuple[int, int]], games_needed: int) -> tuple[int, int]:
    """Games won by each team in a finished series, checking it's a real one.

    No tied games, and the series ends on the game where one team reaches a
    majority: not before (it would be unfinished) and not after (extra games).
    """
    majority = games_needed // 2 + 1
    wins1 = wins2 = 0
    for index, (team1_score, team2_score) in enumerate(scores):
        if team1_score == team2_score:
            raise InvalidScore("a game can't end in a tie")
        if max(wins1, wins2) == majority:
            raise InvalidScore(f"game {index + 1} comes after the series was already decided")
        if team1_score > team2_score:
            wins1 += 1
        else:
            wins2 += 1
    if max(wins1, wins2) != majority:
        raise InvalidScore(f"a best-of-{games_needed} series needs a team to win {majority} games")
    return wins1, wins2


def replace_games(session: Session, match_id: int, scores: list[tuple[int, int]]) -> None:
    """Swap a series' games for corrected ones, uncommitted (part of the correction)."""
    session.execute(delete(Game).where(Game.match_id == match_id))
    for number, (team1_score, team2_score) in enumerate(scores, start=1):
        session.add(
            Game(match_id=match_id, number=number, team1_score=team1_score, team2_score=team2_score)
        )


def _open_series(session: Session, match_id: int, team1_score: int, team2_score: int):
    """The match and its best-of, if a game can be entered or fixed on it right now."""
    match = session.get(Match, match_id)
    if match is None:
        raise MatchNotFound(match_id)
    games_needed = best_of(session, match)
    if games_needed == 1:
        raise InvalidScore("this match is a single game; submit its score instead")
    if match.team1_id is None or match.team2_id is None:
        raise InvalidScore("both teams must be known before a game is played")
    if match.status == "complete":
        raise InvalidScore("this series is decided; correct it to change its games")
    if team1_score == team2_score:
        raise InvalidScore("a game can't end in a tie")
    return match, games_needed


def _save_tally(
    session: Session, match_id: int, games: list[Game], games_needed: int, expected_version: int
) -> None:
    """Write the series result (games won) through normal scoring, in the games' transaction.

    Reaching a majority completes the match, which advances the winner (and
    drops the loser in double elimination) exactly like a single-game result.
    A version conflict rolls back the game change too.
    """
    wins1, wins2 = tally(games)
    try:
        submit_score(
            session,
            match_id,
            wins1,
            wins2,
            expected_version,
            complete=max(wins1, wins2) > games_needed // 2,
        )
    except InvalidScore:
        session.rollback()
        raise


def set_game_in_play(
    session: Session, match_id: int, team1_score: int, team2_score: int, expected_version: int
) -> Match:
    """Save the running score of an unfinished series' game in play.

    It's shown with the match (so spectators follow the game point by point)
    but counts for nothing until the game is recorded. A tie is fine here: the
    game isn't over.
    """
    match = session.get(Match, match_id)
    if match is None:
        raise MatchNotFound(match_id)
    if best_of(session, match) == 1:
        raise InvalidScore("this match is a single game; submit its score instead")
    if match.team1_id is None or match.team2_id is None:
        raise InvalidScore("both teams must be known before a game is played")
    if match.status == "complete":
        raise InvalidScore("this series is decided; correct it to change its games")
    if team1_score < 0 or team2_score < 0:
        raise InvalidScore("a score can't be negative")

    result = session.execute(
        update(Match)
        .where(Match.id == match_id, Match.version == expected_version)
        .values(
            game_team1_score=team1_score,
            game_team2_score=team2_score,
            status="in_progress",
            version=Match.version + 1,
        )
    )
    if result.rowcount == 0:
        session.rollback()
        raise VersionConflict(match_id)
    session.commit()
    session.refresh(match)
    return match


def record_game(
    session: Session, match_id: int, team1_score: int, team2_score: int, expected_version: int
) -> Game:
    """Add the next game of an unfinished series, ending the game in play."""
    _, games_needed = _open_series(session, match_id, team1_score, team2_score)
    games = games_of(session, match_id)
    game = Game(
        match_id=match_id, number=len(games) + 1, team1_score=team1_score, team2_score=team2_score
    )
    session.add(game)
    session.execute(
        update(Match)
        .where(Match.id == match_id)
        .values(game_team1_score=None, game_team2_score=None)
    )
    _save_tally(session, match_id, [*games, game], games_needed, expected_version)
    session.refresh(game)
    return game


def edit_game(
    session: Session,
    match_id: int,
    number: int,
    team1_score: int,
    team2_score: int,
    expected_version: int,
) -> Game:
    """Fix a game of an unfinished series; nothing downstream depends on it yet."""
    _, games_needed = _open_series(session, match_id, team1_score, team2_score)
    games = games_of(session, match_id)
    game = next((g for g in games if g.number == number), None)
    if game is None:
        raise GameNotFound(number)
    game.team1_score, game.team2_score = team1_score, team2_score
    session.add(game)
    _save_tally(session, match_id, games, games_needed, expected_version)
    session.refresh(game)
    return game

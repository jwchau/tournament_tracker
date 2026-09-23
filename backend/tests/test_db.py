import sqlite3

from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.db import drop_tierless_bracket_matches, init_db
from app.models import CorrectionLog, Match, PlayoffBracket


def test_startup_cleanup_drops_bracket_matches_that_belong_to_no_tier(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    init_db(engine)
    with Session(engine) as session:
        tier = PlayoffBracket(tournament_id=1, tier=1, format="single")
        session.add(tier)
        session.flush()
        old = Match(tournament_id=1, bracket="winners", round=1, position=1, status="ready")
        old_final = Match(tournament_id=1, bracket="grand_final", round=1, position=1, status="pending")
        tiered = Match(
            tournament_id=1, bracket="winners", playoff_bracket_id=tier.id,
            round=1, position=1, status="ready",
        )
        pool = Match(tournament_id=1, bracket="pool", pool_id=None, round=1, position=1, status="ready")
        session.add_all([old, old_final, tiered, pool])
        session.flush()
        session.add(CorrectionLog(match_id=old.id, old_team1_score=1, old_team2_score=2,
                                  new_team1_score=2, new_team2_score=1))
        session.add(CorrectionLog(match_id=tiered.id, old_team1_score=1, old_team2_score=2,
                                  new_team1_score=2, new_team2_score=1))
        session.commit()
        kept = {tiered.id, pool.id}

    drop_tierless_bracket_matches(engine)

    with Session(engine) as session:
        assert {m.id for m in session.exec(select(Match)).all()} == kept
        assert [log.match_id for log in session.exec(select(CorrectionLog)).all()] == [
            next(iter(kept - {pool.id}))
        ]


def test_init_db_adds_columns_missing_from_an_existing_table(tmp_path):
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE match (
            id INTEGER PRIMARY KEY,
            tournament_id INTEGER NOT NULL,
            round INTEGER NOT NULL,
            position INTEGER NOT NULL,
            team1_id INTEGER,
            team2_id INTEGER,
            status VARCHAR NOT NULL,
            winner_id INTEGER,
            winner_next_match_id INTEGER,
            winner_next_slot INTEGER,
            loser_next_match_id INTEGER,
            loser_next_slot INTEGER,
            version INTEGER NOT NULL
        )
        """
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path}")

    init_db(engine)

    connection = sqlite3.connect(db_path)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(match)")}
    connection.close()
    assert "team1_score" in columns
    assert "team2_score" in columns


def test_init_db_preserves_existing_rows_when_adding_columns(tmp_path):
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE match (
            id INTEGER PRIMARY KEY,
            tournament_id INTEGER NOT NULL,
            round INTEGER NOT NULL,
            position INTEGER NOT NULL,
            team1_id INTEGER,
            team2_id INTEGER,
            status VARCHAR NOT NULL,
            winner_id INTEGER,
            winner_next_match_id INTEGER,
            winner_next_slot INTEGER,
            loser_next_match_id INTEGER,
            loser_next_slot INTEGER,
            version INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        "INSERT INTO match (id, tournament_id, round, position, status, version) "
        "VALUES (1, 1, 1, 1, 'ready', 1)"
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path}")

    init_db(engine)

    connection = sqlite3.connect(db_path)
    row = connection.execute(
        "SELECT tournament_id, team1_score, team2_score FROM match WHERE id = 1"
    ).fetchone()
    connection.close()
    assert row == (1, None, None)


def test_init_db_backfills_existing_rows_with_a_new_columns_default(tmp_path):
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE match (
            id INTEGER PRIMARY KEY,
            tournament_id INTEGER NOT NULL,
            round INTEGER NOT NULL,
            position INTEGER NOT NULL,
            status VARCHAR NOT NULL,
            version INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        "INSERT INTO match (id, tournament_id, round, position, status, version) "
        "VALUES (1, 1, 1, 1, 'ready', 1)"
    )
    connection.commit()
    connection.close()

    init_db(create_engine(f"sqlite:///{db_path}"))

    connection = sqlite3.connect(db_path)
    row = connection.execute("SELECT bracket FROM match WHERE id = 1").fetchone()
    connection.close()
    assert row == ("winners",)

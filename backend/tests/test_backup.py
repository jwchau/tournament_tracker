import sqlite3
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.backup import backup, database_path, main, restore
from app.db import configure_sqlite_engine, init_db
from app.models import Tournament


@pytest.fixture
def live_db(tmp_path):
    """A WAL-mode database like the running app's, with one tournament."""
    path = tmp_path / "live.db"
    engine = configure_sqlite_engine(create_engine(f"sqlite:///{path}"))
    init_db(engine)
    with Session(engine) as session:
        session.add(Tournament(name="Spring Classic"))
        session.commit()
    yield path, engine
    engine.dispose()


def _names(path):
    connection = sqlite3.connect(path)
    try:
        return [row[0] for row in connection.execute("SELECT name FROM tournament ORDER BY id")]
    finally:
        connection.close()


def test_the_database_path_comes_from_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:////data/tournament_tracker.db")

    assert str(database_path()).replace("\\", "/") == "/data/tournament_tracker.db"


def test_a_backup_is_a_timestamped_copy_including_writes_still_in_the_wal(live_db, tmp_path):
    path, engine = live_db
    # An open connection keeps the latest write in the WAL file, not the main file.
    with engine.connect() as holding_the_wal_open:
        with Session(engine) as session:
            session.add(Tournament(name="Fall Invitational"))
            session.commit()
        assert (tmp_path / "live.db-wal").stat().st_size > 0

        copy = backup(path, tmp_path / "backups", now=datetime(2026, 9, 26, 14, 30, 5))

    assert copy.name == "tournament_tracker-20260926-143005.db"
    assert _names(copy) == ["Spring Classic", "Fall Invitational"]


def test_restore_brings_back_deleted_data_and_keeps_a_copy_of_what_it_replaced(live_db, tmp_path):
    path, engine = live_db
    copy = backup(path, tmp_path / "backups")
    with Session(engine) as session:
        session.delete(session.exec(select(Tournament)).one())
        session.commit()
    engine.dispose()

    replaced = restore(copy, path, tmp_path / "backups")

    assert _names(path) == ["Spring Classic"]
    assert _names(replaced) == []
    assert replaced.name.startswith("pre-restore-")


def test_restore_refuses_a_file_that_is_not_a_database(live_db, tmp_path):
    path, _ = live_db
    junk = tmp_path / "junk.db"
    junk.write_text("not a database")

    with pytest.raises(ValueError, match="not a usable SQLite database"):
        restore(junk, path, tmp_path / "backups")

    assert _names(path) == ["Spring Classic"]


def test_the_cli_backs_up_and_restores(live_db, tmp_path, monkeypatch, capsys):
    path, engine = live_db
    engine.dispose()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path}")
    backups = tmp_path / "backups"

    assert main(["backup", "--dir", str(backups)]) == 0
    copy = next(backups.glob("tournament_tracker-*.db"))
    assert str(copy.name) in capsys.readouterr().out

    assert main(["restore", str(copy), "--dir", str(backups)]) == 0
    assert _names(path) == ["Spring Classic"]


def test_the_cli_reports_a_missing_backup_file(live_db, tmp_path, monkeypatch, capsys):
    path, _ = live_db
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path}")

    assert main(["restore", str(tmp_path / "missing.db"), "--dir", str(tmp_path)]) == 1
    assert "no backup file" in capsys.readouterr().err

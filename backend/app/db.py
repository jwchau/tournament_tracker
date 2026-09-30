import os
import sqlite3
from typing import Iterator

from sqlalchemy import event, inspect
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

# The production stack points this at a file on a named volume.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./tournament_tracker.db")


def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def configure_sqlite_engine(engine: Engine) -> Engine:
    """Register the WAL/busy_timeout pragmas an engine needs for concurrent writers."""
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine


engine = configure_sqlite_engine(
    create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
)


def _add_missing_columns(bind: Engine) -> None:
    """Patch columns added to a model since the on-disk file was created.

    `create_all` only creates tables that don't exist yet - it never alters a
    table that's already there, so a long-lived local SQLite file drifts out
    of sync as models gain fields (e.g. Match.team1_score/team2_score, added
    after some local databases already had a `match` table). This only
    handles the additive case: a new nullable column, or one with a
    `server_default`, which SQLite backfills into existing rows (e.g.
    Match.bracket = 'winners'). A renamed/dropped column or a new NOT NULL
    column without a default still needs a real migration.
    """
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    with bind.begin() as connection:
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            existing_columns = {
                column["name"] for column in inspector.get_columns(table.name)
            }
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                ddl_type = column.type.compile(dialect=bind.dialect)
                default = ""
                if column.server_default is not None:
                    value = str(column.server_default.arg).replace("'", "''")
                    default = f" DEFAULT '{value}'"
                connection.exec_driver_sql(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}{default}'
                )


# Columns the models no longer have, that older databases still carry. Only
# plain columns belong here: SQLite can't drop one that is indexed, unique or
# part of a key.
RETIRED_COLUMNS = {"tournament": ("settings_confirmed",)}


def _drop_retired_columns(bind: Engine) -> None:
    """Remove the columns in RETIRED_COLUMNS from databases that still have them.

    Safe to run on every start: a column already gone is skipped. The old
    "confirm settings" step that used `settings_confirmed` is long gone, so
    nothing reads it. Needs SQLite 3.35 or newer for DROP COLUMN; on an older
    one the column is left in place, which is harmless (it has a default).
    Take a backup first on a database that matters (scripts/backup-db).
    """
    if bind.dialect.name == "sqlite" and sqlite3.sqlite_version_info < (3, 35):
        return
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    with bind.begin() as connection:
        for table, columns in RETIRED_COLUMNS.items():
            if table not in tables:
                continue
            present = {column["name"] for column in inspector.get_columns(table)}
            for column in columns:
                if column in present:
                    connection.exec_driver_sql(f'ALTER TABLE "{table}" DROP COLUMN "{column}"')


def init_db(bind: Engine = engine) -> None:
    SQLModel.metadata.create_all(bind)
    _add_missing_columns(bind)
    _drop_retired_columns(bind)


TIERLESS_BRACKET_MATCHES = "SELECT id FROM match WHERE bracket != 'pool' AND playoff_bracket_id IS NULL"


def drop_tierless_bracket_matches(bind: Engine = engine) -> None:
    """Delete bracket matches from before every bracket belonged to a playoff tier.

    The old "Generate bracket" added a new set of tierless matches on every
    click, so these can be duplicated and aren't reachable from the UI; the
    tournament can generate a fresh bracket instead.
    """
    with bind.begin() as connection:
        connection.exec_driver_sql(
            f"DELETE FROM correctionlog WHERE match_id IN ({TIERLESS_BRACKET_MATCHES})"
        )
        connection.exec_driver_sql(f"DELETE FROM match WHERE id IN ({TIERLESS_BRACKET_MATCHES})")


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

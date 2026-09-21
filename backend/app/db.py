from typing import Iterator

from sqlalchemy import event, inspect
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = "sqlite:///./tournament_tracker.db"


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
    handles the additive case (a new nullable column); a renamed/dropped
    column or a new NOT NULL column still needs a real migration.
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
                connection.exec_driver_sql(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}'
                )


def init_db(bind: Engine = engine) -> None:
    SQLModel.metadata.create_all(bind)
    _add_missing_columns(bind)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

from typing import Iterator

from sqlalchemy import event
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


def init_db(bind: Engine = engine) -> None:
    SQLModel.metadata.create_all(bind)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session

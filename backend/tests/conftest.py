import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import create_app
from tests.helpers import sign_in


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _client(session):
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return TestClient(app)


@pytest.fixture(name="anonymous_client")
def anonymous_client_fixture(session):
    """A spectator: no session cookie, so it can read but not change anything."""
    yield _client(session)


@pytest.fixture(name="client")
def client_fixture(session):
    """Signed in as an organizer, since every write needs a session."""
    client = _client(session)
    sign_in(client, session)
    yield client

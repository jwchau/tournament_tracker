from functools import cache

from sqlmodel import select

from app.auth import COOKIE_NAME, hash_password, start_session
from app.models import User

# Obviously fake; only ever used against in-memory test databases.
TEST_PASSWORD = "not-a-real-password"


@cache
def _test_password_hash():
    # Hashing is deliberately slow, so every test's user shares one hash.
    return hash_password(TEST_PASSWORD)


def create_user(session, username="organizer"):
    user = User(username=username, password_hash=_test_password_hash())
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def sign_in(client, session, username="organizer"):
    """Give the client a session cookie for `username`, creating the user if needed."""
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        user = create_user(session, username)
    client.cookies.set(COOKIE_NAME, start_session(session, user))
    return user


def create_tournament(client, name="Test Cup"):
    """A new tournament with its settings confirmed, ready for teams, pools, and brackets."""
    tournament = client.post("/tournaments", json={"name": name}).json()
    return client.post(f"/tournaments/{tournament['id']}/confirm-settings").json()

from datetime import timedelta

import pytest
from sqlmodel import select

import app.auth as auth
from app.models import User
from tests.helpers import TEST_PASSWORD, create_user, sign_in


def _login(client, username="organizer", password=TEST_PASSWORD):
    return client.post("/auth/login", json={"username": username, "password": password})


@pytest.fixture
def clock(monkeypatch):
    """Lets a test move time forward, for expiring sessions and lockouts."""

    class Clock:
        current = auth.now()

        def advance(self, delta):
            self.current += delta

    fake = Clock()
    monkeypatch.setattr(auth, "now", lambda: fake.current)
    return fake


def test_a_stored_password_is_hashed_never_plain_text(session):
    user = create_user(session)

    assert user.password_hash != TEST_PASSWORD
    assert TEST_PASSWORD not in user.password_hash
    assert user.password_hash.startswith("$argon2id$")


def test_login_with_correct_details_returns_the_user_and_signs_in(anonymous_client, session):
    create_user(session, "organizer")

    response = _login(anonymous_client)

    assert response.status_code == 200
    assert response.json()["username"] == "organizer"
    assert "password_hash" not in response.json()
    assert anonymous_client.get("/auth/me").json()["username"] == "organizer"


def test_usernames_are_case_insensitive(anonymous_client, session):
    create_user(session, "Organizer")

    assert _login(anonymous_client, username="ORGANIZER").status_code == 200


def test_unknown_user_and_wrong_password_fail_the_same_way(anonymous_client, session):
    create_user(session, "organizer")

    unknown = _login(anonymous_client, username="nobody")
    wrong = _login(anonymous_client, password="wrong-password")

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json() == {"detail": "invalid username or password"}


def test_the_session_cookie_is_http_only_and_same_site_lax(anonymous_client, session):
    create_user(session)

    cookie = _login(anonymous_client).headers["set-cookie"].lower()

    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "secure" not in cookie


def test_the_session_cookie_is_secure_when_configured(anonymous_client, session, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "true")
    create_user(session)

    assert "secure" in _login(anonymous_client).headers["set-cookie"].lower()


def test_me_is_401_when_signed_out(anonymous_client):
    assert anonymous_client.get("/auth/me").status_code == 401


def test_logout_invalidates_the_session(client):
    token = client.cookies.get(auth.COOKIE_NAME)

    assert client.post("/auth/logout").status_code == 204

    client.cookies.set(auth.COOKIE_NAME, token)
    assert client.get("/auth/me").status_code == 401
    assert client.post("/tournaments", json={"name": "Cup"}).status_code == 401


def test_an_expired_session_is_refused(client, clock):
    clock.advance(timedelta(days=14, seconds=1))

    assert client.get("/auth/me").status_code == 401
    assert client.post("/tournaments", json={"name": "Cup"}).status_code == 401


def test_a_session_still_works_just_before_it_expires(client, clock):
    clock.advance(timedelta(days=13, hours=23))

    assert client.get("/auth/me").status_code == 200


def test_a_made_up_session_cookie_is_refused(anonymous_client):
    anonymous_client.cookies.set(auth.COOKIE_NAME, "made-up-token")

    assert anonymous_client.post("/tournaments", json={"name": "Cup"}).status_code == 401


def test_five_failed_logins_lock_the_username_out(anonymous_client, session, clock):
    create_user(session)
    for _ in range(5):
        assert _login(anonymous_client, password="wrong-password").status_code == 401

    # Even the right password is refused while locked out.
    locked = _login(anonymous_client)

    assert locked.status_code == 429


def test_four_failed_logins_do_not_lock_the_username_out(anonymous_client, session, clock):
    create_user(session)
    for _ in range(4):
        _login(anonymous_client, password="wrong-password")

    assert _login(anonymous_client).status_code == 200


def test_the_lockout_ends_after_the_window(anonymous_client, session, clock):
    create_user(session)
    for _ in range(5):
        _login(anonymous_client, password="wrong-password")

    clock.advance(timedelta(minutes=15, seconds=1))

    assert _login(anonymous_client).status_code == 200


def test_the_lockout_counts_usernames_case_insensitively(anonymous_client, session, clock):
    create_user(session, "organizer")
    for name in ["organizer", "ORGANIZER", "Organizer", "organizer", "oRgAnIzEr"]:
        _login(anonymous_client, username=name, password="wrong-password")

    assert _login(anonymous_client).status_code == 429


def test_the_lockout_only_affects_that_username(anonymous_client, session, clock):
    create_user(session, "organizer")
    create_user(session, "scorekeeper")
    for _ in range(5):
        _login(anonymous_client, password="wrong-password")

    assert _login(anonymous_client, username="scorekeeper").status_code == 200


def test_changing_the_password_signs_out_other_sessions(client, anonymous_client, session):
    other_device = anonymous_client
    sign_in(other_device, session)

    response = client.post(
        "/auth/password",
        json={"current_password": TEST_PASSWORD, "new_password": "another-fake-password"},
    )

    assert response.status_code == 204
    assert client.get("/auth/me").status_code == 200
    assert other_device.get("/auth/me").status_code == 401
    assert _login(anonymous_client, password=TEST_PASSWORD).status_code == 401
    assert _login(anonymous_client, password="another-fake-password").status_code == 200


def test_changing_the_password_needs_the_current_one(client):
    response = client.post(
        "/auth/password",
        json={"current_password": "wrong-password", "new_password": "another-fake-password"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "current password is incorrect"


def test_a_new_password_needs_at_least_8_characters(client, session):
    response = client.post(
        "/auth/password", json={"current_password": TEST_PASSWORD, "new_password": "short"}
    )

    assert response.status_code == 422
    user = session.exec(select(User)).one()
    assert auth.verify_password(user.password_hash, TEST_PASSWORD)

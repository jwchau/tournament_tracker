import sqlite3

from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.db import init_db
from app.models import User
from tests.helpers import TEST_PASSWORD, create_tournament, create_user, sign_in


def test_login_and_me_say_which_role_the_user_has(anonymous_client, session):
    create_user(session, "keeper", role="scorekeeper")

    login = anonymous_client.post(
        "/auth/login", json={"username": "keeper", "password": TEST_PASSWORD}
    )

    assert login.json()["role"] == "scorekeeper"
    assert anonymous_client.get("/auth/me").json()["role"] == "scorekeeper"


def test_only_an_admin_can_list_the_users(anonymous_client, session):
    create_user(session, "keeper", role="scorekeeper")

    spectator = anonymous_client.get("/users")
    sign_in(anonymous_client, session, "keeper", role="scorekeeper")
    scorekeeper = anonymous_client.get("/users")
    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "boss", role="organizer")
    organizer = anonymous_client.get("/users")
    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "root", role="admin")
    admin = anonymous_client.get("/users")

    assert [r.status_code for r in (spectator, scorekeeper, organizer, admin)] == [401, 403, 403, 200]
    assert {(u["username"], u["role"]) for u in admin.json()} == {
        ("keeper", "scorekeeper"),
        ("boss", "organizer"),
        ("root", "admin"),
    }
    assert all("password_hash" not in user for user in admin.json())


def test_an_admin_can_create_a_user_who_can_then_sign_in_with_that_role(anonymous_client, session):
    sign_in(anonymous_client, session, "root", role="admin")

    created = anonymous_client.post(
        "/users", json={"username": "newkeeper", "password": "a-long-enough-one", "role": "organizer"}
    )
    anonymous_client.cookies.clear()
    login = anonymous_client.post(
        "/auth/login", json={"username": "newkeeper", "password": "a-long-enough-one"}
    )

    assert created.status_code == 201
    assert created.json()["role"] == "organizer"
    assert "password" not in created.json() and "password_hash" not in created.json()
    assert login.json()["role"] == "organizer"


def test_creating_a_user_refuses_a_taken_username_a_short_password_and_an_unknown_role(
    anonymous_client, session
):
    sign_in(anonymous_client, session, "root", role="admin")
    good = {"username": "newkeeper", "password": "a-long-enough-one", "role": "scorekeeper"}

    taken = anonymous_client.post("/users", json={**good, "username": "ROOT"})
    short = anonymous_client.post("/users", json={**good, "password": "short"})
    unknown = anonymous_client.post("/users", json={**good, "role": "superuser"})

    assert taken.status_code == 409
    assert short.status_code == 422
    assert unknown.status_code == 422
    assert session.exec(select(User).where(User.username == "newkeeper")).first() is None


def test_changing_another_users_role_signs_them_out_everywhere(anonymous_client, session):
    keeper = sign_in(anonymous_client, session, "keeper", role="scorekeeper")
    keepers_cookie = anonymous_client.cookies.get("session")
    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "root", role="admin")

    changed = anonymous_client.patch(f"/users/{keeper.id}/role", json={"role": "organizer"})
    anonymous_client.cookies.clear()
    anonymous_client.cookies.set("session", keepers_cookie)

    assert changed.status_code == 200
    assert changed.json()["role"] == "organizer"
    assert anonymous_client.get("/auth/me").status_code == 401
    anonymous_client.cookies.clear()
    login = anonymous_client.post(
        "/auth/login", json={"username": "keeper", "password": TEST_PASSWORD}
    )
    assert login.json()["role"] == "organizer"


def test_an_admin_cannot_change_their_own_role_and_an_unknown_user_is_a_404(
    anonymous_client, session
):
    root = sign_in(anonymous_client, session, "root", role="admin")

    own = anonymous_client.patch(f"/users/{root.id}/role", json={"role": "scorekeeper"})
    missing = anonymous_client.patch("/users/999/role", json={"role": "scorekeeper"})

    assert own.status_code == 400
    assert missing.status_code == 404
    assert anonymous_client.get("/auth/me").json()["role"] == "admin"


def test_users_from_before_roles_became_admins(tmp_path):
    db_path = tmp_path / "before-roles.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        "CREATE TABLE user (id INTEGER PRIMARY KEY, username VARCHAR NOT NULL UNIQUE,"
        " password_hash VARCHAR NOT NULL, created_at DATETIME NOT NULL)"
    )
    connection.execute(
        "INSERT INTO user (username, password_hash, created_at) VALUES ('old', 'x', '2026-01-01')"
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path}")
    init_db(engine)

    with Session(engine) as session:
        assert session.exec(select(User)).one().role == "admin"


def test_a_scorekeeper_cannot_do_setup_but_an_organizer_can(anonymous_client, session):
    sign_in(anonymous_client, session, "admin")
    tournament = create_tournament(anonymous_client)
    team = {"name": "Spikers"}

    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "keeper", role="scorekeeper")
    refused = anonymous_client.post(f"/tournaments/{tournament['id']}/teams", json=team)

    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "boss", role="organizer")
    allowed = anonymous_client.post(f"/tournaments/{tournament['id']}/teams", json=team)

    assert refused.status_code == 403
    assert allowed.status_code == 201


def test_an_organizer_can_correct_a_match_but_only_an_admin_can_delete_a_tournament(
    anonymous_client, session
):
    sign_in(anonymous_client, session, "boss", role="organizer")
    tournament = create_tournament(anonymous_client)

    # No such match, so a 404 means the role let the correction through to the handler.
    correction = anonymous_client.patch("/matches/999/correct", json={})
    refused = anonymous_client.delete(f"/tournaments/{tournament['id']}")

    anonymous_client.cookies.clear()
    sign_in(anonymous_client, session, "root", role="admin")
    allowed = anonymous_client.delete(f"/tournaments/{tournament['id']}")

    assert correction.status_code not in (401, 403)
    assert refused.status_code == 403
    assert allowed.status_code == 204

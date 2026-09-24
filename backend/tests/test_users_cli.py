import getpass

import pytest
from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.auth import session_user, start_session, verify_password
from app.models import User
from app.users import main


@pytest.fixture
def engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path / 'users.db'}")


@pytest.fixture
def typed(monkeypatch):
    """Answers the CLI's password prompts, in order."""
    answers = []
    monkeypatch.setattr(getpass, "getpass", lambda prompt="": answers.pop(0))
    return answers


def _user(engine, username):
    with Session(engine) as session:
        return session.exec(select(User).where(User.username == username)).first()


def test_create_adds_a_user_with_a_hashed_password(engine, typed, capsys):
    typed.extend(["cli-fake-password", "cli-fake-password"])

    assert main(["create", "organizer"], bind=engine) == 0

    user = _user(engine, "organizer")
    assert verify_password(user.password_hash, "cli-fake-password")
    assert "cli-fake-password" not in capsys.readouterr().out


def test_create_refuses_passwords_that_do_not_match(engine, typed, capsys):
    typed.extend(["cli-fake-password", "something-else"])

    assert main(["create", "organizer"], bind=engine) == 1

    assert _user(engine, "organizer") is None
    assert "don't match" in capsys.readouterr().err


def test_create_refuses_a_short_password(engine, typed, capsys):
    typed.extend(["short", "short"])

    assert main(["create", "organizer"], bind=engine) == 1

    assert _user(engine, "organizer") is None
    assert "at least 8" in capsys.readouterr().err


def test_create_refuses_a_taken_username_whatever_its_case(engine, typed, capsys):
    typed.extend(["cli-fake-password"] * 4)
    main(["create", "organizer"], bind=engine)

    assert main(["create", "Organizer"], bind=engine) == 1

    assert "already exists" in capsys.readouterr().err


def test_reset_password_changes_the_password(engine, typed):
    typed.extend(["cli-fake-password", "cli-fake-password", "new-fake-password", "new-fake-password"])
    main(["create", "organizer"], bind=engine)

    assert main(["reset-password", "organizer"], bind=engine) == 0

    user = _user(engine, "organizer")
    assert verify_password(user.password_hash, "new-fake-password")
    assert not verify_password(user.password_hash, "cli-fake-password")


def test_reset_password_signs_the_user_out_everywhere(engine, typed):
    typed.extend(["cli-fake-password", "cli-fake-password", "new-fake-password", "new-fake-password"])
    main(["create", "organizer"], bind=engine)
    with Session(engine) as session:
        token = start_session(session, _user(engine, "organizer"))

    main(["reset-password", "organizer"], bind=engine)

    with Session(engine) as session:
        assert session_user(session, token) is None


def test_reset_password_for_an_unknown_user_fails(engine, typed, capsys):
    assert main(["reset-password", "nobody"], bind=engine) == 1

    assert "no user" in capsys.readouterr().err

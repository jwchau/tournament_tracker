"""Create users and reset passwords; there's no sign-up in the app itself.

    uv run python -m app.users create <username>
    uv run python -m app.users reset-password <username>

Both prompt for the password (twice) instead of taking it as an argument, so
it never ends up in shell history.
"""

import argparse
import getpass
import sys

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.auth import check_password_length, end_sessions, hash_password
from app.db import engine, init_db
from app.models import User


def _prompt_password() -> str:
    password = getpass.getpass("Password: ")
    if getpass.getpass("Password again: ") != password:
        raise ValueError("passwords don't match")
    check_password_length(password)
    return password


def _create(session: Session, username: str) -> str:
    if session.exec(select(User).where(User.username == username)).first():
        raise ValueError(f"user {username!r} already exists")
    session.add(User(username=username, password_hash=hash_password(_prompt_password())))
    session.commit()
    return f"Created user {username!r}."


def _reset_password(session: Session, username: str) -> str:
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise ValueError(f"no user {username!r}")
    user.password_hash = hash_password(_prompt_password())
    session.add(user)
    session.commit()
    # Whoever had the old password shouldn't stay signed in.
    end_sessions(session, user)
    return f"Reset the password for {username!r}."


COMMANDS = {"create": _create, "reset-password": _reset_password}


def main(argv: list[str] | None = None, bind: Engine = engine) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.users", description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("username")
    args = parser.parse_args(argv)

    init_db(bind)
    with Session(bind) as session:
        try:
            print(COMMANDS[args.command](session, args.username))
        except ValueError as error:
            print(f"Error: {error}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

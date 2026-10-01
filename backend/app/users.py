"""Create users, reset passwords and set roles; there's no sign-up in the app itself.

    uv run python -m app.users create <username> [--role scorekeeper|organizer|admin]
    uv run python -m app.users reset-password <username>
    uv run python -m app.users set-role <username> <role>

The first two prompt for the password (twice) instead of taking it as an
argument, so it never ends up in shell history. A new user is a scorekeeper
unless told otherwise; changing a role signs that user out everywhere.
"""

import argparse
import getpass
import sys

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.auth import ROLE_RANK, check_password_length, end_sessions, hash_password
from app.db import engine, init_db
from app.models import User


def _prompt_password() -> str:
    password = getpass.getpass("Password: ")
    if getpass.getpass("Password again: ") != password:
        raise ValueError("passwords don't match")
    check_password_length(password)
    return password


def _create(session: Session, args: argparse.Namespace) -> str:
    username = args.username
    if session.exec(select(User).where(User.username == username)).first():
        raise ValueError(f"user {username!r} already exists")
    session.add(
        User(username=username, password_hash=hash_password(_prompt_password()), role=args.role)
    )
    session.commit()
    return f"Created user {username!r} as {args.role}."


def _reset_password(session: Session, args: argparse.Namespace) -> str:
    username = args.username
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise ValueError(f"no user {username!r}")
    user.password_hash = hash_password(_prompt_password())
    session.add(user)
    session.commit()
    # Whoever had the old password shouldn't stay signed in.
    end_sessions(session, user)
    return f"Reset the password for {username!r}."


def _set_role(session: Session, args: argparse.Namespace) -> str:
    if args.new_role is None:
        raise ValueError("set-role needs a role: " + ", ".join(ROLE_RANK))
    user = session.exec(select(User).where(User.username == args.username)).first()
    if user is None:
        raise ValueError(f"no user {args.username!r}")
    user.role = args.new_role
    session.add(user)
    session.commit()
    # Whatever they could do on their old role, they shouldn't stay signed in to it.
    end_sessions(session, user)
    return f"{args.username!r} is now {args.new_role}."


COMMANDS = {"create": _create, "reset-password": _reset_password, "set-role": _set_role}


def main(argv: list[str] | None = None, bind: Engine = engine) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.users", description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("username")
    parser.add_argument("new_role", nargs="?", choices=list(ROLE_RANK), help="for set-role")
    parser.add_argument("--role", choices=list(ROLE_RANK), default="scorekeeper", help="for create")
    args = parser.parse_args(argv)

    init_db(bind)
    with Session(bind) as session:
        try:
            print(COMMANDS[args.command](session, args))
        except ValueError as error:
            print(f"Error: {error}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Sign-in: password hashing, session cookies, and the one rule for writes.

Spectators can read everything. Every POST/PATCH/DELETE needs a signed-in
session, enforced by `require_session_for_writes`, which runs on every route;
signing in is the only write that doesn't need one.
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Field, Session, SQLModel, delete, func, select

from app.db import get_session
from app.models import LoginAttempt, User, UserPublic, UserSession

COOKIE_NAME = "session"
SESSION_LIFETIME = timedelta(days=14)
MIN_PASSWORD_LENGTH = 8
LOCKOUT_ATTEMPTS = 5
LOCKOUT_WINDOW = timedelta(minutes=15)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
PUBLIC_WRITE_PATHS = {"/auth/login"}

# argon2id with the library's recommended cost parameters.
_hasher = PasswordHasher()


def now() -> datetime:
    """Naive UTC, which is how SQLite hands datetimes back."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def cookie_secure() -> bool:
    # Browsers drop Secure cookies over plain http, so local dev leaves it off.
    return os.environ.get("COOKIE_SECURE", "").lower() == "true"


def check_password_length(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


@cache
def _decoy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User) -> str:
    """Store a new session for `user` and return the token for its cookie."""
    token = secrets.token_urlsafe(32)
    started = now()
    db.add(
        UserSession(
            token_hash=_digest(token),
            user_id=user.id,
            created_at=started,
            expires_at=started + SESSION_LIFETIME,
        )
    )
    db.commit()
    return token


def session_user(db: Session, token: str | None) -> User | None:
    """The user a session token belongs to, or None if it's unknown or expired."""
    if not token:
        return None
    stored = db.exec(select(UserSession).where(UserSession.token_hash == _digest(token))).first()
    if stored is None:
        return None
    if stored.expires_at <= now():
        db.delete(stored)
        db.commit()
        return None
    return db.get(User, stored.user_id)


def end_sessions(db: Session, user: User, keep_token: str | None = None) -> None:
    """Sign `user` out everywhere, except the session `keep_token` if given."""
    statement = delete(UserSession).where(UserSession.user_id == user.id)
    if keep_token is not None:
        statement = statement.where(UserSession.token_hash != _digest(keep_token))
    db.exec(statement)
    db.commit()


def current_user(request: Request, db: Session = Depends(get_session)) -> User:
    user = session_user(db, request.cookies.get(COOKIE_NAME))
    if user is None:
        raise HTTPException(status_code=401, detail="sign in to make changes")
    return user


def require_session_for_writes(request: Request, db: Session = Depends(get_session)) -> None:
    if request.method in SAFE_METHODS or request.url.path in PUBLIC_WRITE_PATHS:
        return
    current_user(request, db)


router = APIRouter(prefix="/auth")


class Credentials(SQLModel):
    username: str
    password: str


class PasswordChange(SQLModel):
    current_password: str
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH)


def _recent_failures(db: Session, username: str) -> int:
    return db.exec(
        select(func.count(LoginAttempt.id)).where(
            LoginAttempt.username == username, LoginAttempt.created_at > now() - LOCKOUT_WINDOW
        )
    ).one()


def _record_failure(db: Session, username: str) -> None:
    db.exec(delete(LoginAttempt).where(LoginAttempt.created_at <= now() - LOCKOUT_WINDOW))
    db.add(LoginAttempt(username=username, created_at=now()))
    db.commit()


@router.post("/login", response_model=UserPublic)
def login(credentials: Credentials, response: Response, db: Session = Depends(get_session)):
    if _recent_failures(db, credentials.username) >= LOCKOUT_ATTEMPTS:
        raise HTTPException(
            status_code=429, detail="too many failed sign-ins; try again in 15 minutes"
        )
    user = db.exec(select(User).where(User.username == credentials.username)).first()
    # An unknown username still pays for a hash, so timing doesn't reveal which usernames exist.
    password_hash = user.password_hash if user else _decoy_hash()
    if not verify_password(password_hash, credentials.password) or user is None:
        _record_failure(db, credentials.username)
        raise HTTPException(status_code=401, detail="invalid username or password")

    response.set_cookie(
        COOKIE_NAME,
        start_session(db, user),
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
    )
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_session)):
    token = request.cookies.get(COOKIE_NAME)
    db.exec(delete(UserSession).where(UserSession.token_hash == _digest(token or "")))
    db.commit()
    response.delete_cookie(COOKIE_NAME, httponly=True, samesite="lax", secure=cookie_secure())


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(current_user)):
    return user


@router.post("/password", status_code=204)
def change_password(
    change: PasswordChange,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_session),
):
    if not verify_password(user.password_hash, change.current_password):
        raise HTTPException(status_code=400, detail="current password is incorrect")
    user.password_hash = hash_password(change.new_password)
    db.add(user)
    db.commit()
    end_sessions(db, user, keep_token=request.cookies.get(COOKIE_NAME))

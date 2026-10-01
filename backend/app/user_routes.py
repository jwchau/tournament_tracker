"""Managing users from the app: an admin's page. Everything here needs the admin role."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Field, Session, SQLModel, select

from app.auth import MIN_PASSWORD_LENGTH, current_user, end_sessions, hash_password, require_role
from app.db import get_session
from app.models import User, UserPublic

# One dependency on every route here, writes included: users are managed by admins only.
router = APIRouter(prefix="/users", dependencies=[Depends(require_role("admin"))])


class UserCreate(SQLModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)
    role: Literal["scorekeeper", "organizer", "admin"]


class RoleChange(SQLModel):
    role: Literal["scorekeeper", "organizer", "admin"]


@router.get("", response_model=list[UserPublic])
def list_users(session: Session = Depends(get_session)):
    return session.exec(select(User).order_by(User.id)).all()


@router.post("", response_model=UserPublic, status_code=201)
def create_user(data: UserCreate, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(status_code=409, detail=f"there is already a user {data.username!r}")
    user = User(username=data.username, password_hash=hash_password(data.password), role=data.role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.patch("/{user_id}/role", response_model=UserPublic)
def change_role(
    user_id: int,
    data: RoleChange,
    session: Session = Depends(get_session),
    admin: User = Depends(current_user),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="you can't change your own role")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    user.role = data.role
    session.add(user)
    session.commit()
    # Whatever they could do on their old role, they shouldn't stay signed in to it.
    end_sessions(session, user)
    session.refresh(user)
    return user

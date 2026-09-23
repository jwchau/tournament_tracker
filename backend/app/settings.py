from fastapi import HTTPException

from app.models import Tournament


def require_confirmed_settings(tournament: Tournament) -> None:
    """Teams, pools, and brackets only get built on settings the organizer confirmed."""
    if not tournament.settings_confirmed:
        raise HTTPException(status_code=400, detail="confirm the tournament settings first")

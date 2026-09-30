"""Reading the hottest endpoints straight into JSON, without building a model per row.

A read answered through the ORM pays for each row three times: an ORM object (identity
tracking and instrumented attributes), a model built from it, and the response model
validating that model again before it is serialized. For the pages every phone polls,
that is most of the time a cold read takes. These helpers select plain rows and hand the
dicts to the response as JSON.

The endpoints keep their `response_model`, so the API's documentation is unchanged, and a
returned `Response` skips FastAPI's validation. Tests check each converted endpoint's
output against its model, so the two cannot drift apart.
"""

import json
from datetime import date, datetime

from fastapi import Response
from sqlmodel import Session, select

from app.models import Match

MATCH = Match.__table__


def _default(value):
    # Dates and times serialize as ISO 8601, as the models do.
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def json_response(data) -> Response:
    return Response(
        json.dumps(data, default=_default, separators=(",", ":")).encode(),
        media_type="application/json",
    )


def match_rows(session: Session, *conditions, order_by=()):
    """Match rows (every column, by name) with no ORM objects made."""
    statement = select(MATCH).where(*conditions)
    if order_by:
        statement = statement.order_by(*order_by)
    return session.execute(statement).all()


def match_dicts(session: Session, *conditions, order_by=()) -> list[dict]:
    """The same rows as dicts, in the shape the Match response model has."""
    return [row._asdict() for row in match_rows(session, *conditions, order_by=order_by)]

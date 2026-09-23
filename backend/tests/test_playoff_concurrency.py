import random
import threading

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, func, select

import app.playoff_routes as playoff_routes
from app.db import configure_sqlite_engine, get_session
from app.main import create_app
from app.models import PlayoffBracket
from tests.test_playoff_stress import Settings, _advance, _build, _play_pools


def test_simultaneous_advance_requests_create_one_set_of_brackets(tmp_path, monkeypatch):
    """Two requests that both pass the "already advanced?" check before either writes.

    Needs a real database file so each request gets its own connection; both
    requests are held after planning until the other one gets there too (or
    it's clear the other can't, because it's waiting on the first one's lock).
    """
    engine = configure_sqlite_engine(
        create_engine(f"sqlite:///{tmp_path / 'race.db'}", connect_args={"check_same_thread": False})
    )
    SQLModel.metadata.create_all(engine)

    def session_per_request():
        with Session(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_per_request
    setup_client = TestClient(app)
    tournament_id, pools = _build(setup_client, Settings((4, 4), 2, 2, 2))
    _play_pools(setup_client, pools, random.Random("race"))

    both_planned = threading.Barrier(2)
    plan = playoff_routes.playoff_tiers

    def plan_then_wait(*args):
        tiers = plan(*args)
        try:
            both_planned.wait(timeout=2)
        except threading.BrokenBarrierError:
            pass
        return tiers

    monkeypatch.setattr(playoff_routes, "playoff_tiers", plan_then_wait)

    statuses = []

    def advance():
        statuses.append(_advance(TestClient(app), tournament_id, "single").status_code)

    threads = [threading.Thread(target=advance) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    with Session(engine) as session:
        bracket_count = session.exec(
            select(func.count(PlayoffBracket.id)).where(PlayoffBracket.tournament_id == tournament_id)
        ).one()
    assert sorted(statuses) == [201, 400]
    assert bracket_count == 2

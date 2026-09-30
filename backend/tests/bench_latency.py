"""Latency of single requests over real HTTP, with no profiler and no test client in the way.

Serves the app on a local port over a file database, plays a 24-team tournament
into its playoffs, and times one request at a time:

- a do-nothing endpoint, the framework's own floor;
- a cached read (no routing, no database);
- the hot reads when they are not cached (a cache-busting query string makes each one cold);
- saving a running score on a playoff match, the most frequent write (every point);
- finishing a playoff match, the heaviest.

Reported as the median and the 95th percentile in milliseconds. Run it from the backend
directory:

    uv run python -m tests.bench_latency

BENCH_SYNCHRONOUS=NORMAL (or OFF) runs the database with less fsyncing, to show what a commit
costs (about half of a running-score save, on the machine this was measured on).

Not a test: it asserts nothing and is not collected by pytest.
"""

import os
import statistics
import tempfile
import time
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.db import configure_sqlite_engine, get_session
from app.main import create_app
from tests.bench_api import build, play_pools
from tests.bench_load import Server
from tests.helpers import sign_in


def summarize(label, times):
    times = sorted(times)
    p95 = times[min(len(times) - 1, int(len(times) * 0.95))]
    print(f"  {label:<62} p50 {statistics.median(times):6.2f} ms   p95 {p95:6.2f} ms   (n={len(times)})")


def measure(label, call, repeat=150):
    for n in range(-10, 0):
        call(n)
    times = []
    for n in range(repeat):
        started = time.perf_counter()
        call(n)
        times.append((time.perf_counter() - started) * 1000)
    summarize(label, times)


def main():
    engine = create_engine(f"sqlite:///{Path(tempfile.mkdtemp()) / 'latency.db'}", connect_args={"check_same_thread": False})
    configure_sqlite_engine(engine)
    # BENCH_SYNCHRONOUS=NORMAL|OFF tries the database with less fsyncing, to see what commits cost.
    if os.environ.get("BENCH_SYNCHRONOUS"):

        @event.listens_for(engine, "connect")
        def _relax(dbapi_connection, record):
            dbapi_connection.execute(f"PRAGMA synchronous={os.environ['BENCH_SYNCHRONOUS']}")

    SQLModel.metadata.create_all(engine)

    def per_request_session():
        with Session(engine) as session:
            yield session

    # bench_api turns the statement counter on when imported; production has it off.
    os.environ["DB_TRACE"] = "0"
    app = create_app()
    app.dependency_overrides[get_session] = per_request_session

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    tc = TestClient(app)
    with Session(engine) as session:
        sign_in(tc, session)
    ids = build(tc)
    play_pools(tc, ids, 1.0)
    tid = ids["tournament"]
    tc.post(f"/tournaments/{tid}/advance-to-playoffs", json={"format": "single"})
    cookie = tc.cookies.get("session")
    pool = ids["pools"][0]

    with Server(app, port=8198) as server, httpx.Client(base_url=server.url, cookies={"session": cookie}) as c:
        print("Real HTTP to uvicorn, one request at a time:")
        measure("GET /ping (a do-nothing endpoint: the floor)", lambda n: c.get("/ping"))
        measure("GET /tournaments/{id}, cached", lambda n: c.get(f"/tournaments/{tid}"))
        for label, path in (
            ("GET /tournaments/{id}", f"/tournaments/{tid}"),
            ("GET /tournaments/{id}/courts", f"/tournaments/{tid}/courts"),
            ("GET /tournaments/{id}/playoff-brackets", f"/tournaments/{tid}/playoff-brackets"),
            ("GET /playoff-brackets/1/matches", "/playoff-brackets/1/matches"),
            ("GET /playoff-brackets/1/dispatch", "/playoff-brackets/1/dispatch"),
            ("GET /pools/{id}/matches", f"/pools/{pool}/matches"),
            ("GET /pools/{id}/standings", f"/pools/{pool}/standings"),
        ):
            measure(f"{label}, cold", lambda n, path=path: c.get(f"{path}?x={n}"))

        brackets = c.get(f"/tournaments/{tid}/playoff-brackets?fresh=1").json()
        matches = [m for b in brackets for m in c.get(f"/playoff-brackets/{b['id']}/matches?fresh=1").json()]
        live = next(m for m in matches if m["status"] in ("ready", "in_progress") and m["team1_id"] and m["team2_id"])
        state = {"version": live["version"]}

        def running_score(n):
            r = c.patch(
                f"/matches/{live['id']}/score",
                json={"team1_score": (n % 20) + 1, "team2_score": 0, "version": state["version"], "complete": False},
            )
            state["version"] = r.json()["version"]

        measure("PATCH a running score on a playoff match (every point)", running_score, repeat=100)

        # Finish every other playoff match, one by one; each can only be finished once.
        times = []
        for match in [m for m in matches if m["id"] != live["id"]]:
            fresh = c.get(f"/matches/{match['id']}?fresh=1").json()
            if fresh["status"] == "complete" or not (fresh["team1_id"] and fresh["team2_id"]):
                continue
            started = time.perf_counter()
            r = c.patch(
                f"/matches/{match['id']}/score",
                json={"team1_score": 21, "team2_score": 15, "version": fresh["version"], "complete": True},
            )
            times.append((time.perf_counter() - started) * 1000)
            assert r.status_code == 200, r.text
        summarize("PATCH finishing a playoff match", times)


if __name__ == "__main__":
    main()

"""How chatty the API is over a realistic day: database statements and time per request.

Plays a 24-team, 4-pool, 2-bracket tournament through the API against an
in-memory database, counting the statements every request runs (see dbtrace),
and reads every page's endpoints at each stage of the day. Run it from the
backend directory:

    uv run python -m tests.bench_api

It is not a test: it asserts nothing and is not collected by pytest.
"""

import os
import statistics
import time

os.environ["DB_TRACE"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402
from sqlmodel.pool import StaticPool  # noqa: E402

from app.db import get_session  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.helpers import sign_in  # noqa: E402

POOLS = 4
TEAMS_PER_POOL = 6

samples: dict[str, list[tuple[int, float]]] = {}


def call(client, label, method, path, **kwargs):
    started = time.perf_counter()
    response = client.request(method, path, **kwargs)
    wall = (time.perf_counter() - started) * 1000
    queries = int(response.headers.get("x-db-queries", 0))
    samples.setdefault(label, []).append((queries, wall))
    assert response.status_code < 400, (method, path, response.status_code, response.text[:200])
    return response


def score(client, match, team1=21, team2=15):
    return call(
        client,
        "PATCH /matches/{id}/score",
        "PATCH",
        f"/matches/{match['id']}/score",
        json={"team1_score": team1, "team2_score": team2, "version": match["version"], "complete": True},
    )


# --- pages: the calls each one makes when it loads or polls -------------------------


def tournaments_page(client, ids):
    call(client, "GET /tournaments", "GET", "/tournaments")


def tournament_page(client, ids):
    tid = ids["tournament"]
    call(client, "GET /tournaments/{id}", "GET", f"/tournaments/{tid}")
    call(client, "GET /tournaments/{id}/teams", "GET", f"/tournaments/{tid}/teams")
    for pool in call(client, "GET /tournaments/{id}/pools", "GET", f"/tournaments/{tid}/pools").json():
        call(client, "GET /pools/{id}/standings", "GET", f"/pools/{pool['id']}/standings")
    call(client, "GET /tournaments/{id}/playoff-readiness", "GET", f"/tournaments/{tid}/playoff-readiness")
    brackets = call(
        client, "GET /tournaments/{id}/playoff-brackets", "GET", f"/tournaments/{tid}/playoff-brackets"
    ).json()
    for bracket in brackets:
        call(client, "GET /playoff-brackets/{id}/matches", "GET", f"/playoff-brackets/{bracket['id']}/matches")
        call(client, "GET /playoff-brackets/{id}/dispatch", "GET", f"/playoff-brackets/{bracket['id']}/dispatch")


def pool_page(client, ids):
    pool = ids["pools"][0]
    call(client, "GET /pools/{id}", "GET", f"/pools/{pool}")
    call(client, "GET /pools/{id}/matches", "GET", f"/pools/{pool}/matches")
    call(client, "GET /pools/{id}/standings", "GET", f"/pools/{pool}/standings")


def bracket_page(client, ids):
    brackets = client.get(f"/tournaments/{ids['tournament']}/playoff-brackets").json()
    if not brackets:
        return
    bid = brackets[0]["id"]
    call(client, "GET /playoff-brackets/{id}", "GET", f"/playoff-brackets/{bid}")
    call(client, "GET /playoff-brackets/{id}/matches", "GET", f"/playoff-brackets/{bid}/matches")
    call(client, "GET /playoff-brackets/{id}/dispatch", "GET", f"/playoff-brackets/{bid}/dispatch")


def courts_page(client, ids):
    call(client, "GET /tournaments/{id}/courts", "GET", f"/tournaments/{ids['tournament']}/courts")


PAGES = [
    ("main page", tournaments_page),
    ("tournament page", tournament_page),
    ("pool page", pool_page),
    ("bracket page", bracket_page),
    ("court list / court page poll", courts_page),
]

page_totals: dict[str, list[tuple[int, float]]] = {}


def sweep(client, ids, stage):
    """Load every page twice: cold (after a write) and warm (the same read again)."""
    for name, page in PAGES:
        cells = []
        for temperature in ("cold", "warm"):
            before = {label: len(rows) for label, rows in samples.items()}
            started = time.perf_counter()
            page(client, ids)
            wall = (time.perf_counter() - started) * 1000
            queries = sum(
                sum(q for q, _ in rows[before.get(label, 0):]) for label, rows in samples.items()
            )
            page_totals.setdefault(f"{name} ({temperature})", []).append((queries, wall))
            cells.append(f"{queries:>4} stmts {wall:>6.1f} ms")
        print(f"  {stage:<22} {name:<30} cold {cells[0]}   warm {cells[1]}")


def build(client):
    tid = call(client, "POST /tournaments", "POST", "/tournaments", json={"name": "Bench Cup"}).json()["id"]
    call(
        client, "PATCH /tournaments/{id}", "PATCH", f"/tournaments/{tid}",
        json={"court_count": 4, "target_pool_size": TEAMS_PER_POOL, "playoff_bracket_count": 2, "playoff_best_of": 1},
    )
    for seed in range(1, POOLS * TEAMS_PER_POOL + 1):
        team = call(
            client, "POST /tournaments/{id}/teams", "POST", f"/tournaments/{tid}/teams",
            json={"name": f"Team {seed:02d}", "seed": seed},
        ).json()
        call(client, "POST /teams/{id}/players", "POST", f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    pools = [
        call(client, "POST /tournaments/{id}/pools", "POST", f"/tournaments/{tid}/pools", json={"name": f"Pool {n}"}).json()["id"]
        for n in "ABCD"[:POOLS]
    ]
    call(client, "POST /tournaments/{id}/pools/auto-assign", "POST", f"/tournaments/{tid}/pools/auto-assign")
    for pool in pools:
        call(client, "POST /pools/{id}/generate-schedule", "POST", f"/pools/{pool}/generate-schedule")
    return {"tournament": tid, "pools": pools}


def play_pools(client, ids, fraction):
    matches = []
    for pool in ids["pools"]:
        matches += client.get(f"/pools/{pool}/matches").json()
    todo = [m for m in matches if m["status"] != "complete"]
    for match in todo[: max(1, int(len(matches) * fraction))]:
        current = client.get(f"/matches/{match['id']}").json()
        score(client, current)


def play_playoffs(client, ids, limit=None):
    played = 0
    while limit is None or played < limit:
        progressed = False
        for bracket in client.get(f"/tournaments/{ids['tournament']}/playoff-brackets").json():
            for match in client.get(f"/playoff-brackets/{bracket['id']}/matches").json():
                if match["status"] == "ready" and match["team1_id"] and match["team2_id"]:
                    score(client, match)
                    played += 1
                    progressed = True
                    if limit is not None and played >= limit:
                        return
        if not progressed:
            return


def report():
    print("\nPer request type (statements, time):")
    print(f"  {'request':<48} {'calls':>5} {'stmts avg':>10} {'stmts max':>10} {'ms avg':>8} {'ms max':>8}")
    rows = sorted(samples.items(), key=lambda item: -statistics.mean(q for q, _ in item[1]))
    for label, values in rows:
        queries = [q for q, _ in values]
        times = [t for _, t in values]
        print(
            f"  {label:<48} {len(values):>5} {statistics.mean(queries):>10.1f} {max(queries):>10} "
            f"{statistics.mean(times):>8.1f} {max(times):>8.1f}"
        )
    print("\nPer page load, averaged over the day (statements, time):")
    for name, values in page_totals.items():
        print(f"  {name:<32} {statistics.mean(q for q, _ in values):>7.1f}  {statistics.mean(t for _, t in values):>8.1f} ms")


def main():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        client = TestClient(app)
        sign_in(client, session)

        ids = build(client)
        print(f"{POOLS * TEAMS_PER_POOL} teams, {POOLS} pools, 4 courts\n")
        sweep(client, ids, "schedules ready")
        play_pools(client, ids, 0.5)
        sweep(client, ids, "mid pool play")
        play_pools(client, ids, 1.0)
        sweep(client, ids, "pool play done")
        call(client, "POST /tournaments/{id}/playoff-seeding", "GET", f"/tournaments/{ids['tournament']}/playoff-seeding")
        call(client, "POST /tournaments/{id}/advance-to-playoffs", "POST", f"/tournaments/{ids['tournament']}/advance-to-playoffs", json={"format": "single"})
        sweep(client, ids, "playoffs start")
        play_playoffs(client, ids, limit=4)
        sweep(client, ids, "mid playoffs")
        play_playoffs(client, ids)
        sweep(client, ids, "tournament complete")
        call(client, "GET /tournaments/{id}/results", "GET", f"/tournaments/{ids['tournament']}/results")
        report()


if __name__ == "__main__":
    main()

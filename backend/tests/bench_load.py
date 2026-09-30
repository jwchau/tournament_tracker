"""How often reads are answered from the cache when many phones poll at once.

Two measurements, on a 24-team tournament in the middle of pool play:

1. Viewers over time. V viewers each poll a page every 10 seconds while scores are
   saved (W writes a second) and an organizer now and then asks for a settings
   preview, all in virtual time so a minute of it runs in seconds. Reported as the share of
   reads answered from the cache, with and without previews emptying it (how it
   behaved before they stopped).
2. A burst. After a write, V phones ask for the same pages at the same instant, over
   real HTTP. Reported as how many of those reads were worked out, and how many were
   handed the answer of one that was, with and without readers sharing.

Run it from the backend directory:

    uv run python -m tests.bench_load

Not a test: it asserts nothing and is not collected by pytest.
"""

import random
import re
import tempfile
import threading
import time
from pathlib import Path

import httpx
import uvicorn
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app import readcache
from app.db import configure_sqlite_engine, get_session
from app.main import create_app
from tests.bench_api import build, play_pools
from tests.helpers import sign_in

POLL_SECONDS = 10
NEVER = re.compile(r"(?!)")


def page_urls(client, ids):
    """The reads each kind of page makes when it loads or polls."""
    tid = ids["tournament"]
    pools = ids["pools"]
    return {
        "tournament page": [
            f"/tournaments/{tid}",
            f"/tournaments/{tid}/teams",
            f"/tournaments/{tid}/pools",
            *[f"/pools/{pool}/standings" for pool in pools],
            f"/tournaments/{tid}/playoff-readiness",
            f"/tournaments/{tid}/playoff-brackets",
        ],
        "pool page": [f"/pools/{pools[0]}", f"/pools/{pools[0]}/matches", f"/pools/{pools[0]}/standings"],
        "courts": [f"/tournaments/{tid}/courts"],
    }


class Scorer:
    """Saves running scores on pool matches that are still being played."""

    def __init__(self, client, ids):
        matches = []
        for pool in ids["pools"]:
            matches += [m for m in client.get(f"/pools/{pool}/matches").json() if m["status"] != "complete"]
        self.versions = {match["id"]: match["version"] for match in matches[:8]}
        self.points = {match_id: 0 for match_id in self.versions}
        self.turn = 0

    def request(self):
        ids = list(self.versions)
        match_id = ids[self.turn % len(ids)]
        self.turn += 1
        self.points[match_id] += 1
        return (
            "PATCH",
            f"/matches/{match_id}/score",
            {"team1_score": self.points[match_id], "team2_score": 0, "version": self.versions[match_id], "complete": False},
            match_id,
        )


def simulate(client, ids, viewers, writes_per_second, previews_per_second, seconds=120, seed=7):
    """Poll and write in virtual time; returns (reads, answered from the cache)."""
    rng = random.Random(seed)
    urls = page_urls(client, ids)
    kinds = ["tournament page"] * 5 + ["pool page"] * 3 + ["courts"] * 2
    scorer = Scorer(client, ids)
    events = []
    for _ in range(viewers):
        kind = rng.choice(kinds)
        t = rng.uniform(0, POLL_SECONDS)
        while t < seconds:
            events.append((t, "poll", kind))
            t += POLL_SECONDS
    for rate, name in ((writes_per_second, "write"), (previews_per_second, "preview")):
        if rate:
            # Not on a round number, or a preview would always land on a write's instant.
            t = rng.uniform(0, 1 / rate)
            while t < seconds:
                events.append((t, name, None))
                t += 1 / rate
    events.sort(key=lambda event: event[0])

    reads = cached = 0
    for _, kind, page in events:
        if kind == "poll":
            for url in urls[page]:
                response = client.get(url)
                reads += 1
                cached += response.headers.get("x-cache") in ("hit", "shared")
        elif kind == "write":
            method, url, body, match_id = scorer.request()
            response = client.request(method, url, json=body)
            if response.status_code == 200:
                scorer.versions[match_id] = response.json()["version"]
        else:
            client.post(f"/tournaments/{ids['tournament']}/settings/preview", json={"court_count": 5})
    return reads, cached


def run_viewers(client, ids):
    print("Share of reads answered from the cache (virtual time, 2 minutes, a poll every 10 s)")
    print(f"  {'viewers':>8} {'writes/s':>9} {'previews/s':>11} {'before':>8} {'now':>8}")
    original = readcache.READ_ONLY_WRITES
    for writes in (0.2, 0.5):
        for viewers in (1, 5, 10, 30, 100):
            rates = []
            for pattern in (NEVER, original):
                readcache.READ_ONLY_WRITES = pattern
                reads, cached = simulate(client, ids, viewers, writes, previews_per_second=0.1)
                rates.append(100 * cached / reads)
            print(f"  {viewers:>8} {writes:>9} {0.1:>11} {rates[0]:>7.0f}% {rates[1]:>7.0f}%")
    readcache.READ_ONLY_WRITES = original


# --- the burst, over real HTTP ------------------------------------------------------


class Server:
    """The app on a local port, for readers that really do arrive at the same time."""

    def __init__(self, app, port=8199):
        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", lifespan="off")
        self.server = uvicorn.Server(config)
        self.url = f"http://127.0.0.1:{port}"
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def __enter__(self):
        self.thread.start()
        while not self.server.started:
            time.sleep(0.02)
        return self

    def __exit__(self, *exc):
        self.server.should_exit = True
        self.thread.join(timeout=5)


def burst(base, cookie, urls, viewers, rounds=5):
    """After each write, `viewers` phones ask for every page at once. Counts how each was answered."""
    tally = {"miss": 0, "shared": 0, "hit": 0}
    scorer_state = {"version": None}
    for _ in range(rounds):
        with httpx.Client(base_url=base, cookies={"session": cookie}) as writer:
            match = writer.get(urls["match"]).json()
            writer.patch(
                urls["match"] + "/score",
                json={"team1_score": match["team1_score"] or 0 + 1, "team2_score": 0, "version": match["version"], "complete": False},
            )
        barrier = threading.Barrier(viewers)
        results = []

        def phone():
            with httpx.Client(base_url=base) as client:
                barrier.wait()
                for url in urls["pages"]:
                    results.append(client.get(url).headers.get("x-cache"))

        threads = [threading.Thread(target=phone) for _ in range(viewers)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        for status in results:
            tally[status] = tally.get(status, 0) + 1
    scorer_state.clear()
    return tally


def run_burst():
    print("\nA burst: V phones ask for the tournament page's reads at the same instant after a write (real HTTP)")
    print(f"  {'phones':>7} {'reads':>6} {'worked out':>11} {'shared':>7} {'from cache':>11}   {'worked out, no sharing':>23}")
    directory = Path(tempfile.mkdtemp())
    engine = create_engine(f"sqlite:///{directory / 'load.db'}", connect_args={"check_same_thread": False})
    configure_sqlite_engine(engine)
    SQLModel.metadata.create_all(engine)

    def per_request_session():
        with Session(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = per_request_session
    client = TestClient(app)
    with Session(engine) as session:
        sign_in(client, session)
    ids = build(client)
    play_pools(client, ids, 0.5)
    pages = page_urls(client, ids)["tournament page"]
    match = next(
        m
        for pool in ids["pools"]
        for m in client.get(f"/pools/{pool}/matches").json()
        if m["status"] != "complete"
    )
    urls = {"pages": pages, "match": f"/matches/{match['id']}"}
    cookie = client.cookies.get("session")

    with Server(app) as server:
        for phones in (5, 20, 50):
            row = []
            for sharing in (True, False):
                readcache.SINGLE_FLIGHT = sharing
                row.append(burst(server.url, cookie, urls, phones))
            readcache.SINGLE_FLIGHT = True
            with_sharing, without = row
            reads = sum(with_sharing.values())
            print(
                f"  {phones:>7} {reads:>6} {with_sharing['miss']:>11} {with_sharing['shared']:>7} "
                f"{with_sharing['hit']:>11}   {without['miss']:>23}"
            )


def main():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        client = TestClient(app)
        sign_in(client, session)
        ids = build(client)
        play_pools(client, ids, 0.5)
        run_viewers(client, ids)
    run_burst()


if __name__ == "__main__":
    main()

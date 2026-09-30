import asyncio

from app.readcache import Entry, ReadCache, ReadCacheMiddleware, cacheable, changes_data
from tests.helpers import create_tournament


def _cache_status(response):
    return response.headers.get("x-cache")


def test_a_read_is_worked_out_once_and_replayed_until_something_is_written(client):
    tournament_id = create_tournament(client, "Spring Classic")["id"]

    first = client.get(f"/tournaments/{tournament_id}")
    second = client.get(f"/tournaments/{tournament_id}")

    assert (_cache_status(first), _cache_status(second)) == ("miss", "hit")
    assert first.json() == second.json()
    assert first.headers["content-type"] == second.headers["content-type"]


def test_any_write_empties_the_cache_so_the_next_read_is_fresh(client):
    tournament_id = create_tournament(client, "Spring Classic")["id"]
    client.get(f"/tournaments/{tournament_id}")
    assert _cache_status(client.get(f"/tournaments/{tournament_id}")) == "hit"

    client.patch(f"/tournaments/{tournament_id}", json={"name": "Spring Classic 2026"})
    after = client.get(f"/tournaments/{tournament_id}")

    assert _cache_status(after) == "miss"
    assert after.json()["name"] == "Spring Classic 2026"


def test_a_write_to_one_thing_empties_the_reads_of_everything(client):
    tournament_id = create_tournament(client)["id"]
    client.get("/tournaments")
    client.get(f"/tournaments/{tournament_id}/teams")

    client.post(f"/tournaments/{tournament_id}/teams", json={"name": "Aces"})

    assert _cache_status(client.get("/tournaments")) == "miss"
    teams = client.get(f"/tournaments/{tournament_id}/teams")
    assert _cache_status(teams) == "miss"
    assert [team["name"] for team in teams.json()] == ["Aces"]


def test_a_refused_write_still_empties_the_cache_rather_than_guess(client):
    tournament_id = create_tournament(client)["id"]
    client.get(f"/tournaments/{tournament_id}")

    refused = client.patch(f"/tournaments/{tournament_id}", json={"advance_per_pool": 0})

    assert refused.status_code == 422
    assert _cache_status(client.get(f"/tournaments/{tournament_id}")) == "miss"


def test_different_urls_and_queries_are_cached_apart(client):
    first = create_tournament(client, "First")["id"]
    second = create_tournament(client, "Second")["id"]

    assert client.get(f"/tournaments/{first}").json()["name"] == "First"
    assert client.get(f"/tournaments/{second}").json()["name"] == "Second"
    assert client.get(f"/tournaments/{first}").json()["name"] == "First"


def test_an_error_is_not_cached(client):
    missing = client.get("/tournaments/999")
    again = client.get("/tournaments/999")

    assert missing.status_code == again.status_code == 404
    assert _cache_status(missing) is None and _cache_status(again) is None


def test_sign_in_and_health_are_never_cached(client, anonymous_client):
    assert client.get("/auth/me").status_code == 200
    assert _cache_status(client.get("/auth/me")) is None
    assert anonymous_client.get("/auth/me").status_code == 401
    assert _cache_status(client.get("/health")) is None


def test_an_unchanged_read_answers_a_conditional_request_with_an_empty_304(client):
    tournament_id = create_tournament(client)["id"]
    first = client.get(f"/tournaments/{tournament_id}")
    etag = first.headers["etag"]

    hit = client.get(f"/tournaments/{tournament_id}", headers={"If-None-Match": etag})
    fresh_after_a_write = client.get(f"/tournaments/{tournament_id}", headers={"If-None-Match": etag})

    assert hit.status_code == 304 and hit.content == b""
    assert hit.headers["etag"] == etag
    assert _cache_status(hit) == "hit"
    # Still a 304 (the body is the same) even with the cache emptied by an unrelated write.
    client.post("/tournaments", json={"name": "Elsewhere"})
    after = client.get(f"/tournaments/{tournament_id}", headers={"If-None-Match": etag})
    assert after.status_code == 304
    assert _cache_status(after) == "miss"
    assert fresh_after_a_write.status_code == 304


def test_a_changed_read_ignores_the_old_etag_and_sends_the_new_body(client):
    tournament_id = create_tournament(client, "Old")["id"]
    etag = client.get(f"/tournaments/{tournament_id}").headers["etag"]

    client.patch(f"/tournaments/{tournament_id}", json={"name": "New"})
    response = client.get(f"/tournaments/{tournament_id}", headers={"If-None-Match": etag})

    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.headers["etag"] != etag


def test_cached_reads_must_be_revalidated_by_the_browser(client):
    tournament_id = create_tournament(client)["id"]

    assert client.get(f"/tournaments/{tournament_id}").headers["cache-control"] == "no-cache"


def test_a_replayed_read_keeps_the_cors_headers_for_the_asking_origin(client):
    tournament_id = create_tournament(client)["id"]
    for origin in ("http://localhost:5173", "https://tournament.johnchau.org"):
        client.get(f"/tournaments/{tournament_id}", headers={"Origin": origin})
        replay = client.get(f"/tournaments/{tournament_id}", headers={"Origin": origin})
        assert _cache_status(replay) == "hit"
        assert replay.headers["access-control-allow-origin"] == origin


def test_a_read_that_overlaps_a_write_is_not_kept():
    cache = ReadCache()
    key = ("/tournaments/1", b"")
    entry = Entry([(b"content-type", b"application/json")], b"{}")

    started_at = cache.generation
    cache.bump()  # a write began while the read was being worked out

    assert cache.put(key, entry, started_at) is False
    assert cache.get(key) is None
    assert cache.put(key, entry, cache.generation) is True
    assert cache.get(key) is entry


def test_the_cache_is_bounded():
    cache = ReadCache()
    entry = Entry([], b"{}")
    for number in range(2500):
        cache.put((f"/tournaments/{number}", b""), entry, cache.generation)

    assert len(cache._entries) <= 2000
    assert cache.get(("/tournaments/2499", b"")) is entry


def test_only_public_reads_are_cacheable():
    def scope(method, path):
        return {"method": method, "path": path}

    assert cacheable(scope("GET", "/tournaments/3/courts"))
    assert cacheable(scope("GET", "/playoff-brackets/2/dispatch"))
    assert not cacheable(scope("POST", "/tournaments"))
    assert not cacheable(scope("GET", "/auth/me"))
    assert not cacheable(scope("GET", "/health"))
    assert not cacheable(scope("GET", "/openapi.json"))


def test_the_cache_can_be_turned_off(monkeypatch):
    from app.main import create_app

    monkeypatch.setenv("READ_CACHE", "0")

    stack = [m.cls for m in create_app().user_middleware]

    assert ReadCacheMiddleware not in stack


def test_a_preview_or_sign_in_leaves_the_cache_alone(client):
    tournament_id = create_tournament(client)["id"]
    client.get(f"/tournaments/{tournament_id}")
    assert _cache_status(client.get(f"/tournaments/{tournament_id}")) == "hit"

    client.post(f"/tournaments/{tournament_id}/settings/preview", json={"court_count": 3})
    client.post("/auth/login", json={"username": "nobody", "password": "not-a-real-password"})

    assert _cache_status(client.get(f"/tournaments/{tournament_id}")) == "hit"


def test_only_writes_that_change_data_empty_the_cache():
    def scope(method, path):
        return {"method": method, "path": path}

    assert changes_data(scope("POST", "/tournaments/1/teams"))
    assert changes_data(scope("PATCH", "/matches/4/score"))
    assert changes_data(scope("PUT", "/matches/4/game-in-play"))
    assert changes_data(scope("DELETE", "/teams/2"))
    assert changes_data(scope("POST", "/matches/4/correct/preview")) is False
    assert changes_data(scope("POST", "/tournaments/1/settings/preview")) is False
    assert changes_data(scope("POST", "/auth/login")) is False
    assert changes_data(scope("POST", "/auth/logout")) is False
    assert changes_data(scope("POST", "/auth/password")) is False
    assert changes_data(scope("GET", "/tournaments/1")) is False


# --- readers arriving together share one computation --------------------------------------


def _slow_app(status=200, delay=0.05):
    """An app that takes a moment and says how many times it has been asked."""
    calls = {"n": 0}

    async def app(scope, receive, send):
        calls["n"] += 1
        number = calls["n"]
        await asyncio.sleep(delay)
        await send(
            {"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]}
        )
        await send({"type": "http.response.body", "body": b'{"n": %d}' % number})

    return app, calls


async def _ask(middleware, method="GET", path="/tournaments/1"):
    sent = []

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": method, "path": path, "query_string": b"", "headers": []}
    await middleware(scope, receive, send)
    start = sent[0]
    return start["status"], dict(start["headers"]), sent[-1]["body"]


def test_readers_asking_together_share_one_computation():
    async def scenario():
        app, calls = _slow_app()
        middleware = ReadCacheMiddleware(app)
        results = await asyncio.gather(*[_ask(middleware) for _ in range(5)])
        again = await _ask(middleware)
        return calls["n"], results, again, middleware.cache.stats

    computed, results, again, stats = asyncio.run(scenario())

    assert computed == 1
    assert {status for status, _, _ in results} == {200}
    assert {body for _, _, body in results} == {b'{"n": 1}'}
    assert sorted(headers[b"x-cache"] for _, headers, _ in results) == [b"miss"] + [b"shared"] * 4
    assert again[1][b"x-cache"] == b"hit"
    assert stats == {"hit": 1, "shared": 4, "miss": 1}


def test_a_reader_after_a_write_starts_does_not_join_an_older_computation():
    async def scenario():
        app, calls = _slow_app(delay=0.1)
        middleware = ReadCacheMiddleware(app)
        before = asyncio.create_task(_ask(middleware))
        await asyncio.sleep(0.02)
        write = asyncio.create_task(_ask(middleware, "PATCH", "/matches/1/score"))
        await asyncio.sleep(0.02)
        after = await _ask(middleware)
        await asyncio.gather(before, write)
        return calls["n"], await before, after

    computed, before, after = asyncio.run(scenario())

    # The read after the write began computed for itself: three runs (read, write, read).
    assert computed == 3
    assert after[1][b"x-cache"] == b"miss"
    assert before[2] == b'{"n": 1}'
    assert after[2] == b'{"n": 3}'


def test_readers_wait_for_a_shared_computation_only_if_it_gives_a_200():
    async def scenario():
        app, calls = _slow_app(status=404)
        middleware = ReadCacheMiddleware(app)
        results = await asyncio.gather(*[_ask(middleware) for _ in range(3)])
        return calls["n"], results

    computed, results = asyncio.run(scenario())

    assert {status for status, _, _ in results} == {404}
    assert computed == 3


def test_a_dropped_first_request_does_not_strand_the_readers_behind_it():
    async def scenario():
        app, calls = _slow_app(delay=0.1)
        middleware = ReadCacheMiddleware(app)
        first = asyncio.create_task(_ask(middleware))
        await asyncio.sleep(0.02)
        waiting = [asyncio.create_task(_ask(middleware)) for _ in range(3)]
        await asyncio.sleep(0.02)
        first.cancel()
        results = await asyncio.wait_for(asyncio.gather(*waiting), timeout=2)
        return calls["n"], results

    computed, results = asyncio.run(scenario())

    # Nobody is left waiting on a request that will never finish. Each waiter works out its
    # own answer (four runs with the dropped one): rare, and no worse than before sharing.
    assert {status for status, _, _ in results} == {200}
    assert computed == 4

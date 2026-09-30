"""An in-memory cache of the API's public reads, dropped whenever anything is written.

Every phone at the venue polls the same few pages every ten seconds, and the
answers only change when someone scores or edits. So a read is worked out once
and replayed until the next write; any write (POST, PATCH, PUT or DELETE) that
changes data empties the cache. This is only safe because a single process
serves the API and every change goes through it: with several workers, or a
script writing to the database directly, a read could outlive the change that
made it stale.

Cached reads also carry an ETag (a hash of the body), so a phone whose page is
unchanged is answered with an empty 304 instead of the JSON.

Two things keep the hit rate up:

- A POST that only asks a question (a settings preview, a correction preview)
  or handles sign-in changes nothing anyone reads, so it leaves the cache alone.
- When a write has just emptied the cache, every phone polling at that moment
  asks for the same page. One request works it out and the others wait for
  that answer, instead of each computing it. A request that arrives after a
  write has started never joins a computation begun before it.

A read that overlaps a write is never stored: the write bumps the generation
when it starts and again when it ends, and a read is only kept if the
generation is the same at its end as at its start.

Set READ_CACHE=0 to turn it off.
"""

import asyncio
import hashlib
import os
import re

# Only these public reads are cached; sign-in and health are never.
CACHED_PREFIXES = ("/tournaments", "/pools", "/playoff-brackets", "/matches", "/teams")
# Writes by verb that change nothing that is cached: sign-in and its kin, and the
# previews that only work out what a change would do.
READ_ONLY_WRITES = re.compile(r"^/auth/|/settings/preview$|/correct/preview$")
MAX_ENTRIES = 2000
# Whether readers of a page being worked out wait for it. Only the load simulation turns this off.
SINGLE_FLIGHT = True
# Headers of a stored response that must not be replayed: they describe the request that made it.
_TRACE_HEADERS = {b"x-db-queries", b"x-db-ms"}
_SKIP_HEADERS = _TRACE_HEADERS | {b"x-cache", b"etag"}


def enabled() -> bool:
    return os.environ.get("READ_CACHE", "1").lower() not in ("0", "false", "off")


class Entry:
    """A stored 200 response."""

    __slots__ = ("headers", "body", "etag")

    def __init__(self, headers: list[tuple[bytes, bytes]], body: bytes) -> None:
        self.headers = [(k, v) for k, v in headers if k.lower() not in _SKIP_HEADERS]
        self.body = body
        self.etag = b'"' + hashlib.sha1(body).hexdigest()[:20].encode() + b'"'


class ReadCache:
    def __init__(self) -> None:
        self.generation = 0
        self._entries: dict[tuple[str, bytes], Entry] = {}
        # How each cached read was answered, for the load simulation and the curious.
        self.stats = {"hit": 0, "shared": 0, "miss": 0}

    def get(self, key: tuple[str, bytes]) -> Entry | None:
        return self._entries.get(key)

    def put(self, key: tuple[str, bytes], entry: Entry, generation: int) -> bool:
        """Keep `entry` unless a write has happened since `generation`; True if kept."""
        if generation != self.generation:
            return False
        if len(self._entries) >= MAX_ENTRIES:
            self._entries.clear()
        self._entries[key] = entry
        return True

    def bump(self) -> None:
        """Something is being, or has been, written: forget everything."""
        self.generation += 1
        self._entries.clear()


class Flight:
    """A read being worked out, which readers of the same page can wait for."""

    __slots__ = ("generation", "done")

    def __init__(self, generation: int) -> None:
        self.generation = generation
        self.done: asyncio.Future[Entry | None] = asyncio.get_running_loop().create_future()


def cacheable(scope) -> bool:
    return scope["method"] == "GET" and scope["path"].startswith(CACHED_PREFIXES)


def changes_data(scope) -> bool:
    """Whether the request is a write that can change what a cached read would say."""
    return scope["method"] in ("POST", "PATCH", "PUT", "DELETE") and not READ_ONLY_WRITES.search(
        scope["path"]
    )


def _header(headers, name: bytes) -> bytes | None:
    for key, value in headers:
        if key.lower() == name:
            return value
    return None


def _matches(request_headers, etag: bytes) -> bool:
    sent = _header(request_headers, b"if-none-match")
    if sent is None:
        return False
    tags = {tag.strip().removeprefix(b"W/") for tag in sent.split(b",")}
    return etag in tags or b"*" in tags


async def _replay(send, entry: Entry, request_headers, cache_status: bytes, extra=()) -> None:
    common = [
        (b"etag", entry.etag),
        (b"cache-control", b"no-cache"),
        (b"x-cache", cache_status),
        *extra,
    ]
    if _matches(request_headers, entry.etag):
        await send({"type": "http.response.start", "status": 304, "headers": common})
        await send({"type": "http.response.body", "body": b""})
        return
    await send(
        {"type": "http.response.start", "status": 200, "headers": [*entry.headers, *common]}
    )
    await send({"type": "http.response.body", "body": entry.body})


class ReadCacheMiddleware:
    """A pure ASGI middleware, inside CORS (so cached bodies carry no CORS headers) and
    outside the database tracer (so a hit shows no statements)."""

    def __init__(self, app, cache: ReadCache | None = None) -> None:
        self.app = app
        self.cache = cache or ReadCache()
        self._flights: dict[tuple[str, bytes], Flight] = {}

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if changes_data(scope):
            self.cache.bump()
            try:
                await self.app(scope, receive, send)
            finally:
                self.cache.bump()
            return
        if not cacheable(scope):
            await self.app(scope, receive, send)
            return

        key = (scope["path"], scope.get("query_string", b""))
        request_headers = scope.get("headers", [])
        entry = self.cache.get(key)
        if entry is not None:
            self.cache.stats["hit"] += 1
            await _replay(send, entry, request_headers, b"hit")
            return

        # Someone is already working this page out (from after the last write): wait for them.
        flight = self._flights.get(key) if SINGLE_FLIGHT else None
        if flight is not None and flight.generation == self.cache.generation:
            shared = await flight.done
            if shared is not None:
                self.cache.stats["shared"] += 1
                await _replay(send, shared, request_headers, b"shared")
                return
            # Theirs was not a 200 to share (an error, say): work out our own.

        self.cache.stats["miss"] += 1
        await self._compute(scope, receive, send, key, request_headers)

    async def _compute(self, scope, receive, send, key, request_headers) -> None:
        generation = self.cache.generation
        flight = Flight(generation)
        self._flights[key] = flight
        start_message: dict | None = None
        chunks: list[bytes] = []
        passthrough = False

        async def capture(message) -> None:
            nonlocal start_message, passthrough
            if passthrough:
                await send(message)
                return
            if message["type"] == "http.response.start":
                if message["status"] != 200:
                    passthrough = True
                    await send(message)
                else:
                    start_message = message
                return
            chunks.append(message.get("body", b""))
            if message.get("more_body", False):
                return
            fresh = Entry(start_message["headers"], b"".join(chunks))
            self.cache.put(key, fresh, generation)
            if not flight.done.done():
                flight.done.set_result(fresh)
            # What the tracer measured for this request is kept for this response only.
            measured = [(k, v) for k, v in start_message["headers"] if k.lower() in _TRACE_HEADERS]
            await _replay(send, fresh, request_headers, b"miss", measured)

        try:
            await self.app(scope, receive, capture)
        finally:
            # Anyone waiting who was not handed a 200 (an error, a dropped request) works it out itself.
            if not flight.done.done():
                flight.done.set_result(None)
            if self._flights.get(key) is flight:
                del self._flights[key]

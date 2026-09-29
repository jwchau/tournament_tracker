"""An in-memory cache of the API's public reads, dropped whenever anything is written.

Every phone at the venue polls the same few pages every ten seconds, and the
answers only change when someone scores or edits. So a read is worked out once
and replayed until the next write; any write (POST, PATCH, PUT or DELETE)
empties the cache. This is only safe because a single process serves the API
and every change goes through it: with several workers, or a script writing to
the database directly, a read could outlive the change that made it stale.

Cached reads also carry an ETag (a hash of the body), so a phone whose page is
unchanged is answered with an empty 304 instead of the JSON.

A read that overlaps a write is never stored: the write bumps the generation
when it starts and again when it ends, and a read is only kept if the
generation is the same at its end as at its start.

Set READ_CACHE=0 to turn it off.
"""

import hashlib
import os

# Only these public reads are cached; sign-in and health are never.
CACHED_PREFIXES = ("/tournaments", "/pools", "/playoff-brackets", "/matches", "/teams")
MAX_ENTRIES = 2000
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


def cacheable(scope) -> bool:
    return scope["method"] == "GET" and scope["path"].startswith(CACHED_PREFIXES)


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

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] in ("POST", "PATCH", "PUT", "DELETE"):
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
            await _replay(send, entry, request_headers, b"hit")
            return

        generation = self.cache.generation
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
            # What the tracer measured for this request is kept for this response only.
            measured = [(k, v) for k, v in start_message["headers"] if k.lower() in _TRACE_HEADERS]
            await _replay(send, fresh, request_headers, b"miss", measured)

        await self.app(scope, receive, capture)

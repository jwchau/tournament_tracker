"""Counts the database statements each request runs, to find chatty endpoints.

Off unless DB_TRACE=1. When on, every response carries X-DB-Queries (how many
statements it took) and X-DB-Ms (time spent in them), and each request is
logged, with any statement it repeated: the tell of a query inside a loop.

    DB_TRACE=1 uv run uvicorn app.main:create_app --factory
"""

import contextvars
import logging
import os
import time
from collections import Counter

from sqlalchemy import event
from sqlalchemy.engine import Engine

log = logging.getLogger("dbtrace")

_current: contextvars.ContextVar["Trace | None"] = contextvars.ContextVar("dbtrace", default=None)
_installed = False

# A statement repeated this often in one request is reported.
REPEAT_REPORT = 5


class Trace:
    """The statements one request has run so far."""

    def __init__(self) -> None:
        self.statements: list[str] = []
        self.seconds = 0.0

    def repeated(self) -> list[tuple[str, int]]:
        counts = Counter(self.statements)
        return [(sql, n) for sql, n in counts.most_common() if n >= REPEAT_REPORT]


def enabled() -> bool:
    return os.environ.get("DB_TRACE", "").lower() in ("1", "true")


def _shorten(statement: str) -> str:
    return " ".join(statement.split())[:200]


def _before(conn, cursor, statement, parameters, context, executemany) -> None:
    if _current.get() is not None:
        context._dbtrace_started = time.perf_counter()


def _after(conn, cursor, statement, parameters, context, executemany) -> None:
    trace = _current.get()
    started = getattr(context, "_dbtrace_started", None)
    if trace is None or started is None:
        return
    trace.seconds += time.perf_counter() - started
    trace.statements.append(_shorten(statement))


def install() -> None:
    """Listen on every engine, once."""
    global _installed
    if _installed:
        return
    _installed = True
    event.listen(Engine, "before_cursor_execute", _before)
    event.listen(Engine, "after_cursor_execute", _after)
    if not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False


class DbTraceMiddleware:
    """A pure ASGI middleware, so its context variable reaches the threadpool."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        trace = Trace()
        token = _current.set(trace)
        started = time.perf_counter()
        status = 0

        async def send_with_counts(message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {
                    **message,
                    "headers": [
                        *message.get("headers", []),
                        (b"x-db-queries", str(len(trace.statements)).encode()),
                        (b"x-db-ms", f"{trace.seconds * 1000:.1f}".encode()),
                    ],
                }
            await send(message)

        try:
            await self.app(scope, receive, send_with_counts)
        finally:
            _current.reset(token)
            log.info(
                "dbtrace %s %s -> %s in %.1fms: %d statements, %.1fms in sql",
                scope["method"],
                scope["path"],
                status,
                (time.perf_counter() - started) * 1000,
                len(trace.statements),
                trace.seconds * 1000,
            )
            for sql, times in trace.repeated():
                log.info("dbtrace   x%d %s", times, sql)

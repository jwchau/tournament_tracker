import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import dbtrace, readcache
from app.auth import require_session_for_writes
from app.auth import router as auth_router
from app.court_routes import router as court_router
from app.db import drop_tierless_bracket_matches, engine, init_db
from app.playoff_routes import router as playoff_router
from app.pool_routes import router as pool_router
from app.refs import backfill_refs
from app.routers import router
from app.series_routes import router as series_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    drop_tierless_bracket_matches()
    backfill_refs(engine)
    yield


def _allowed_origins() -> dict:
    """Production sets FRONTEND_ORIGIN (comma-separated) and allows only that.

    Dev allows the local Vite server, the tunnelled frontend, and quick tunnels.
    """
    configured = os.environ.get("FRONTEND_ORIGIN", "").strip()
    if configured:
        return {"allow_origins": [origin.strip() for origin in configured.split(",")]}
    return {
        "allow_origins": ["http://localhost:5173", "https://tournament.johnchau.org"],
        "allow_origin_regex": r"https://.*\.trycloudflare\.com",
    }


def create_app() -> FastAPI:
    # One dependency on every route: reads are public, writes need a session.
    app = FastAPI(lifespan=lifespan, dependencies=[Depends(require_session_for_writes)])

    # Innermost first: the tracer, then the cache (so a hit runs no statements), then CORS.
    if dbtrace.enabled():
        dbtrace.install()
        app.add_middleware(dbtrace.DbTraceMiddleware)
    if readcache.enabled():
        app.add_middleware(readcache.ReadCacheMiddleware)

    app.add_middleware(
        CORSMiddleware,
        **_allowed_origins(),
        # The session cookie; this needs explicit origins, never "*".
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(router)
    app.include_router(pool_router)
    app.include_router(playoff_router)
    app.include_router(series_router)
    app.include_router(court_router)

    return app

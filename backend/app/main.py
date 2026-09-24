from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import require_session_for_writes
from app.auth import router as auth_router
from app.db import drop_tierless_bracket_matches, init_db
from app.playoff_routes import router as playoff_router
from app.pool_routes import router as pool_router
from app.routers import router
from app.series_routes import router as series_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    drop_tierless_bracket_matches()
    yield


def create_app() -> FastAPI:
    # One dependency on every route: reads are public, writes need a session.
    app = FastAPI(lifespan=lifespan, dependencies=[Depends(require_session_for_writes)])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "https://tournament.johnchau.org"],
        allow_origin_regex=r"https://.*\.trycloudflare\.com",
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

    return app

# Tournament Tracker

A self-hosted tournament management tool covering the full lifecycle of a
bracket-and-pool tournament: team registration, pool play (round-robin) with
auto-scheduling, advancement into tiered elimination playoff brackets
(single or double elimination), live score entry with concurrency-safe
writes, and cascading score correction.

Scope is a personal/local tool: no authentication, single trusted organizer,
run via Docker Compose on a local machine or LAN at a venue. See
[PRD.md](PRD.md) for the full product spec and [tickets/](tickets) for the
planned vertical slices.

## Stack

- **Backend**: Python, FastAPI, SQLModel/SQLAlchemy, SQLite (WAL mode,
  `busy_timeout` set). CORS is enabled for the frontend's dev origin
  (`http://localhost:5173`).
- **Frontend**: React + Vite.
- **Dev/run environment**: Docker Compose (backend container, frontend
  container).
- **Testing**: strict TDD (red-green-refactor). Backend: pytest. Frontend:
  React Testing Library / Vitest.

## Status

Slice 0 (project scaffolding) is implemented and verified end-to-end via
`docker compose up`: a FastAPI backend with a `/health` endpoint, SQLite/WAL
setup, and CORS enabled for the frontend dev origin; a Vite + React frontend
that calls `/health` and renders connection status; both wired together via
Docker Compose, with backend (pytest) and frontend (Vitest) test harnesses
passing inside the running containers. No tournament domain logic
(`Tournament`, `Team`, `Match`, etc.) exists yet — that starts with
[tickets/01-tournament-and-team-setup.md](tickets/01-tournament-and-team-setup.md).

## Getting started

### Docker Compose (recommended)

```sh
docker compose up --build
```

- Backend: http://localhost:8000 (health check at `/health`)
- Frontend: http://localhost:5173 — should show "Backend status: connected"

Both services are volume-mounted for live reload; source edits on the host
are picked up automatically.

> **Windows note:** if `frontend/node_modules` was previously installed
> directly on the host (outside Docker), remove it before first bringing the
> stack up (`rm -rf frontend/node_modules`) and drop the
> `frontend_node_modules` volume if it already exists
> (`docker volume rm tournament_tracker_frontend_node_modules`). Otherwise the
> bind mount can leak Windows binaries into the Linux container's
> `node_modules`, and npm's `.bin/vite` shim can fail with
> `node.exe: not found` — Docker Desktop's backing VM reports a WSL2 kernel,
> which trips the shim's Windows-interop detection. The frontend's `CMD`
> already works around this by invoking `vite.js` directly through `node`.

### Running services individually

**Backend** (requires [uv](https://docs.astral.sh/uv/)):

```sh
cd backend
uv sync
uv run uvicorn app.main:create_app --factory --reload
```

**Frontend** (requires Node.js):

```sh
cd frontend
npm install
npm run dev
```

## Testing

Run locally against a standalone service, or inside the containers if the
stack is already up via `docker compose up`.

**Backend**:

```sh
cd backend && uv run pytest              # standalone
docker compose exec backend uv run pytest # inside the running container
```

**Frontend**:

```sh
cd frontend && npm test && npm run lint                       # standalone
docker compose exec frontend node ./node_modules/vitest/vitest.mjs run # inside the running container
```

## Project layout

```
backend/    FastAPI app (app/), tests/, pyproject.toml
frontend/   Vite + React app (src/), Vitest tests
tickets/    Vertical-slice implementation tickets (see PRD.md for context)
PRD.md      Full product requirements document
```

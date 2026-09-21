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
  (`http://localhost:5173`), the permanent external domain
  (`https://tournament.johnchau.org`), and any Cloudflare quick-tunnel
  origin (`https://*.trycloudflare.com`).
- **Frontend**: React + Vite.
- **Dev/run environment**: Docker Compose (backend container, frontend
  container).
- **Testing**: strict TDD (red-green-refactor). Backend: pytest, with most
  tests running against an isolated in-memory SQLite session (see
  `backend/tests/conftest.py`); the concurrency tests use a real file-based
  SQLite engine per test (`tmp_path`) instead, since the in-memory
  `StaticPool` session funnels every connection through a single shared
  connection and can't exercise genuine cross-thread lock contention.
  Frontend: React Testing Library / Vitest.

## Status

- **Slice 0** (project scaffolding) — done. FastAPI backend with `/health`,
  SQLite/WAL setup; Vite + React frontend that calls `/health` and renders
  connection status; both wired via Docker Compose.
- **Slice 01** ([tickets/01-tournament-and-team-setup.md](tickets/01-tournament-and-team-setup.md))
  — done. `Tournament`, `Team`, and `Player` models; REST endpoints to
  create/list each; an admin-setup frontend flow to create a tournament, add
  teams, and add players to a roster, with a nested list view.
- **Slice 02** ([tickets/02-single-elimination-bracket.md](tickets/02-single-elimination-bracket.md))
  — done. Bracket generation (`_seed_order`/`generate_single_elimination`)
  with standard seeding and bye handling; a `Match` model; endpoints to
  generate/fetch a bracket; an SVG `BracketDiagram` behind a "Generate
  bracket" trigger.
- **Slice 03** ([tickets/03-live-scoring-concurrency.md](tickets/03-live-scoring-concurrency.md))
  — done. `submit_score()` does a single version-checked `UPDATE` (409 on a
  rowcount-0 conflict) and, on completion, an atomic second `UPDATE` that
  writes the winner into the next match's slot with status recomputed via a
  SQL `CASE` on that row's *current* state — so two matches completing
  concurrently into different slots of the same downstream match can't
  clobber each other. A completed match cannot be re-scored through this
  endpoint (`400`); cascading correction is deferred to slice 04, and until
  it exists the API simply refuses to silently overwrite a decided match.
  Frontend: `ScoreEntryForm` (shows version, submits, and surfaces a `409`
  with a refetch affordance) rendered per scorable match inside
  `BracketDiagram`, which now polls every 4s.
- **Next**: [tickets/04-cascading-score-correction.md](tickets/04-cascading-score-correction.md)
  — not started.

Both backend and frontend test suites pass inside the running containers and
standalone; verified end-to-end via `docker compose up`.

## API endpoints

| Method | Path                                | Description                        |
| ------ | ----------------------------------- | ----------------------------------- |
| POST   | `/tournaments`                      | Create a tournament                 |
| GET    | `/tournaments`                      | List tournaments                    |
| POST   | `/tournaments/{id}/teams`           | Add a team to a tournament (404 if tournament doesn't exist) |
| GET    | `/tournaments/{id}/teams`           | List a tournament's teams           |
| POST   | `/teams/{id}/players`               | Add a player to a team's roster (404 if team doesn't exist) |
| GET    | `/teams/{id}/players`               | List a team's roster                |
| POST   | `/tournaments/{id}/bracket/generate` | Generate and persist a single-elimination bracket |
| GET    | `/tournaments/{id}/bracket`         | List a tournament's bracket matches |
| GET    | `/matches/{id}`                     | Get a single match (404 if it doesn't exist) |
| PATCH  | `/matches/{id}/score`               | Submit a score (`team1_score`, `team2_score`, `version`, `complete`); `409` on a version conflict, `400` if completion is invalid (tie, unknown team, or already complete) |
| GET    | `/health`                           | Health check                        |

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

## External access

The app can be exposed outside localhost via a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
pointed at a permanent domain (`tournament.johnchau.org` for the
frontend, `tournament-api.johnchau.org` for the backend), free on
Cloudflare's tier — only the domain registration itself has any cost.
Tunnel setup (`cloudflared`
login/credentials/`config.yml`) lives on the host, not in this repo; the app
side of it is just the CORS origin and Vite `allowedHosts` entries in
`backend/app/main.py` and `frontend/vite.config.js`. Ephemeral quick tunnels
(`cloudflared tunnel --url <local-url>`) also work out of the box via the
`*.trycloudflare.com` regex/wildcard already configured in both places.

## Project layout

```
backend/    FastAPI app (app/), tests/, pyproject.toml
frontend/   Vite + React app (src/), Vitest tests
tickets/    Vertical-slice implementation tickets (see PRD.md for context)
PRD.md      Full product requirements document
```

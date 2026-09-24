# Tournament Tracker

A self-hosted tournament management tool covering the full lifecycle of a
bracket-and-pool tournament: team registration, pool play (round-robin) with
auto-scheduling, advancement into tiered elimination playoff brackets
(single or double elimination), live score entry with concurrency-safe
writes, and cascading score correction.

Scope is a personal/local tool run via Docker Compose on a local machine or LAN
at a venue. Anyone can follow pools and brackets read-only; changing anything
needs a username and password (no sign-up, no roles). See
[tickets/](tickets) for the vertical slices; the code and its tests are the
source of truth for behaviour.

## Stack

- **Backend:** FastAPI, SQLModel, SQLite (WAL), pytest
- **Frontend:** React, Vite, Vitest + React Testing Library
- **Run:** Docker Compose
- **Process:** TDD (red-green-refactor)

## Status

Details for each slice live in its ticket under [tickets/](tickets).

| Slice | Ticket | Status |
| ----- | ------ | ------ |
| 00 | Project scaffolding | Done |
| 01 | Tournament and team setup | Done |
| 02 | Single-elimination bracket | Done |
| 03 | Live scoring and concurrency | Done |
| 04 | Cascading score correction | Done |
| 05 | Double elimination | Done |
| 06 | Manual match scheduling | Done |
| 07 | Pools and round-robin scheduling | Done |
| 08 | Pool-to-playoff advancement | Done |
| 09 | Playoff court auto-dispatch | Done |
| 10 | Frontend on Cloudflare Workers | Done |
| 11 | Bracket pages and pool settings | Done |
| 12 | Playoff best-of series | Done |
| 13 | Confirm tournament settings | Done |
| 14 | Team check-in edits | Done |
| 15 | Tournament lifecycle and results | Done |
| 16 | Court view for scorekeepers | Done |
| 17 | Venue deployment | Not started |
| 18 | Dress rehearsal and v1.0.0 | Not started |
| 19 | Access control and login | Done |

The road to v1 and its release criteria are in [V1_MVP_PLAN.md](V1_MVP_PLAN.md).

Unticketed work also done: client-side routing, a nav bar with back/forward,
toast notifications, tournament deletion, and page-data caching.

## API endpoints

Full interactive reference at http://localhost:8000/docs when the backend is running.

`GET` endpoints are public. Every `POST`/`PATCH`/`DELETE` needs a session
cookie from `POST /auth/login` and answers `401` without one.

| Resource | Endpoints |
| -------- | --------- |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` |
| Tournaments | `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}`, `GET /tournaments/{id}/results` |
| Teams | `GET/POST /tournaments/{id}/teams`, `GET/PATCH/DELETE /teams/{id}` |
| Players | `GET/POST /teams/{id}/players`, `DELETE /teams/{id}/players/{playerId}` |
| Pools | `GET/POST /tournaments/{id}/pools`, `POST /tournaments/{id}/pools/auto-assign`, `GET/PATCH/DELETE /pools/{id}`, `POST /pools/{id}/generate-schedule`, `GET /pools/{id}/matches`, `GET /pools/{id}/standings` |
| Playoffs | `POST /tournaments/{id}/bracket/generate` (no pools), `GET /tournaments/{id}/playoff-readiness`, `POST /tournaments/{id}/advance-to-playoffs`, `GET/DELETE /tournaments/{id}/playoff-brackets`, `GET /playoff-brackets/{id}`, `GET /playoff-brackets/{id}/matches`, `GET /playoff-brackets/{id}/dispatch` (courts and queue) |
| Matches | `GET /matches/{id}`, `PATCH /matches/{id}/score`, `POST /matches/{id}/correct/preview`, `PATCH /matches/{id}/correct`, `PATCH /matches/{id}/schedule`, `PATCH /matches/{id}/hold` (playoff hold), `GET/POST /matches/{id}/games`, `PATCH /matches/{id}/games/{number}` (best-of series) |
| Courts | `GET /tournaments/{id}/courts` (each court's current match and what's next) |
| Health | `GET /health` |

## Getting started

```sh
docker compose up --build
```

Frontend at http://localhost:5173, backend at http://localhost:8000. Source is
volume-mounted for live reload.

> **Windows:** if `frontend/node_modules` was ever installed on the host,
> delete it and the `tournament_tracker_frontend_node_modules` volume before
> the first run, or Windows binaries leak into the container.

To run without Docker: `cd backend && uv sync && uv run uvicorn app.main:create_app --factory --reload`
and `cd frontend && npm install && npm run dev`.

### Users

There's no sign-up page. Create the first user (and any others) from the
command line; it prompts for the password (at least 8 characters), which is
stored hashed with argon2id:

```sh
cd backend && uv run python -m app.users create <username>
# or, with the dev stack running:
docker compose exec backend uv run python -m app.users create <username>
```

`... app.users reset-password <username>` sets a new password for a user who
lost theirs and signs them out everywhere. Five wrong passwords for a
username lock it out for 15 minutes. Session cookies last 14 days; set
`COOKIE_SECURE=true` on the backend when it's served over HTTPS.

## Testing

```sh
cd backend && uv run pytest
cd frontend && npm test && npm run lint
```

Slow stress tests are skipped by default; run them with `uv run pytest -m stress`.

Inside running containers: `docker compose exec backend uv run pytest` and
`docker compose exec frontend node ./node_modules/vitest/vitest.mjs run`.

## External access

A Cloudflare Tunnel exposes the app at `tournament.johnchau.org` (frontend) and
`tournament-api.johnchau.org` (backend). Tunnel config lives on the host; start
it manually alongside Docker Compose:

```sh
cloudflared tunnel run tournament-tracker
```

Quick tunnels (`*.trycloudflare.com`) are already allowed by CORS and Vite,
but signing in only works where the frontend and API share a site (like the
two `johnchau.org` hostnames): each quick tunnel is its own site, so the
browser won't send the `SameSite=Lax` session cookie between two of them.
Spectating works either way.
The frontend can instead be deployed to Cloudflare Workers
(`frontend/wrangler.jsonc`); see
[tickets/10-cloudflare-workers-frontend.md](tickets/10-cloudflare-workers-frontend.md).

## Project layout

```
backend/    FastAPI app and tests
frontend/   React app and tests
tickets/    Implementation tickets
V1_MVP_PLAN.md  Road to the v1 release
```

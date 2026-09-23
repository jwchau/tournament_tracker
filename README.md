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
| 09 | Playoff court auto-dispatch | Next |
| 10 | Frontend on Cloudflare Workers | Done |

Unticketed work also done: client-side routing, a nav bar with back/forward,
toast notifications, tournament deletion, and page-data caching.

## API endpoints

Full interactive reference at http://localhost:8000/docs when the backend is running.

| Resource | Endpoints |
| -------- | --------- |
| Tournaments | `GET/POST /tournaments`, `GET/PATCH/DELETE /tournaments/{id}` |
| Teams | `GET/POST /tournaments/{id}/teams`, `GET/PATCH /teams/{id}` |
| Players | `GET/POST /teams/{id}/players`, `DELETE /teams/{id}/players/{playerId}` |
| Pools | `GET/POST /tournaments/{id}/pools`, `POST /tournaments/{id}/pools/auto-assign`, `GET/PATCH/DELETE /pools/{id}`, `POST /pools/{id}/generate-schedule`, `GET /pools/{id}/matches`, `GET /pools/{id}/standings` |
| Bracket | `POST /tournaments/{id}/bracket/generate`, `GET /tournaments/{id}/bracket` |
| Playoffs | `GET /tournaments/{id}/playoff-readiness`, `POST /tournaments/{id}/advance-to-playoffs`, `GET /tournaments/{id}/playoff-brackets`, `GET /playoff-brackets/{id}/matches` |
| Matches | `GET /matches/{id}`, `PATCH /matches/{id}/score`, `POST /matches/{id}/correct/preview`, `PATCH /matches/{id}/correct`, `PATCH /matches/{id}/schedule` |
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

Quick tunnels (`*.trycloudflare.com`) are already allowed by CORS and Vite.
The frontend can instead be deployed to Cloudflare Workers
(`frontend/wrangler.jsonc`); see
[tickets/10-cloudflare-workers-frontend.md](tickets/10-cloudflare-workers-frontend.md).

## Project layout

```
backend/    FastAPI app and tests
frontend/   React app and tests
tickets/    Implementation tickets
PRD.md      Product requirements
```

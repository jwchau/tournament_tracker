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
  bracket" trigger. `POST .../bracket/generate` validates readiness first
  (`validate_teams_for_bracket` in `backend/app/bracket.py`) — rejects
  (`400`) fewer than 2 teams, or any team with no players registered —
  instead of the prior silent no-op (0 teams/1 team quietly persisted an
  empty bracket with a `201`). The frontend surfaces the validation
  message inline instead of failing silently.
- **Slice 03** ([tickets/03-live-scoring-concurrency.md](tickets/03-live-scoring-concurrency.md))
  — done. `submit_score()` does a single version-checked `UPDATE` (409 on a
  rowcount-0 conflict) and, on completion, an atomic second `UPDATE` that
  writes the winner into the next match's slot with status recomputed via a
  SQL `CASE` on that row's *current* state — so two matches completing
  concurrently into different slots of the same downstream match can't
  clobber each other. A completed match cannot be re-scored through this
  endpoint (`400`); changing a decided result goes through slice 04's
  correction endpoint instead.
  Frontend: `ScoreEntryForm` (submits with the match version, and surfaces a `409`
  with a refetch affordance) rendered per scorable match inside
  `BracketDiagram`, which now polls every 4s. Polling is wrapped in a
  circuit breaker (`frontend/src/circuitBreaker.js`) with a 5s per-request
  timeout (`frontend/src/withTimeout.js`): after 3 consecutive failures
  (error response, non-2xx, or timeout) it stops calling the backend
  entirely — showing "Connection lost" — until a 30s cooldown elapses,
  then probes again and closes once a request succeeds.
- **Frontend restructuring** (not a numbered slice — a usability pass) — done.
  Real client-side routing (`react-router-dom`): `/` (tournament list, name +
  `team_count` per row), `/tournaments/:id` (settings form for `name`,
  `advance_per_pool`, `playoff_bracket_count`, `court_count` — editable
  anytime, no stage-based lock; team list; bracket generation/scoring, moved
  here from the old flat page), `/teams/:teamId` (edit team name, roster with
  per-player remove, add player). Backing endpoints added: `GET
  /tournaments/{id}` (single), `PATCH /tournaments/{id}`, `GET /teams/{id}`
  (single), `PATCH /teams/{id}`, `DELETE /teams/{id}/players/{playerId}`.
  `GET /tournaments` (list) now returns `team_count` per row via a grouped
  count query, not N+1 requests. No team deletion yet — a team already seeded
  into a generated bracket has no cascading-reset story, same class of
  problem as slice 04's correction work. No format picker on the settings
  form either — double elimination (slice 05) and pools (slice 07) aren't
  implemented, so `format` stays a single-elim placeholder for now.
- **Usability pass 2** (not a numbered slice) — done. A nav bar under the
  title (currently just a "Home" link) with back/forward buttons on either
  end, backed by an in-app visited-page stack (`NavigationHistoryContext`) —
  distinct from raw browser history so button enabled/disabled state is
  predictable. A stacked, corner, non-interactive toast notification system
  (`NotificationContext`/`useNotify`) fires on tournament/team/player
  creation, tournament settings save, team name save, and bracket
  generation (success and failure — the failure notification now carries the
  backend's actual validation detail instead of a generic message); each
  toast auto-dismisses after 5s, newest on top with a slight offset so a
  backlog is visible as a stack. Creation forms (tournament, team, player)
  clear their input after a successful submit; edit forms (tournament
  settings, team name) don't, since there's nothing to "clear" for an
  in-place edit. `/tournaments/:id` now shows each team's player count next
  to its name (`GET /tournaments/{id}/teams` returns a computed
  `player_count` per team, same grouped-count pattern as the tournament
  list's `team_count`) and a "Show players" toggle that lazily fetches and
  renders each team's full roster inline when switched on.
- **Delete tournament** (not a numbered slice) — done. A "Delete tournament"
  button at the bottom of `/tournaments/:id` opens a confirmation modal
  (`ConfirmModal`, a reusable interactive dialog distinct from the
  auto-dismissing notification toasts); confirming calls `DELETE
  /tournaments/{id}` and redirects to the home page. The endpoint cascades:
  it also deletes the tournament's teams, their players, and any generated
  bracket matches, so nothing is left orphaned.
- **Slice 04** ([tickets/04-cascading-score-correction.md](tickets/04-cascading-score-correction.md))
  — done. `correct_score()` in `backend/app/scoring.py` re-scores a
  completed match and, if the winner changed, walks `winner_next_match_id`
  downstream: the next match gets the new winner in its slot, and every
  match on the chain has its score/winner cleared and drops back to
  `ready`/`pending`. The walk continues past each match that had been
  completed (its winner had advanced too), all the way to the final if
  needed. A score-only correction that keeps the same winner resets
  nothing. The whole cascade is one transaction and every write is
  version-checked, so a concurrent change rolls it all back with a `409`;
  a scorekeeper still holding a pre-correction version of a reset match
  also gets a `409`. Each correction is recorded in `CorrectionLog` (old/new
  score and winner, reset match ids, timestamp), which tournament deletion
  also cleans up. `preview_correction()` runs the same walk read-only for
  the confirmation UI. Frontend: completed matches in `BracketDiagram` get
  a "Correct …" button opening `CorrectionForm`; reviewing a new score
  fetches the preview and shows a `ConfirmModal` listing what will be reset
  before anything is applied.
- **Slice 05** ([tickets/05-double-elimination.md](tickets/05-double-elimination.md))
  — done. `generate_double_elimination()` in `backend/app/bracket.py` builds
  the winners bracket from `generate_single_elimination()`, then the losers
  bracket round by round: losers round 1 pairs off winners round 1's
  losers, and each later winners round's losers drop in to face the
  losers-bracket survivors one-for-one (every other drop reversed to avoid
  immediate rematches), with a consolidation round between drops. The
  losers final and winners final feed grand final 1. Each match now has a
  `bracket` (`winners`/`losers`/`grand_final`), plus the
  `loser_next_match_id`/`loser_next_slot` links. Any team count works: a
  bye never produces a loser, so a losers match nothing can feed is created
  already complete with no teams, and one with a single live side
  auto-advances its team the moment it arrives (`_place_team` in
  `backend/app/scoring.py`). Scoring drops each winners-bracket loser into
  its losers slot. If the losers champion wins grand final 1, a grand-final
  reset match (`grand_final` round 2) is created and decides the
  tournament. Correction follows both winner and loser links, re-advances
  through losers-bracket byes, and deletes the reset match whenever grand
  final 1 is reset or corrected in the winners champion's favour (creating
  it if corrected the other way). Frontend: a Single/Double format picker
  next to "Generate bracket", and `BracketDiagram` lays out labelled
  winners, losers, and grand final sections (reset match only once it
  exists), with winner-advancement lines only — loser drops aren't drawn.
- **Slice 06** ([tickets/06-manual-match-scheduling.md](tickets/06-manual-match-scheduling.md))
  — done. `Match` gains optional `scheduled_time` (venue-local wall-clock
  time, stored without a timezone so every viewer sees the same time) and
  `court` (1..the tournament's `court_count`). `PATCH /matches/{id}/schedule`
  changes only the fields sent (`null` clears one) in a single `UPDATE` of
  just those columns — it deliberately doesn't touch `version`, scores, or
  status, so a scheduling edit never makes a scorekeeper's pending
  submission hit a `409`; last save wins for the schedule itself.
  Frontend: bracket boxes gain a third line ("Court 2 · Sat 10:30"), and
  every unfinished match (including TBD-vs-TBD, to plan ahead) gets a
  `ScheduleForm` with a court picker and date/time input.
- **Slice 07** ([tickets/07-pools-and-round-robin-scheduling.md](tickets/07-pools-and-round-robin-scheduling.md))
  — done. A `Pool` table (pools may differ in size); `POST
  .../pools/auto-assign` snake-seeds teams by `seed` (pool 1..P, then
  P..1, ...), and `PATCH /teams/{id}` takes `pool_id` for manual moves.
  Courts aren't stored per pool: `pool_courts()` in `backend/app/pools.py`
  splits the tournament's `court_count` evenly at read time (remainder to
  the earliest pools, numbered across pools, e.g. 5 courts / 3 pools →
  [1,2], [3,4], [5]), so it can't go stale; a pool left without a court
  can't be scheduled (`400`). `generate_round_robin()` groups pairings
  into rounds of at most one per court with no team twice, each round
  lasting `n` slots so a pairing's `n` games are back-to-back on one
  court; filling courts comes first, then a seeded randomized greedy
  search (300 attempts, deterministic) minimizes rotation violations —
  slots beyond 2 in a row playing or idle. Many configurations can't be
  perfect (see `tests/test_round_robin.py`), and with `n ≥ 3` a pairing's
  block always runs `n` slots, accepted by design. Pool matches are
  ordinary `Match` rows (`bracket="pool"`, `pool_id`, `round` = slot,
  `court` set) scored through the existing endpoint and excluded from the
  bracket; regenerating replaces an unplayed schedule but is refused once
  anything is scored. Standings: win 3 / loss 0, ties broken by
  head-to-head among just the tied teams, then pool-wide point
  differential, then points scored. Frontend: a Pools section (add pools,
  auto-assign, per-team pool picker) with, per pool, a schedule list by
  slot (court, teams, score, idle teams split into "observing"/"resting"
  purely for display, reusing `ScoreEntryForm`) and a live standings
  table, both polling every 4s via `usePolling`. Each pool also has its
  own page, `/pools/:id` (linked as "Open <pool>"), with just that pool's
  courts, standings, and schedule — handy as a courtside display.
- **Next**: [tickets/08-pool-to-playoff-advancement.md](tickets/08-pool-to-playoff-advancement.md)
  — not started.

Both backend and frontend test suites pass inside the running containers and
standalone; verified end-to-end via `docker compose up`.

## API endpoints

| Method | Path                                | Description                        |
| ------ | ----------------------------------- | ----------------------------------- |
| POST   | `/tournaments`                      | Create a tournament                 |
| GET    | `/tournaments`                      | List tournaments, each with a computed `team_count` |
| GET    | `/tournaments/{id}`                 | Get a single tournament (404 if it doesn't exist) |
| PATCH  | `/tournaments/{id}`                 | Update `name`/`advance_per_pool`/`playoff_bracket_count`/`court_count` (partial; 404 if it doesn't exist) |
| DELETE | `/tournaments/{id}`                 | Delete a tournament and cascade-delete its teams, players, and bracket matches (404 if it doesn't exist) |
| POST   | `/tournaments/{id}/teams`           | Add a team to a tournament (404 if tournament doesn't exist) |
| GET    | `/tournaments/{id}/teams`           | List a tournament's teams, each with a computed `player_count` |
| GET    | `/teams/{id}`                       | Get a single team (404 if it doesn't exist) |
| PATCH  | `/teams/{id}`                       | Update a team's `name` and/or `pool_id` (`null` unassigns); only the fields sent change; `400` if the pool belongs to another tournament, `404` if the team doesn't exist |
| POST   | `/tournaments/{id}/pools`           | Create a pool (`name`) |
| GET    | `/tournaments/{id}/pools`           | List pools in creation order, each with its `courts` (court numbers, derived from `court_count`) |
| POST   | `/tournaments/{id}/pools/auto-assign` | Snake-seed every team into the pools by `seed`; `400` if there are no pools |
| GET    | `/pools/{id}`                       | A single pool with its `courts` (404 if it doesn't exist) |
| PATCH  | `/pools/{id}`                       | Rename a pool |
| DELETE | `/pools/{id}`                       | Delete a pool, unassigning its teams and dropping its unplayed schedule; `400` once any of its matches is scored |
| POST   | `/pools/{id}/generate-schedule`     | Generate the round-robin (`n` games per pairing, default 1); replaces an unplayed schedule; `400` if scored, fewer than 2 teams, or no court |
| GET    | `/pools/{id}/matches`               | A pool's matches in slot order |
| GET    | `/pools/{id}/standings`             | Ranked standings (`played`, `wins`, `losses`, `points`, `points_for`, `point_diff`, `rank`) |
| POST   | `/teams/{id}/players`               | Add a player to a team's roster (404 if team doesn't exist) |
| GET    | `/teams/{id}/players`               | List a team's roster                |
| DELETE | `/teams/{id}/players/{playerId}`    | Remove a player from the roster (404 if team or player doesn't exist, or the player belongs to a different team) |
| POST   | `/tournaments/{id}/bracket/generate` | Generate and persist a bracket; optional body `{"format": "single" \| "double"}` (default `single`, saved as the tournament's `format`) |
| GET    | `/tournaments/{id}/bracket`         | List a tournament's bracket matches |
| GET    | `/matches/{id}`                     | Get a single match (404 if it doesn't exist) |
| PATCH  | `/matches/{id}/score`               | Submit a score (`team1_score`, `team2_score`, `version`, `complete`); `409` on a version conflict, `400` if completion is invalid (tie, unknown team, or already complete — use `/correct` for completed matches) |
| POST   | `/matches/{id}/correct/preview`     | Dry run of a correction (`team1_score`, `team2_score`): returns `reset_matches`, the downstream matches it would reset, without writing anything; `400` if the match isn't complete or the score is tied |
| PATCH  | `/matches/{id}/correct`             | Correct a completed match (`team1_score`, `team2_score`, `version`); returns the corrected `match` and the `reset_matches`, and writes a `CorrectionLog` entry; `409` on a version conflict anywhere in the cascade, `400` if the match isn't complete or the score is tied |
| PATCH  | `/matches/{id}/schedule`            | Set a match's `court` and/or `scheduled_time` (venue-local, e.g. `2026-10-03T10:30:00`); only the fields sent change, `null` clears; doesn't change `version`; `400` if `court` isn't 1..`court_count`, `404` if the match doesn't exist |
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

The tunnel is **not** installed as a Windows service — it only runs for as
long as its terminal is open, and needs to be started manually (in its own
terminal, alongside `docker compose up`) every time the server is brought up:

```sh
cloudflared tunnel run tournament-tracker
```

### Alternative: frontend on Cloudflare Workers

The backend can't run on Cloudflare Workers (stateful FastAPI + file-based
SQLite needs a real, persistent host) and keeps running via Docker
Compose + Tunnel as above regardless. The **frontend**, being a static Vite
build, can optionally be deployed as a Workers Static Assets site instead of
served from your own machine — `frontend/wrangler.jsonc` configures this.
Set up via the Cloudflare dashboard's "Workers & Pages → Create → Import a
repository" flow with:

| Field                              | Value                                    |
| ----------------------------------- | ----------------------------------------- |
| Project name                        | `tournament-tracker` (matches `wrangler.jsonc`'s `name`) |
| Build command                       | `npm install && npm run build`            |
| Deploy command                      | `npx wrangler deploy` (default)           |
| Non-production branch deploy command | `npx wrangler versions upload` (default) |
| Path                                | `frontend` (this is a monorepo; scopes the build to that directory) |
| API token                           | Use "Create new token" — Cloudflare mints and stores a scoped token itself, nothing to generate elsewhere |
| Environment variable                | `VITE_API_BASE_URL` = the backend's public Tunnel URL (e.g. `https://tournament-api.johnchau.org`) — Vite bakes this in **at build time**, so it must be set as a build variable in the Cloudflare project, not left for runtime |

Without `VITE_API_BASE_URL` set, the deployed frontend falls back to
same-origin requests (`API_BASE_URL = ''` in `frontend/src/api.js`), which
breaks every API call since the Worker only serves static assets and has no
backend to proxy to.

## Project layout

```
backend/    FastAPI app (app/), tests/, pyproject.toml
frontend/   Vite + React app (src/), Vitest tests
tickets/    Vertical-slice implementation tickets (see PRD.md for context)
PRD.md      Full product requirements document
```

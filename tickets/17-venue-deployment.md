# 17 — Venue Deployment

## Goal

Run the app on the organizer's machine in a way that's safe to expose
through the Cloudflare Tunnel for an event day. That means production
builds, secure login cookies, and a database that can be backed up and
restored. Login itself is ticket 19.

## Scope

- `docker-compose.prod.yml`:
  - The backend runs uvicorn without `--reload`.
  - The frontend is built with `npm run build` and served as static files
    (nginx or the backend), with SPA fallback so deep links like
    `/brackets/3` load.
  - The SQLite database lives on a named volume instead of the source bind
    mount.
- Both containers restart on failure, and the backend has a healthcheck on
  `GET /health`.
- CORS allows only the configured frontend origin in production
  (`FRONTEND_ORIGIN` env var). Dev keeps today's behaviour.
- Session cookies are `Secure` in production (`COOKIE_SECURE=true`). The
  README says how to create the first user with the ticket 19 CLI inside
  the prod container.
- Backups: `scripts/backup-db` takes a consistent copy with SQLite's
  `.backup` (safe under WAL) into `backups/` with a timestamp. Restore
  steps are documented. It runs on a schedule during an event (every 15
  minutes).
- The README has a short "Running an event" section covering start, stop,
  backup, restore, and tunnel.

## Out of scope

Cloud hosting of the backend.

## Done / demoable

Start the prod stack and the tunnel. From a phone on mobile data,
deep-link to a bracket page, sign in, and score a match. Take a backup, delete a
tournament, restore, and the tournament is back.

## Test plan

- Backend: a test that CORS allows only `FRONTEND_ORIGIN` when it's set.
- Scripts: run backup and restore against a scratch database in CI-free
  local steps, and record the result in the PR.
- Manual: the demo above, recorded in the PR.

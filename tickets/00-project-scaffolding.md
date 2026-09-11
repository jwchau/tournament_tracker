# 00 — Project Scaffolding

## Goal

A running skeleton: backend and frontend containers up via Docker
Compose, talking to each other, with the test harnesses wired in. Not a
feature slice — a prerequisite for every slice after it to be
end-to-end testable.

## Scope

- FastAPI app skeleton (`backend/`): app factory, health-check endpoint
  (`GET /health`), SQLite engine with WAL + `busy_timeout` pragmas
  (PRD §2), `SQLModel.metadata.create_all` on startup.
- Vite + React skeleton (`frontend/`): default app shell, one page that
  calls `/health` and renders the result, proving the two containers can
  talk.
- `docker-compose.yml`: backend service (uvicorn, volume-mounted for
  live reload), frontend service (Vite dev server), correct networking
  between them (frontend's API base URL points at the backend service).
- pytest configured and runnable inside the backend container/against the
  backend venv. React Testing Library configured and runnable for the
  frontend.
- `.gitignore` for both stacks (venvs, `node_modules`, `*.db`, build
  output).

## Out of scope

Any actual tournament domain logic — this ticket has no `Tournament`,
`Team`, or `Match` models yet.

## Done / demoable

`docker compose up` brings up both services; visiting the frontend dev
server shows a page confirming it successfully reached the backend's
`/health` endpoint. `pytest` and the frontend test runner both execute
successfully (even with just a placeholder test each).

## Test plan (TDD)

- Backend: a test hitting `/health` and asserting 200 + expected body.
- Frontend: a component test rendering the health-check page and
  asserting it displays the "connected" state (mock the fetch).

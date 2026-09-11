# 01 — Tournament & Team Setup

## Goal

Create a tournament, add teams and their rosters, and see them listed —
the first real end-to-end vertical slice (DB → API → UI).

## Scope

- `Tournament` model: `name`, `format` defaults placeholder (not
  meaningfully used until slice 02+), lifecycle `stage` (defaults
  `draft`), `created_at`. (`advance_per_pool`, `playoff_bracket_count`,
  total court count fields exist on the model now per PRD §3 but aren't
  exercised until slices 07/08 — add them so later slices don't need a
  migration.)
- `Team` model: `tournament_id`, `name`, `seed` (nullable), `pool_id`
  (nullable — unused until slice 07).
- `Player` model: `team_id`, `name`. Roster-only (PRD §3) — no other
  fields or behavior.
- API: `POST/GET /tournaments`, `POST/GET /tournaments/{id}/teams`,
  `POST/GET /teams/{id}/players`.
- Frontend: the admin setup flow's first piece (PRD §9.1) — a page to
  create a tournament, a page to add teams and players to it, and a list
  view showing tournaments/teams/rosters.

## Out of scope

Pools, brackets, matches, scoring — none of it exists yet. `seed` is
just a stored integer with no consumer yet.

## Done / demoable

From the running frontend: create a tournament, add several teams, add
players to a team's roster, refresh and see everything persisted and
listed correctly.

## Test plan (TDD)

- Backend: pytest for each endpoint (create/list tournament, create/list
  team, create/list player), including validation (e.g. team requires a
  valid `tournament_id`).
- Frontend: component tests for the create-tournament form, add-team
  form, and roster list rendering, against a mocked API client.

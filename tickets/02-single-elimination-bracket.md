# 02 — Single-Elimination Bracket Generation & Viewing

## Goal

Generate a single-elimination bracket from a team list and view it as a
real visual diagram — no scoring yet, just correct structure and
display.

## Scope

- `Match` model (PRD §3): tournament association, `round`, `position`,
  `team1_id`/`team2_id` (nullable), `status`, `winner_id`,
  `winner_next_match_id`/`winner_next_slot` (loser fields exist on the
  model but are unused until slice 05), `version` (unused until slice 03
  but present so no migration later).
- Bracket generation service (pure function, no DB): `_seed_order`
  (standard 1-vs-N seeding) and `generate_single_elimination`, per PRD
  §6.1 — any team count ≥ 2, byes padded and pre-completed with the
  present team as winner, keyed by `(bracket, round, position)` so the
  persistence layer can resolve `winner_next_match_id` via a lookup map
  after inserting rows.
- API: `POST /tournaments/{id}/bracket/generate` (single-elim only in
  this slice) persists the generated `Match` rows; `GET
  /tournaments/{id}/bracket` returns them structured for rendering.
- Frontend: the visual bracket diagram (PRD §9.4) — SVG, connecting
  lines from each match to where its winner advances, laid out by round.
  Byes render as pre-completed matches.

## Out of scope

Scoring (matches display their generated/bye state only), double
elimination, pools, courts/scheduling fields.

## Done / demoable

Create a tournament with an arbitrary number of teams (including a
non-power-of-two count), generate a bracket, and see it rendered
correctly as a diagram — byes shown as auto-completed, real matches
shown as pending, correct advancement lines.

## Test plan (TDD)

- Backend: unit tests for `_seed_order` and
  `generate_single_elimination` directly (no DB) covering: exact
  power-of-two counts (4, 8), non-power-of-two counts requiring byes (3,
  5, 6), and verifying `winner_next` keys point to the correct
  `(round, position, slot)`. Integration test for the generate+persist
  endpoint verifying `winner_next_match_id` gets resolved correctly
  against real row IDs.
- Frontend: component test asserting the diagram renders the correct
  number of rounds/matches and connecting lines for a known bracket
  fixture (e.g. an 8-team and a 5-team bracket).

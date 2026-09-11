# 07 — Pools & Round-Robin Scheduling

## Goal

Full pool-play stage: pool creation/assignment, round-robin match
generation with courts and the rotation constraint, pool standings, and
scoring pool matches (reusing slice 03's scoring engine).

## Scope

- `Pool` model (PRD §3): `tournament_id`, name, allotted courts.
- Auto-assignment: snake seeding by `Team.seed` across pools (PRD §4.1),
  with manual override (editable `Team.pool_id`). Pools may be different
  sizes.
- Court distribution (PRD §4.3): total tournament courts split evenly
  across pools, remainder to earlier pools in creation order, minimum 1
  per pool.
- Round-robin generation service (PRD §4.2/§4.4): configurable `n` per
  pairing, matches for a pairing scheduled back-to-back, pairing order +
  observing/resting assignment solved to best-effort satisfy the
  ≤2-consecutive-same-state rule (playing vs. idle; observing/resting is
  a cosmetic even split of idle teams with no scheduling effect). Handle
  odd team counts (a team sits out a round) as a mechanical necessity.
  Accept the structural `n ≥ 3` violation as expected, not a bug.
- Pool standings (PRD §4.5): win=3/loss=0/no draws; tiebreakers
  head-to-head → point differential → points scored. Computed from
  `Match` rows (reusing the shared model), live via polling.
- API: pool CRUD, `POST /tournaments/{id}/pools/auto-assign`,
  `POST /pools/{id}/generate-schedule`, `GET /pools/{id}/standings`.
- Frontend: pool schedule + standings view (PRD §9.2) — per-pool match
  list with court/time, live-updating standings table. Pool matches use
  the existing score entry view/service from slice 03 unchanged.

## Out of scope

The pool→playoff transition itself (slice 08) — this slice ends with
completed, correctly-scored pools and standings, nothing generated
beyond that yet.

## Done / demoable

Create a tournament with several pools of varying size, auto-assign
teams, generate each pool's round-robin schedule with courts, play
matches to completion through the UI, and watch standings update
correctly with tiebreakers resolving as expected. Manually re-verify at
least one schedule by hand against the rotation constraint.

## Test plan (TDD)

- Backend: snake-seeding assignment test across pools of different
  sizes. Round-robin generation tests: correct total match count for a
  given `n` and team count, matches for each pairing are contiguous
  (back-to-back) in the generated order, odd-team-count byes rotate
  correctly, and a scoring test on the ≤2-consecutive constraint across
  varied team/court/`n` combinations (including one deliberately using
  `n ≥ 3` to confirm the accepted violation is exactly the expected size
  and nothing worse). Standings tests: point totals, and each tiebreaker
  level in isolation (equal records broken by head-to-head, then by
  differential, then by points scored).
- Frontend: component tests for the schedule list and standings table
  rendering against known fixtures.

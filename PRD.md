# Tournament Tracker — Product Requirements Document

## 1. Overview

A self-hosted tournament management tool covering the full lifecycle of a
bracket-and-pool tournament: team registration, pool play (round-robin) with
auto-scheduling, advancement into tiered elimination playoff brackets
(single or double elimination), live score entry with concurrency-safe
writes, and cascading score correction.

Scope is a personal/local tool: **no authentication**, single trusted
organizer, run via Docker Compose on a local machine or LAN at a venue.

## 2. Stack

- **Backend**: Python, FastAPI, SQLModel/SQLAlchemy, SQLite (WAL mode,
  `busy_timeout` set) as the database.
- **Frontend**: React + Vite.
- **Dev/run environment**: Docker Compose (backend container, frontend
  container).
- **Testing**: strict TDD (red-green-refactor). Backend: pytest. Frontend:
  React Testing Library for components; end-to-end/Playwright is
  explicitly out of scope for v1.

## 3. Core Entities

- **Tournament** — name, format defaults, `advance_per_pool`,
  `playoff_bracket_count`, total court count, lifecycle stage
  (`draft` → `pool_play` → `playoffs` → `complete`).
- **Pool** — belongs to a Tournament; holds a subset of Teams; has its own
  allotted courts (see §6).
- **Team** — belongs to a Tournament, optionally assigned to a Pool; has a
  `seed` (used for both single/double-elim seeding and pool
  auto-assignment).
- **Player** — belongs to a Team. Roster-only: `name` + `team_id`. No
  player-level stats or match participation tracking.
- **PlayoffBracket** — belongs to a Tournament; one per tier
  (1..`playoff_bracket_count`); has a format (single or double
  elimination — **all tiers in a tournament share the same format**) and
  its own allotted courts (see §8).
- **Match** — the shared model for both pool-stage and playoff-stage
  games. Fields include: tournament/pool/bracket association, round,
  position, `team1_id`/`team2_id` (nullable until known), scores, status
  (`pending`/`ready`/`in_progress`/`complete`), `winner_id`, links to the
  next match a winner/loser advances to (`winner_next_match_id` +
  `winner_next_slot`, `loser_next_match_id` + `loser_next_slot`), optional
  manual `scheduled_time`/`court` fields, and a `version` column backing
  optimistic concurrency (see §7).
- **CorrectionLog** — records cascading score corrections: which match was
  corrected, old vs. new score/winner, timestamp, and which downstream
  matches were reset as a result.

## 4. Pool Stage

### 4.1 Pool assignment

- Multiple pools per tournament. Auto-assigned via **snake seeding** using
  each team's `seed`: pool 1 gets seed 1, pool 2 seed 2, ..., last pool
  gets seed N, then direction reverses (last pool gets seed N+1, ...,
  pool 1 gets seed 2N), and so on.
- Auto-assignment is a starting point; organizer can hand-edit any team's
  pool assignment afterward (it's just a field on Team).
- Pools are **not required to be the same size.**

### 4.2 Round-robin generation

- Configurable **`n`**: number of times every pair of teams within a pool
  plays each other.
- All `n` matches for a given pairing are scheduled **back-to-back**
  (consecutively) before the schedule moves to the next pairing — not the
  standard interleaved round-robin pattern.
- Pairing order and per-slot observing/resting assignment are solved by
  the scheduling algorithm to satisfy the rotation constraint (§4.4)
  best-effort — not a fixed manual pattern.

### 4.3 Courts

- Tournament creation sets a total court count. Total courts are
  distributed **automatically, evenly** across pools; when it doesn't
  divide evenly, extra courts go to pools in creation order (pool 1, then
  pool 2, ...) until exhausted. Every pool gets **at least 1** court.
- A pool with `c` courts has `2c` teams playing simultaneously per slot
  (one match per court).

### 4.4 Rotation constraint

- Model: **two states** — playing or idle. (Originally framed as three
  states — playing/observing/resting — but observing vs. resting is
  **purely a cosmetic display label** with no scheduling effect: idle
  teams in a slot are split as evenly as possible between "observing" and
  "resting" for display purposes only.)
- Constraint: no team stays in the same state (playing or idle) for more
  than 2 consecutive slots.
- "Consecutive" is counted in **pool-local slot sequence** (each pool
  schedules independently on its own courts, not a shared tournament-wide
  time grid). A "slot" = one round where up to `c` matches run
  simultaneously for that pool; simultaneous matches in the same slot
  count as one slot, not `c` separate turns.
- **Known structural conflict, accepted by design**: when `n ≥ 3`, the two
  teams in a pairing are unavoidably "playing" for all `n` consecutive
  slots of that pairing's block (no amount of parallel courts can give
  them a break mid-block, since status is per-slot not per-court). This
  is expected and accepted, not a bug.
- Because a perfectly constraint-satisfying schedule isn't always
  achievable, the algorithm is **best-effort**: minimize violations where
  a perfect schedule isn't possible (including the guaranteed `n ≥ 3`
  violation above), rather than rejecting the configuration.

### 4.5 Pool standings

- Points: **win = 3, loss = 0. No draws** — a completed match always has a
  winner (consistent with the scoring service's "no ties on completion"
  rule).
- Tiebreakers, in order: **(1) head-to-head result** (if the tied teams
  played each other), **(2) point differential** (sum of
  `team1_score - team2_score` across the pool), **(3) points scored**
  (total offense). Fully automatic, no manual override for v1.

## 5. Pool → Playoff Transition

- **Manual only**, organizer-triggered. Nothing auto-generates playoff
  brackets; pool standings are simply "current" until the organizer
  explicitly advances the tournament. If any pool match is incomplete,
  the transition fails.
- Organizer configures, at tournament creation: **`advance_per_pool`
  (k)** and **`playoff_bracket_count`**.
- Tiering rule: for each pool, ranks `1..k` → Playoff Bracket 1, ranks
  `k+1..2k` → Playoff Bracket 2, ..., through Bracket
  `(playoff_bracket_count - 1)`, each getting exactly `k` teams from every
  pool that has that many entrants. **The last playoff bracket
  (`playoff_bracket_count`) is a catch-all**: it receives every remaining
  team from every pool, however many that is. This is what allows pools of
  different sizes to coexist — only the last bracket's size varies with
  pool-size differences.
- **Cross-pool seeding within a tier**: teams landing in the same tier
  bracket from different pools (e.g., every pool's rank-1 finisher, all
  going to Bracket 1) are ranked against each other using the same
  points/differential/points-scored ranking used for in-pool tiebreakers,
  producing one ordered seed list per tier bracket. That seed list feeds
  the standard bracket-seeding algorithm (§6.1).
- Once generated, this transition does **not** get retroactively redone —
  see §7.4 (cascading correction is scoped within a bracket, not across
  the pool→playoff boundary).

## 6. Playoff Brackets

- All tiers in a tournament share the same format: **all single
  elimination, or all double elimination** — organizer's choice at
  creation time.

### 6.1 Single elimination

- Supports **any team count ≥ 2**. Non-power-of-two counts are padded with
  byes: highest seeds get a free pass in round 1 (a match row is still
  created, pre-completed with the present team as winner, so the bracket
  structure stays uniform).
- Standard bracket seeding order (1 vs. N, 2 vs. N-1, ...) so top seeds
  can only meet in later rounds.

### 6.2 Double elimination

- Supports **any team count**, including non-power-of-two — this required
  building **bye-aware losers-bracket wiring** (byes can cascade through
  multiple losers-bracket rounds without producing a "loser" to drop
  down). This is necessarily more complex than the power-of-two-only
  version originally considered, because pool-advancement catch-all
  buckets routinely produce non-power-of-two tier sizes.
- Includes a real **grand-finals bracket reset**: if the losers-bracket
  finalist beats the winners-bracket finalist in the first grand-finals
  match, the winners-bracket finalist has only lost once — a second,
  dynamically-created grand-finals match decides the tournament.

### 6.3 Playoff court scheduling

- Each playoff bracket gets **its own dedicated courts** (same
  even-split/remainder distribution rule as pools, §4.3), not a shared
  pool across all brackets.
- Courts are **auto-dispatched, FIFO**: the moment a match becomes READY
  (both teams known) and a court in its bracket's allotment is free, it's
  automatically assigned to that court — no manual court entry required
  (though manual override remains available as an escape hatch).

## 7. Live Scoring & Concurrency

### 7.1 Submission model

- Absolute score submissions (not increments): a scorekeeper submits the
  full current score for a match. This assumes redundant/independent
  scorekeepers occasionally racing to submit for the same match — not
  collaborative point-by-point tallying.

### 7.2 Optimistic concurrency

- Every `Match` has a `version` column. A score submission includes the
  `version` it last read. The write is a single
  `UPDATE ... WHERE id = :id AND version = :expected_version` statement.
- Exactly one concurrent writer's WHERE clause matches; others affect zero
  rows and receive a **409 conflict**, telling them to re-fetch and retry.
  There is no read-modify-write window where a second writer can silently
  clobber the first.
- Marking a match complete requires both teams known and a non-tied
  score; it sets `winner_id` and status in the same version-checked
  statement.

### 7.3 Bracket advancement

- On completion, the winner (and, in double elim, the loser) is written
  into the next match's slot via a single atomic `UPDATE` that only
  touches that one slot column, with READY/PENDING status recomputed in
  SQL from the row's *current* state (a `CASE` on the other slot column)
  — so two matches completing at once, each populating a different slot
  of the same downstream match, cannot stomp on each other.

### 7.4 Cascading score correction

- Any **completed** match can be corrected **at any time** (not just
  before downstream matches start).
- Correcting a match's score/winner **resets every downstream match that
  already consumed its (now-wrong) winner/loser**: those matches' own
  scores and winners are cleared and they revert to an unplayed state —
  a match cannot keep a score recorded against a team that's no longer
  supposed to occupy that slot.
- This reset is **recursive/unbounded**: if a reset downstream match had
  itself been completed and already advanced someone further, that
  further match resets too, however deep the chain goes (potentially all
  the way through an already-decided grand finals).
- The entire cascade for one correction is a **single atomic
  transaction**, using the same version-checked update pattern throughout
  so a concurrent legitimate score submission to a match mid-cascade is
  detected rather than silently overwritten.
- **Scope boundary**: cascading correction operates **within one bracket
  structure only**. Correcting a pool-stage match after playoffs have
  already been generated updates pool standings/history but does **not**
  retroactively regenerate or re-seed the already-generated playoff
  bracket — the pool→playoff transition remains one-way manual (§5).
- Every correction (and the set of matches it reset) is recorded in
  `CorrectionLog`.

### 7.5 Live updates

- Frontend **polls** for match/bracket/standings updates (short interval,
  e.g. 3–5s). No WebSocket/SSE push for v1 — polling composes simply with
  the optimistic-locking model (poll picks up the latest version; no
  separate broadcast path to keep in sync with the DB as source of
  truth).

## 8. Match Scheduling Fields

- `Match` has optional `scheduled_time` and `court` fields.
- Pool-stage matches: populated by the round-robin auto-scheduler (§4).
- Playoff-stage matches: populated by the auto-dispatch queue (§6.3), with
  manual override available.

## 9. Frontend

Four views, all required for v1:

1. **Tournament/admin setup flow** — create tournament; add teams/players;
   configure pools (review/edit auto-assignment); set courts, `n`,
   `advance_per_pool`, `playoff_bracket_count`, and format; trigger the
   manual pool→playoff transition.
2. **Pool schedule + standings view** — per-pool match list (with
   court/time), live-updating (polling) standings table (record, points,
   tiebreak columns).
3. **Score entry view** — scorekeeper-facing form to submit a match score;
   shows the current version; clearly surfaces a 409 conflict with a
   re-fetch/retry affordance.
4. **Bracket viewer** — a real **visual bracket diagram** (SVG, connecting
   lines between matches) for playoff brackets, covering
   winners/losers/grand-finals, live-updating via polling. Not a
   simplified list-by-round view.

## 10. Explicitly Out of Scope (v1)

- Authentication/authorization of any kind.
- Real-time push (WebSocket/SSE) — polling only.
- Player-level stats or match participation tracking.
- Cross-stage cascading correction (pool corrections regenerating already
  -built playoff brackets).
- End-to-end/Playwright browser testing.
- Any auto-scheduling constraint solver beyond the best-effort rotation
  heuristic described in §4.4.

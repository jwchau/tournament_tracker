# 03 — Live Scoring with Optimistic Concurrency (Single Elimination)

## Goal

The core hard problem, isolated as its own slice: submit a score for a
match, safely under concurrent submissions, with the winner
automatically advancing through the single-elim bracket built in slice
02.

## Scope

- Scoring service (PRD §7.1–7.3): `submit_score(match_id, team1_score,
  team2_score, expected_version, complete)` as a single version-checked
  `UPDATE`; rowcount 0 → `VersionConflict`. Completing a match requires
  both teams known and a non-tied score.
- Bracket advancement: on completion, atomically write the winner into
  `winner_next_match_id`'s `winner_next_slot`, recomputing READY/PENDING
  from the row's current state via SQL `CASE` (PRD §7.3) — not a
  read-modify-write.
- API: `PATCH /matches/{id}/score` taking `{team1_score, team2_score,
  version, complete}`; returns 200 with the updated match, or 409 with
  the conflict signaled clearly (so the client knows to re-fetch).
- Frontend: the score entry view (PRD §9.3) — shows current version,
  submits, and on 409 clearly surfaces the conflict with a
  re-fetch/retry affordance. The bracket diagram from slice 02 now polls
  (PRD §7.5) and reflects live status/advancement.

## Out of scope

Score correction/cascading reset (slice 04), double elimination (slice
05), pools (slice 07).

## Done / demoable

Score a match to completion through the UI and watch the winner appear
in the next round's slot on the bracket diagram (via polling). Fire two
concurrent score submissions at the same match (e.g. a small script or a
concurrency test) and confirm exactly one succeeds, the other gets a
clean 409, and the match's `version` incremented exactly once.

## Test plan (TDD)

- Backend: the headline test — spin up N concurrent threads/requests
  submitting scores for the same match with the same starting version;
  assert exactly one 200, the rest 409, and the final row's version is
  `initial + 1` (no lost updates, no double-increment). Additional tests:
  completing a match with both slots known advances the winner
  correctly; completing with a tied score is rejected; completing before
  both teams are known is rejected; two matches completing concurrently
  and each populating a different slot of the *same* downstream match
  don't clobber each other's slot/status.
- Frontend: component test for the score entry form's 409 handling
  (mock a 409 response, assert the retry affordance appears).

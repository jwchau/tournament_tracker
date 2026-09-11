# 04 — Cascading Score Correction (Single Elimination)

## Goal

Allow correcting a completed match's score at any time, with the
correction cascading through every downstream match that already
consumed the (now-wrong) result.

## Scope

- `CorrectionLog` model (PRD §3): corrected match id, old/new
  score+winner, timestamp, list of matches reset as a result.
- Correction service (PRD §7.4): given a completed match and a new
  score/winner, within a **single atomic transaction**:
  1. Find every downstream match already populated from this match's old
     winner (and, once slice 05 adds double elim, old loser).
  2. For each, if it was itself completed and had already advanced
     someone further, recurse — unbounded depth.
  3. Reset each affected downstream match: clear score, winner, and
     status back to an unplayed state; overwrite its slot with the
     correct team from upstream (or clear it if upstream is no longer
     resolved).
  4. Apply the correction to the original match.
  5. Write a `CorrectionLog` entry recording everything touched.
  6. Version-check throughout so a concurrent legitimate score
     submission mid-cascade is detected, not silently overwritten.
- API: `PATCH /matches/{id}/correct` (or similar) taking the corrected
  score; returns the full set of matches that were reset.
- Frontend: a "correct this match" action on already-completed matches
  in the score entry view, with a clear confirmation showing what will
  be reset before committing.

## Out of scope

Cross-stage cascade (pool corrections regenerating playoff brackets —
explicitly out of scope per PRD §7.4/§10). Double-elim-specific
loser-side cascading (slice 05, since double elim doesn't exist yet).

## Done / demoable

Play out a bracket several rounds deep, then correct an early-round
match's winner. Confirm every downstream match that had already been
played gets reset (score cleared, teams updated to reflect the
correction), confirm it cascades all the way to the final if the final
had already been played, and confirm the correction and every reset
match appears in the `CorrectionLog`.

## Test plan (TDD)

- Backend: unit/integration tests building a fully-played small bracket
  (e.g. 4 teams, both rounds complete), then correcting round 1 and
  asserting: round 2's match is reset (teams updated, score/winner
  cleared), the correction is logged with the right set of affected
  matches. A deeper case (8 teams, fully played including the final)
  correcting round 1 and asserting the cascade reaches the final. A
  concurrency case: a score submission to a downstream match arrives
  mid-cascade and is handled correctly (detected via version, not lost).
- Frontend: component test for the correction confirmation UI showing
  the correct "this will reset N matches" preview.

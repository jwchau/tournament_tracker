# 15 — Tournament Lifecycle and Results

## Goal

Make the tournament's `stage` follow what actually happens
(`draft` → `pool_play` → `playoffs` → `complete`). Today it only ever
reaches `draft` or `playoffs`. Show who won once it's over.

## Scope

### Backend

- The stage becomes `pool_play` when the first pool schedule is generated.
  It goes back to `draft` if every pool schedule is cleared (auto-assign or
  pool delete while nothing is scored).
- The stage becomes `complete` when every playoff tier has a champion. That
  includes the grand-final reset in double elimination.
- A correction that un-decides a champion moves the stage back to
  `playoffs`.
- Resetting brackets (existing `DELETE /tournaments/{id}/playoff-brackets`)
  goes back to `pool_play` if there are pools, or `draft` if there aren't.
- `GET /tournaments/{id}/results` returns each tier's final placings:
  champion, runner-up, and the rest grouped by the round they went out in.
  It returns `400` until the stage is `complete`.

### Frontend

- The tournament list shows each tournament's stage.
- The tournament page shows the stage near the title.
- Once complete, a Results section at the top of the tournament page lists
  each tier's champion and runner-up. It links to the full placings on each
  bracket page.

## Out of scope

Awards, a printable results sheet, and a manual "close tournament" button.

## Done / demoable

Play a pooled tournament to the end. Watch the stage move from draft to
pool play, then playoffs, then complete. Correct the final and see it drop
back to playoffs, then return to complete when the final is re-decided.

## Test plan (TDD)

- Backend:
  - Each transition above, including going backwards on reset and
    correction.
  - The double-elimination reset match decides completion, not grand
    final 1.
  - Results placings for single and double elimination with byes.
  - Extend one stress scenario to assert `complete` at the end.
- Frontend:
  - Stage labels on the list and the tournament page.
  - The Results section appears only when complete, with each tier's
    champion and runner-up.

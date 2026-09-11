# 06 — Manual Match Scheduling Fields

## Goal

Let the organizer assign a court and time to any bracket match by hand.

## Scope

- `Match.scheduled_time` / `Match.court` fields (PRD §8) — already on
  the model from earlier slices if added then; if not, add now.
- API: endpoint to set/update a match's `scheduled_time`/`court`.
- Frontend: editable court/time fields on a match in the bracket
  viewer/score entry views.

## Out of scope

Any auto-scheduling logic — that's pool round-robin scheduling (slice
07) and playoff auto-dispatch (slice 09), both of which are distinct
algorithms from this manual escape hatch.

## Done / demoable

From the UI, assign a court and time to a playoff match, see it persist
and display correctly.

## Test plan (TDD)

- Backend: test setting/updating `scheduled_time`/`court` on a match.
- Frontend: component test for editing and saving these fields.

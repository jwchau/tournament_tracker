# 14 — Team Check-in Edits

## Goal

Let the organizer handle check-in changes: remove a team that didn't show
up, and fix a team's seed before pools are drawn.

## Scope

### Backend

- `DELETE /teams/{id}` deletes the team and its players. It's refused
  (`400`) once the team is in a pool that has a generated schedule, or once
  playoff brackets exist.
- `PATCH /teams/{id}` also accepts `seed` (ge=1). Changing it is refused
  once the tournament's settings are locked (play has started).
- Team list responses stay ordered by seed.

### Frontend

- The team page gets a "Delete team" button behind a `ConfirmModal`. After
  deleting, it goes back to the tournament page.
- The team page lets the organizer edit the seed next to the name.
- The backend's refusal reason is shown as an error notification.

## Out of scope

Withdrawing a team mid-tournament (forfeiting its remaining matches).

## Done / demoable

Add six teams, delete one and re-seed another, then auto-assign pools. The
pools reflect the new seeds and the deleted team is gone.

## Test plan (TDD)

- Backend:
  - Deleting a team removes it and its players.
  - Delete is refused once its pool has a schedule, or once brackets exist.
  - Seed changes are saved, and refused once settings are locked.
- Frontend:
  - Deleting asks for confirmation, calls the API, and navigates back.
  - Editing the seed saves it; a refusal shows the backend's reason.

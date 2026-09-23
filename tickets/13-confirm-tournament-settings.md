# 13 — Confirm Tournament Settings

## Goal

Make the organizer confirm a tournament's settings once before building
it: no teams, pools, or brackets until the settings are confirmed.
Settings stay editable until play starts, then lock.

## Scope

### Backend

- `Tournament.settings_confirmed` (bool, default false). Existing
  tournaments start unconfirmed.
- `POST /tournaments/{id}/confirm-settings` sets it. It's one-way: there's
  no un-confirming.
- Until confirmed, these are refused (`400`, "confirm the tournament
  settings first"): adding a team, adding a pool, auto-assigning pools,
  generating a bracket, and advancing to playoffs. Playoff readiness
  reports the same reason.
- Settings lock once play starts. After any pool or playoff match has a
  score, `PATCH /tournaments/{id}` refuses (`400`) changes to
  `advance_per_pool`, `playoff_bracket_count`, `court_count`,
  `games_per_pairing`, and `target_pool_size`. The name stays editable.
- Tournament responses include `settings_locked` (whether play has
  started), so the UI knows.

### Frontend

- While unconfirmed, the Settings form's button reads "Save and confirm
  settings". It opens a `ConfirmModal` listing the values; confirming
  saves them and confirms the tournament.
- While unconfirmed, the Teams, Pools, and Playoffs sections show "Confirm
  the tournament settings to add teams, pools, and brackets." instead of
  their controls.
- Once confirmed, the button reads "Save" as today.
- Once play starts, the settings fields other than the name are disabled,
  with a note that settings lock once play has started.

## Out of scope

Unlocking settings after play has started.

## Done / demoable

A new tournament shows only its settings. Confirming them unlocks teams,
pools, and brackets. After the first score, only the name can still be
changed.

## Test plan (TDD)

- Backend:
  - Each gated action is refused before confirming and allowed after.
  - Readiness reports the missing confirmation.
  - Confirming is one-way.
  - Setting changes are refused once a pool match or a playoff match is
    scored; the name is still accepted.
  - `settings_locked` is reported.
- Frontend:
  - Unconfirmed: the sections are hidden, and confirming shows the dialog
    with the values, then calls save and confirm.
  - Confirmed: the sections appear and the button reads "Save".
  - Locked: the fields are disabled apart from the name.

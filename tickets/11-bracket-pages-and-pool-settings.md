# 11 — Bracket Pages & Pool Settings

## Goal

One kind of bracket, generated once, with its own page; cleaner match
controls; tournament-level settings for games per pool pairing and target
pool size. Playoff best-of series are ticket 12.

## Background

"Single elimination still generates a double elimination bracket" isn't in
the generator. `POST .../bracket/generate` never deletes a previous bracket,
and `GET /tournaments/{id}/bracket` returns every non-pool match, including
ticket 08's playoff tiers. `BracketDiagram` switches to the double layout as
soon as any losers match is present, so a leftover double bracket or a
double-elimination tier makes a new single bracket render as double.

## Scope

Suggested order: A, B, C, D, E.

### A. One bracket model, generated once (fixes the bug; items 1 and 3)

- A1. "Generate bracket" creates a tier-1 `PlayoffBracket` holding every
  team, seeded by `Team.seed`, through the same path as advancing.
  Refused (`400`) when the tournament has pools; use advance-to-playoffs
  then.
- A2. Generating shares advancing's once-only guard (the conditional stage
  claim from ticket 08), so a second generate/advance, even a simultaneous
  one, gets a `400`.
- A3. Remove `GET /tournaments/{id}/bracket`; everything reads through
  `/tournaments/{id}/playoff-brackets` and `/playoff-brackets/{id}/matches`.
- A4. One-time startup cleanup: delete non-pool matches with no
  `playoff_bracket_id` (old-style brackets, including duplicates) and
  their `CorrectionLog` rows.
- A5. Reset: `DELETE /tournaments/{id}/playoff-brackets` removes every
  bracket, match, and correction log and returns the tournament to its
  pre-playoff stage, but only while no playoff match has a score (`400`
  after that). Frontend: "Reset brackets" button with a `ConfirmModal`,
  shown only while resetting is allowed.
- A6. Tournament page: a single Playoffs section. With no pools it offers
  format + "Generate bracket"; once any pool exists it offers format +
  "Advance to playoffs" instead. The separate "Bracket" section is removed.

### B. Bracket page (item 2)

- B1. `GET /playoff-brackets/{id}` returns one bracket (404 if missing).
- B2. New route `/brackets/:id`: "Back to tournament" link, the tier's
  diagram, and all its controls (score, schedule, correction).
- B3. Tournament page shows each tier's diagram read-only (no forms or
  buttons) with an "Open Bracket N" link, same pattern as "Open Pool A".

### C. Match controls (items 4, 5, 6)

- C1. Score and schedule forms only for matches with both teams set that
  aren't complete. No forms for TBD slots, half-filled matches
  ("Aces vs TBD"), byes, or completed matches. This reverses slice 06's
  plan-ahead scheduling of TBD matches.
- C2. A "Correct" button only on completed matches that were actually
  played (not byes or dead losers-bracket slots).
- C3. That button sits directly under its match's box in the diagram and
  opens the existing `CorrectionForm` in a modal, followed by the existing
  reset-confirmation modal. The separate list of "Correct …" buttons goes
  away.

### D. Games per pairing as a tournament setting (item 7)

- D1. `Tournament.games_per_pairing` (integer ≥ 1, default 1), editable in
  the Settings form.
- D2. `POST /pools/{id}/generate-schedule` uses it; the request's `n` and
  the pool page's "Games per pairing (n)" input are removed. A changed
  value applies the next time a pool's schedule is generated; existing
  schedules are untouched, and regenerating is still refused once scored.

### E. Balanced pools from a target size (item 9)

- E1. `Tournament.target_pool_size` (integer ≥ 2, default 4), editable in
  the Settings form.
- E2. Auto-assign picks the pool count whose average size is closest to
  the target (ties go to more, smaller pools), limited to 1..court count
  so every pool can be scheduled. It creates any missing pools ("Pool A",
  "Pool B", …), deletes the most recently created extra pools (and their
  unplayed schedules), then snake-seeds as today. Refused (`400`) once
  any pool match is scored.

## Out of scope

Playoff best-of series (ticket 12); playoff court auto-dispatch (ticket 09).

## Done / demoable

- A tournament without pools generates one single-elimination bracket that
  renders as single, can't generate again, and can be reset until its
  first score.
- A pooled tournament advances; the tournament page shows read-only tier
  diagrams linking to `/brackets/:id`, where only playable matches have
  forms and each completed match has its own "Correct" button.
- Auto-assigning 13 teams with target size 4 creates 3 pools of 5/4/4.

## Test plan (TDD)

- Backend:
  - Generating twice, or generating and advancing, gives `400`.
  - The cleanup removes old tierless rows.
  - Reset is allowed while unscored and refused once scored.
  - Generating is refused when pools exist.
  - `games_per_pairing` drives schedule length.
  - Pool count choice for several team/target/court combinations; the
    auto-assign refusal once scored.
- Frontend:
  - The Playoffs section switches between Generate and Advance.
  - Read-only tier diagrams link to `/brackets/:id`.
  - The bracket page shows forms only for both-teams-known unfinished
    matches, and a "Correct" button only under completed played matches,
    opening the modal.
  - The new Settings fields; the per-pool n input is gone.

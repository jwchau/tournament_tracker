# 25 — Refs on the Court View and Courts List

Post-v1. From feedback after the Kiln overhaul. Needs ticket 23; bracket
matches show their refs once ticket 24 lands.

## Goal

The scorekeeper at a court, and anyone checking the courts, can see who is
reffing each match.

## Scope

- **Court view:** the ink strip shows "Ref: Aces" (or "Ref: N/A") for the
  match being played, and each Up next row shows its ref.
- **Courts list:** each busy court's tile adds a small "Ref: Aces" line under
  the teams.
- Refs are display-only here; changing a ref happens on the pool schedule
  (ticket 23) or the bracket match panel (ticket 24).
- The tournament page shows no refs; it stays a scoreboard.

## Done / demoable

Open a court during pool play: the strip names the ref for the current
match, and Up next lists each upcoming match's ref. The courts list shows
each busy court's ref.

## Test plan

- The court view shows the current match's ref and each Up next row's ref,
  including N/A.
- A courts-list tile shows its current match's ref; a free court shows none.
- A ref changed elsewhere appears after the next poll.

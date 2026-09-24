# 18 — Dress Rehearsal and v1.0.0

## Goal

Play a realistic mock event on the production setup before a real one.
Fix what breaks, then tag v1.0.0.

## Scope

### Rehearsal script (`docs/rehearsal.md`)

1. Create a tournament: 4 courts, target pool size 4, advance per pool 2,
   2 playoff brackets, games per pairing 1, playoff best-of 3, double
   elimination.
2. Add 14 teams with seeds, then delete one and re-seed another (ticket 14).
3. Auto-assign pools and generate schedules.
4. Two phones sign in as scorekeepers (ticket 19). A third, signed out,
   follows along read-only. The two signed-in phones score pool play at
   the same time from the court view (ticket 16), including one
   deliberate simultaneous submit (expect a 409 and a refetch).
5. Correct one pool score after its pool finishes.
6. Advance to playoffs. Confirm courts dispatch without manual entry
   (ticket 09).
7. Play both tiers to the end, with at least one grand-final reset and
   one playoff correction that cascades.
8. Take a backup mid-playoffs. At the end, restore it on a second machine
   or a scratch volume, and check it.
9. Check the results (ticket 15).

### Fixes

- Every bug found gets a failing test first, then the fix, in this
  ticket's branch or a follow-up ticket if it's large.
- Small items that are likely to come up:
  - a not-found page for unknown routes and missing ids;
  - a top-level error boundary with a reload button;
  - notifications for any request that fails silently.

### Release

- README status is updated, and the plan's release criteria are ticked.
- `CHANGELOG.md` gets a v1.0.0 entry summarising tickets 00–19.
- Tag `v1.0.0` on main and create a GitHub release with the changelog
  entry.

## Out of scope

New features found missing during rehearsal. They go in new post-v1
tickets unless they block the script.

## Done / demoable

The rehearsal script completes on the production stack with no manual
database edits, and `v1.0.0` is tagged.

## Test plan

- Regression tests for every bug fixed (TDD).
- Full backend, stress, and frontend suites plus lint pass on the tagged
  commit.

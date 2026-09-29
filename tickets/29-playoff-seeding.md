# 29 — Confirm or Change the Playoff Seeding

Post-v1. From the organizer: the standings decide who goes into each bracket
and in what order, but they sometimes need to break a tie by hand or honor a
ruling before the brackets are built.

## Goal

**Advance to playoffs** (and **Generate bracket**, for a tournament without
pools) no longer builds the brackets straight away. It opens a dialog showing
each bracket's seed order, which the organizer confirms as is, cancels, or
changes.

## Scope

- **The dialog** ("Confirm playoff seeding"): the playoff format
  (moved here from the panel), then each bracket's teams in seed order with
  their pool finish ("Pool A · 1st"). Each team has move up and move down
  buttons; the first can't go up, the last can't go down. **Reset to
  standings order** appears once anything has moved. **Cancel** and Escape
  close it and build nothing.
- **Only the order within a bracket changes.** Which bracket a team lands in
  stays as the standings decide.
- `GET /tournaments/{id}/playoff-seeding` returns `{ ready, reason, tiers }`,
  each tier a list of `{ team_id, name, pool, pool_rank }` in seed order, for
  both a tournament with pools and one without (teams by seed). When it isn't
  ready, `reason` says why, as `playoff-readiness` does.
- `POST /advance-to-playoffs` and `POST /bracket/generate` take an optional
  `seeding`: team ids per bracket in seed order. It must hold exactly the
  teams the standings planned for each bracket, or the request is refused (400)
  and nothing is created. Left out, the standings order is used, as before.
- The dialog only sends `seeding` when the order changed.

## Done / demoable

On a tournament whose pools are finished, click **Advance to playoffs**,
move the third seed above the second, and confirm: the bracket's first round
pairs the seeds in the new order. Cancel instead and no bracket exists.

## Test plan

- Preview: tiers in seed order with pool and finish; not ready with a reason;
  no pools, by seed.
- Advancing with a changed order seeds the bracket that way; moving a team to
  another bracket, or a missing or repeated team, is refused and creates
  nothing; no `seeding` still uses the standings.
- The dialog: moves stay inside their bracket, end buttons disabled, reset,
  moving back counts as unchanged, format, cancel and Escape, focus stays on
  the move button.
- The panel: the dialog opens from the button, confirm sends the format (and
  seeding only when changed), cancel builds nothing, an unready preview says why.

# 21 — Loading States

Post-v1. Found in the dress rehearsal (ticket 18, step 4).

## Goal

A page that's still fetching says so, instead of showing an empty page or
empty lists that suddenly fill in.

## Scope

- While a page's first load is in flight, show a placeholder shaped like
  the content: skeleton rows for lists and tables, and a skeleton bracket
  for the bracket diagram. Avoid a lone spinner on a blank page.
- Don't show "No teams yet" or other empty-state text until the load has
  finished, so an empty list is never mistaken for missing data.
- Background refreshes (polling, refetch after a write) keep the current
  data on screen. At most, show a small "updating" hint; never blank the
  page.
- Buttons that send a request show that it's pending and can't be pressed
  twice (e.g. Submit score, Advance to playoffs).
- Share one pattern for this, e.g. a `useLoad` hook returning
  `{ data, loading, error }` built on the ticket 18 failure handling
  (`failure.js`, `NotFound`).

## Done / demoable

On a throttled connection ("Slow 4G" in dev tools), every page shows a
placeholder until its data arrives, and none shows an empty state first.

## Test plan

- A test per page: the placeholder shows while the load is pending, and
  the empty-state text doesn't.
- Submit buttons are disabled while their request is pending.

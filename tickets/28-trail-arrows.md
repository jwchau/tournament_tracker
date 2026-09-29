# 28 — Arrows Move Along the Page Trail

Post-v1. From feedback after the refs tickets. Needs ticket 27.

## Goal

The app bar's arrows move through the page tree instead of the browser
history: left goes up a level, right goes back down the way the reader came.

## Scope

- **←** goes to the current page's parent on the trail ("Up to Pool A").
  Disabled on Home.
- **→** goes back down the trail the reader came up ("Down to Court 2"):
  from Court 2, ← ← reaches the tournament with Pool A and Court 2 still on
  the trail, dimmed, and → → returns to Court 2. Disabled when there's
  nothing below, including on first reaching a page.
- Moving to a page already on the trail (an arrow, a crumb, or any link
  that leads there) keeps the trail. Any other page starts a fresh trail
  through its own parents, dropping what was below (like forward history
  after a new link).
- The browser's own back and forward buttons keep using browser history.
- Replaces the history-based arrows (`NavigationHistoryContext`).

## Done / demoable

On Court 2 under Pool A: ← goes to Pool A, ← to the tournament, → back to
Pool A, → back to Court 2, where → is disabled.

## Test plan

- Up and down along a path, with the arrows' names and disabled states.
- A crumb moves along the trail; a new link drops the pages below.
- Sign in / sign out links still work in the bar.

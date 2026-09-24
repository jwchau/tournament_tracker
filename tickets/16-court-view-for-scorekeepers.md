# 16 — Court View for Scorekeepers

## Goal

A scorekeeper standing at a court should open one page on their phone and
see what's on that court now. They should be able to enter its score and
see what's up next, without navigating through pools or brackets.

## Scope

### Backend

- `GET /tournaments/{id}/courts` lists every court number. For each court it
  returns:
  - the current match: the earliest unfinished match assigned to it that
    has both teams;
  - the next few queued matches;
  - whether the court is used for pools or for a playoff bracket.
- Pool courts use the round-robin schedule order. Playoff courts use
  ticket 09's dispatch. A playoff court's queue is its bracket's shared
  queue: the next match goes to whichever of the bracket's courts frees up
  first, and the court page says so.
- Each match in the response includes its team names, best-of count, and
  version, so the page needs no extra requests.

### Frontend

- `/tournaments/:id/courts` lists the courts as big tap targets, and each
  one opens `/tournaments/:id/courts/:court`.
- The court page shows the current match with its score form: the existing
  `ScoreEntryForm`, or `SeriesForm` for best-of matches. The next matches
  are listed below it.
- The page polls like the other live views. After a match completes, the
  next one takes its place without a reload.
- Layout works at phone width (360px): no horizontal scroll, and inputs are
  large enough to tap.
- The tournament page links to the court list.

## Out of scope

Per-court login, and locking a court to one scorekeeper.

## Done / demoable

On a phone, open Court 2 during pool play. Score its match, and watch the
next scheduled match appear. Do the same on a playoff court after
advancing.

## Test plan (TDD)

- Backend:
  - The current match and queue for a pool court follow schedule order.
  - A completed match moves the queue along.
  - Playoff courts reflect dispatch.
  - A court with nothing left reports that it's empty.
- Frontend:
  - The court page shows the current match's form and the queue.
  - Completing a match shows the next one after polling.
  - A version conflict shows the refetch affordance.

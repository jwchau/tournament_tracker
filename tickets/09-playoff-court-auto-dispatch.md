# 09 — Playoff Court Auto-Dispatch

## Goal

Replace manual court assignment for playoff matches with an automatic
FIFO dispatch queue per bracket, since playoff match availability is
dynamic (unlike pools' upfront-known schedule).

## Scope

- Court distribution across `PlayoffBracket`s: same
  even-split/remainder-to-earlier rule as pools (slice 07), applied
  across tier brackets instead — each bracket gets its own dedicated
  courts, not a shared pool across brackets.
- Dispatch queue service: whenever a match transitions to `ready` (both
  teams known — the same transition point already implemented in slice
  03/05's `_advance` logic) or a court frees up (a match on it
  completes), attempt to assign the next queued `ready` match (FIFO —
  whichever became ready first) in that bracket to a free court in that
  bracket's allotment.
- API: exposes current court occupancy/queue per bracket (for the
  frontend to display "waiting for a court" vs. "on court N").
- Frontend: bracket viewer shows each ready-but-undispatched match's
  queue position, and each in-progress match's assigned court; manual
  override (slice 06's fields) remains available as an escape hatch.

- Decisions made while building it:
  - A match that a score correction resets gives up its court and its
    place in the queue; if it's ready again straight away it queues from
    the back.
  - A court set by hand takes the match out of the queue and occupies that
    court. Clearing a ready match's court by hand puts it back in the
    queue at its original place, so it's dispatched again; to keep a match
    off courts, put it on hold instead. Pending matches are never
    dispatched.
  - A finished match keeps the court it was played on; only unfinished
    matches occupy a court.
  - With more brackets than courts, the later brackets own no courts. Their
    matches are overflow: whenever any court frees up, it goes to whichever
    waited longest among that court's bracket's matches and all overflow
    matches. The ready order is one sequence across the tournament so the
    two can be compared. A bracket that owns courts still never uses
    another's. The dispatch endpoint's queue for a bracket with courts
    includes the overflow matches competing for them, and for an overflow
    bracket it's the overflow line, for every court.
- Hold: `PATCH /matches/{id}/hold` with `{on_hold, version}` (version
  checked, like scoring). A held playoff match is skipped by dispatch;
  holding one that's on a court frees the court for the next match
  waiting, and releasing it puts it back in line at its original place.
  Only unscored, unfinished playoff matches can be held (400 otherwise). A
  held match can't be scored or put on a court by hand until released. The
  bracket page has Hold / Release buttons and labels held matches
  "On hold".
  - Changing the court count (only possible before play starts)
    re-dispatches every unfinished playoff match.

## Out of scope

Any cross-bracket court sharing (explicitly rejected — each bracket has
its own dedicated courts).

## Done / demoable

Play a multi-bracket playoff stage with fewer courts than simultaneous
ready matches in at least one bracket; confirm matches queue and get
dispatched to freed courts in the correct (FIFO) order, confined to
their own bracket's dedicated courts.

## Test plan (TDD)

- Backend: unit tests on the dispatch service — a match becoming ready
  with a free court gets immediately assigned; multiple matches becoming
  ready with insufficient courts queue in arrival order and dispatch as
  courts free up; a bracket's queue/courts are never affected by another
  bracket's activity.
- Frontend: component test for the queue-position/court-assignment
  display against a known fixture.

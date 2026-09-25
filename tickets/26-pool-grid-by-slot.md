# 26 — Pool Results Grid by Slot

Post-v1. From feedback after the Kiln overhaul. Needs ticket 23 (refs).

## Goal

The pool page's grid reads as each team's day: slots across, teams down,
every cell saying what that team does in that slot (plays whom on which
court, refs which match, or rests). It replaces the team-against-team grid
completely.

## Scope

- **Axes:** slots 1 to n across the top, the pool's teams down the side.
- **Playing cell:** "Ct 1 · vs Setters".
  - Once finished, it adds the flip-card score from the row team's side, with
    the winner's score in amber (`--amber` on ink).
  - While the match is played, it shows the running score, muted.
- **Ref cell:** "Ref · Ct 2" with "Aces v Diggers" beneath, drawn as an
  outline with no fill so it reads apart from a match at a glance.
- **Resting cell:** "Rest", muted.
- A match with no ref (N/A) simply has no ref cell.
- **Current slot:** the column of the slot being played is outlined, like
  today's "Now" slot.
- **Phones:** the team-name column stays pinned while the slots scroll
  sideways (a 6-team pool has 5+ slots).
- **Jumping:** a playing or ref cell jumps to that match in the schedule
  below and marks the pairing, and the schedule's team names jump back, as
  today.
- The schedule list stays below the grid, with the Score on Court links,
  Correct and the Ref dropdown (ticket 23).
- The team-against-team grid, its A/B/C letters and its hatched diagonal
  are removed.

## Done / demoable

Open a pool: each team's row shows, slot by slot, who they play on which
court (with scores once played), which match they ref, or that they rest.
The current slot's column is outlined; on a phone the names stay put while
the slots scroll.

## Test plan

- Columns are the pool's slots in order; rows are the pool's teams.
- A playing cell shows the court and opponent, and after completion the
  score from that team's side with the winner marked.
- A ref cell shows the court and both teams; a resting cell shows Rest; an
  N/A match has no ref cell.
- The current slot's column is marked.
- Choosing a cell marks the match in the schedule and vice versa.
- `docs/manual-tests.md` section 5's grid scenarios are updated for the new
  layout.

# 23 — Pool Refs

Post-v1. From feedback after the Kiln overhaul. The foundation for tickets
24–26.

## Goal

Every pool match has a reffing team, chosen by the server and the same on
every device, and an organizer can change it. "Observing" goes away: a slot's
idle teams either ref a match or rest.

## Scope

### Storage

- Two new nullable columns on `Match`, added to existing databases by the
  startup column patcher:
  - `ref_team_id`: the reffing team, or empty for no ref (N/A).
  - `ref_set_at`: set when an organizer chose the ref by hand (like
    `court_set_at`). A hand-set empty ref is a deliberate N/A.
- Match responses (including the court list's `CourtMatch`) carry
  `ref_team_id` and `ref_set_at`.

### Automatic assignment (pool play)

- Refs are assigned per court, when the pool schedule is generated:
  each match in a slot gets one ref from the teams sitting out that slot.
- Candidates are teams in the **same pool** that aren't playing in that slot.
- Pick the candidate that has reffed the **fewest matches so far**; ties go to
  a team that **didn't ref in the previous slot**, then to the lowest seed.
- A match with no candidate left gets N/A (e.g. 4 teams on 2 courts: everyone
  plays every slot).
- Regenerating a pool's schedule recomputes its refs (a fresh schedule has no
  hand-set refs to keep).

### Override

- `PATCH /matches/{id}/ref` with `{ ref_team_id | null, automatic: bool, version }`,
  signed in only, version-checked like other match writes.
  - A team: sets it as a hand-set ref.
  - `null`: a hand-set N/A.
  - `automatic: true`: clears the hand-set mark and reassigns by the rules.
- The server refuses a team that's in this match or playing in the same slot
  (pool). Refs stay editable after a match is finished.
- Hand-set refs are never replaced by automatic assignment.

### Backfill

- A one-off, idempotent pass at backend startup gives refs to every scheduled
  pool that has none, including finished slots, by the same rules. Pools that
  already have refs are skipped.

### Pool page (schedule)

- Each match row in the schedule says "Ref: Aces" (or "Ref: N/A").
- The line under each slot lists only the teams **Resting**; "Observing" is gone.
- Signed in, each match row has a **Ref** dropdown: Automatic, then the
  eligible teams (same pool, not playing in that slot), then N/A. The current
  ref is selected.

## Done / demoable

Generate a pool schedule: every match shows a ref, reffing is spread evenly,
and the leftover idle teams show as Resting. Change a ref by hand, reload on
another device, and see the same ref; set it back to Automatic and it
returns to the rules. An existing pool from before the change has refs after
a backend restart.

## Test plan

- Backend:
  - Assignment: 5 teams on 2 courts gives each match a ref from the idle
    team, and ref counts differ by at most one across the pool.
  - 4 teams on 2 courts: every match is N/A.
  - Tiebreaks: the previous slot's ref isn't picked again when another
    candidate has the same count.
  - Override: set a team, set N/A, back to automatic; version conflict (409);
    refusing a team in the match or playing that slot (400); editable after
    the match is complete.
  - Hand-set refs survive anything that reassigns automatic refs.
  - Backfill fills a ref-less pool once and leaves a pool with refs alone.
  - Regenerating a schedule recomputes refs.
- Frontend:
  - Schedule rows show "Ref: …" and N/A; no "Observing" line; Resting lists
    only unassigned idle teams.
  - The Ref dropdown lists only eligible teams, saves, and offers Automatic;
    signed out there's no dropdown.

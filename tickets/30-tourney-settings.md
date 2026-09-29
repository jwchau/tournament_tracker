# 30 — Tournament Settings: Automatic Advancing, Date and Venue, Fewer Locks

Post-v1. From the organizer: the settings locked too early, advance per pool
was a number to work out by hand, and confirming settings was a one-way gate.

## Goal

Settings that follow how far the tournament has got, a sensible default for
who advances, and a review of what a change does before it is saved.

## Scope

- **Advance per pool is automatic by default** (`null`; stored as 0). Each
  pool is split evenly across the playoff brackets and the teams left over go
  to the later brackets, one each: 7 teams over 2 brackets send 3 and 4, and
  8 over 3 send 2, 3 and 3. A pool with fewer teams than brackets sends one team
  to each of the first brackets. A number still works as before (ranks 1..k to
  bracket 1, k+1..2k to bracket 2, the last bracket taking the rest), and
  clearing the box goes back to automatic. Standings mark the places going to
  bracket 1 under either setting. Existing tournaments keep their number.
- **Date and venue**, both optional, editable any time. The date and venue
  show under the tournament's name, and the main page groups a tournament by its
  date (the day it was created when it has none).
- **Locks follow the tournament, one setting at a time** (`setting_locks` on
  the tournament, each with its reason):
  - games per pairing and pool size lock at the first score, as before;
  - advance per pool and the number of brackets lock once the playoff brackets
    exist (reset them to change);
  - the playoff best-of locks at the first *playoff* score (it used to lock at
    the first pool score and again once brackets existed);
  - court count never locks. Playoff matches not yet started are dealt out
    again across the new courts; a match being played stays on its court, even
    one that no longer exists. Pool schedules keep the courts they were built with.
  - the name, date and venue never lock.
- **No confirm gate.** Teams, pools and brackets can be made straight away;
  `confirm-settings` and `settings_confirmed` are gone. In its place, saving
  settings first asks `POST /tournaments/{id}/settings/preview` what the change
  would do to what exists. If it would do something (move teams between brackets,
  re-deal matches to courts, change the best-of of existing brackets, leave
  existing pool schedules as they are, or leave a bracket with under two teams),
  a "Review changes" dialog lists it to save or keep editing; otherwise it saves.
- **The form is grouped** into Tournament, Pool play, Playoffs and Courts, with a
  line under each setting saying what it does, or why it is locked. Save
  waits until something has changed and sends only what changed. A fresh
  draft tournament with no teams opens the Manage drawer.

## Done / demoable

On a tournament with one pool of 7 and 2 brackets, leave advance per pool blank:
pool play sends 3 and 4. Change the bracket count to 3 and Save: the dialog says
"Pool play will send Bracket 1: 2 teams, Bracket 2: 2 teams, Bracket 3: 3 teams"
(and warns that a bracket would be too small if it would). Play a pool match
and games per pairing locks, with its reason, while court count, advance per pool
and the best-of stay open.

## Test plan

- Backend: the split rule (a number, automatic, fewer teams than brackets);
  automatic advancing end to end; date and venue set, cleared, refused when
  malformed; each lock and what stays open; a court change leaving a match under
  way in place; the preview for each kind of effect, empty when there is none,
  ignoring unchanged values, refused for a locked setting; teams and pools with
  no confirmation.
- Frontend: only changed fields are sent; Save waits for a change; a blank
  advance per pool is automatic; date and venue; the review dialog, cancelling
  it; locks disabled with their reason; the groups; best-of options; the drawer
  opening for an empty draft; the standings marking under an automatic setting;
  the main page grouping by date.

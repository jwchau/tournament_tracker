# Tournament Tracker Plan

## v1 summary

v1 set out to run one real tournament day at a venue. The organizer sets up
on a laptop, scorekeepers score from their phones, and anyone with the link
follows along. It shipped as `v1.0.0` after a full dress rehearsal on the
production setup (tickets 00–19, log in [docs/rehearsal.md](docs/rehearsal.md)).

It covers:

- settings, team check-in, and pools with round-robin schedules and standings
- tiered single- or double-elimination playoffs with best-of series
- court auto-dispatch, and live scoring from several phones
- cascading corrections, and results
- username login, where reads are public and writes need an account
- a production build with backups every 15 minutes

Since v1:

- Loading placeholders came in with ticket 21.
- The Kiln overhaul restyled the tournament page, court view, courts list,
  pool page and bracket page (PRs #32–#36). Scoring now happens only on each
  court's live scoreboard, including best-of games.
- Every scenario in [docs/manual-tests.md](docs/manual-tests.md) passed.

Still out of scope: real-time push (pages poll), player stats, roles and
self sign-up, printable exports, and hosting the backend anywhere but the
organizer's machine.

## Next: feedback tickets

Build these in order: 22 → 23 → 24 → 25 → 26. Ticket 23 is the foundation
the later ones need.

1. **[22 — Team count](tickets/22-team-count.md):** the number of teams next
   to "Teams" on the tournament page.
2. **[23 — Pool refs](tickets/23-pool-refs.md):**
   - Refs are stored on the server, one per court, chosen from the same
     pool's idle teams.
   - Organizers can override a ref, and existing pools are backfilled.
   - "Observing" becomes Resting.
3. **[24 — Bracket refs](tickets/24-bracket-refs.md):**
   - A ref is chosen when a match gets a court, by the agreed order.
   - A ref who's called to play is replaced.
   - Overrides go in the match panel.
4. **[25 — Refs on courts](tickets/25-refs-on-courts.md):** refs shown on the
   court view and the courts list.
5. **[26 — Pool grid by slot](tickets/26-pool-grid-by-slot.md):** slots
   across, teams down, with playing, ref and rest cells. It replaces the
   team-against-team grid.

## Then: restyle the rest to match design.md and PRODUCT.md

These still use the pre-overhaul look. Each one gets the Kiln treatment, with
its own review and a design.md "As shipped" update:

- **Pages:** the main page (tournament list and create form), the team page
  (roster, players, seed and pool edits), the account page, and the login page.
- **Forms:**
  - `TournamentForm` (create a tournament)
  - `CorrectionForm` (its button and dialog, used on the pool schedule and in
    the bracket match panel)
  - `ScheduleForm` (court and time, in the match panel)
  - `TeamForm` and `PlayerForm`
  - the settings form in the tournament page's Manage drawer
- **Shared pieces:**
  - `ConfirmModal`: its actions are all ghost buttons, so give it a
    primary/danger action.
  - `NotFound` and `ErrorBoundary` pages.
- **Clean-up:** remove `ScoreEntryForm`, now unused because scoring moved to
  the court view, and `SeriesForm`'s old non-board mode. Keep
  `GameScoreInputs`, which `CorrectionForm` uses.

Suggested order: main page and create form first (the first thing an
organizer sees), then the team page, then the forms, then login and account.

# Follow-ups

What is left open after the work in the git history. Nothing here is broken; each is a
choice or a tidy-up waiting for its turn.

## Tidy-ups

- **`advance_per_pool` stays a non-null integer, with 0 meaning automatic.** Older databases
  have the column as NOT NULL, so storing a real null would mean rebuilding the `tournament`
  table (SQLite can't loosen a NOT NULL in place). Nothing needs it.
- **Retiring another column**: add it to `RETIRED_COLUMNS` in `backend/app/db.py`; startup drops
  it (plain columns only, SQLite 3.35+). Take a backup first on a database that matters
  (`scripts/backup-db`). `settings_confirmed` was dropped this way.

## Ideas, each waiting on a decision

Each changes how the app looks or behaves, so none was done unasked.

- **Faster score entry on the court.** Tab goes from the left score to its +1 button, not to
  the right score, and the Finish confirmation is not answered by Enter (about 7 actions per
  match). Reordering focus would make +1/−1 harder for keyboard users.
- **Pasted roster**: a dialog to paste a whole tournament's teams and players at once, reviewed
  before anything is created. The format chosen: a team's name on a line, its players on the
  lines below, and a blank line between teams; a name that matches an existing team adds to it.
  It needs a bulk endpoint. (The inline "+ Player" box on the Teams list covers adding players
  one team at a time.)
- **Settings**: the Save button is at the bottom of a long panel, and the panel opens over the
  page for any tournament with no teams.
- **The correction confirmation** says "Round 2 match 1", not the teams, or that a champion
  would change.
- **The stage** stays "Pool play" once every pool match is finished; a "12 of 12 pool matches
  done" line, or a checklist of what to do next, would say where an organizer is.
- **Scorekeepers setting the ref.** `/ref` needs an organizer, because it can rewrite refs on
  finished matches and reshuffles the automatic refs on other courts. A scorekeeper at a court
  whose ref didn't show would have to find an organizer. Allowing it only on unfinished matches
  would need a match-state check beside the role table in `auth.py`.
- **Roles per tournament.** Roles are global: an organizer can set up any tournament. If separate
  people ever run separate tournaments on one install, memberships (user, tournament, role) could
  override the global role.
- **Prebuilt queries** for the hottest reads: a little more off a cold read, across many call sites.

## Decided against

- **`PRAGMA synchronous=NORMAL`.** About half of saving a running score is the commit's fsync
  (10.4 ms down to 5.1). It trades a little durability on power loss, and was declined.
- **Serving spectators data a few seconds old** to lift the cache hit rate at small crowds, and
  **clearing only one tournament's cache** on a write.
- **Code-splitting**: the app is one 359 kB script (109 kB compressed), mostly React and the
  router, so splitting would add round trips on weak wifi for little gain.
- **Making endpoints `async`**: a thread hop costs 0.12 ms.

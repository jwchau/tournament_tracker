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
- **User roles**: today any signed-in user can do any write. Design agreed, not built:
  - *Roles*, nested so each includes the one below: **Scorekeeper** (enter and finish scores,
    hold a match), **Organizer** (setup: teams, players, pools, schedule, refs, playoffs,
    settings, and corrections to finished matches), **Admin** (deleting a tournament, and
    managing users). Spectators stay read-only and signed out.
  - *Scope*: global, one `role` column on `User`, not per tournament. Per-tournament
    memberships can be added later as overrides of that default.
  - *Migration*: the column is added with every existing user becoming Admin, so nobody is
    locked out and behavior is unchanged until someone is demoted.
  - *Enforcement*: one central route-to-role table in `auth.py` replacing
    `require_session_for_writes`. Every write defaults to Organizer; an explicit allowlist
    lowers routes to Scorekeeper (`/matches/{id}/score`, the series `games` and
    `game-in-play` routes, `/hold`, and `/auth/*`) or raises them to Admin (tournament
    delete, user management). A new route is locked down until someone opens it. Too low a
    role gets 403; 401 stays for not signed in.
  - *Assigning roles*: the CLI (`app.users create <username> --role …`, defaulting to
    scorekeeper, plus `set-role <username> <role>`) and an Admin-only Users page that lists
    users, changes another user's role (your own row is read-only), and creates a user with a
    username, initial password and role. Deleting a user and resetting a password stay
    CLI-only. No last-Admin safeguard: the CLI is the way back in.
  - *Role changes* end that user's sessions everywhere (`end_sessions`).
  - *Frontend*: `/auth/me` and login return the role. Controls a role can never use are hidden,
    not disabled (setup controls, the correction button, delete-tournament, the Users link).
    Scorekeepers can still open the setup pages by URL and see them read-only, as spectators do.
    A 403 that gets through anyway shows "you don't have permission for that".
  - *Refs stay Organizer*: `/ref` could go to Scorekeepers, but it can rewrite refs on finished
    matches and reshuffles the automatic refs on other courts. Letting a Scorekeeper set it
    only on unfinished matches would need a match-state check beside the role table, so it was
    left out.
- **Prebuilt queries** for the hottest reads: a little more off a cold read, across many call sites.

## Decided against

- **`PRAGMA synchronous=NORMAL`.** About half of saving a running score is the commit's fsync
  (10.4 ms down to 5.1). It trades a little durability on power loss, and was declined.
- **Serving spectators data a few seconds old** to lift the cache hit rate at small crowds, and
  **clearing only one tournament's cache** on a write.
- **Code-splitting**: the app is one 359 kB script (109 kB compressed), mostly React and the
  router, so splitting would add round trips on weak wifi for little gain.
- **Making endpoints `async`**: a thread hop costs 0.12 ms.

# Follow-ups

What is left open after the work in the git history. Nothing here is broken; each is a
choice or a tidy-up waiting for its turn.

## Planned (requested, not started)

- [ ] **Point cap settings**: one for pool play and one for bracket play (a maximum score a
  team can reach). Items 3 and 4 below are how each is set and enforced.
- [x] **Rename pool play "slot" to "round", and group a pairing's games together.** Done in
  the UI only: a round holds each pairing once with its games listed together. Storage is
  unchanged (`Match.round` still counts games in play order); the page derives the round and
  game from it and the tournament's games per pairing (`groupByRound`).
- [ ] **Pool play point cap** (tournament setting, in the pool play group). Enforced by both
  the frontend and the backend: a score above the cap is rejected and not saved.
- [ ] **Playoff point cap** (tournament setting, in the playoffs group). One integer box per
  set of the best-of: best of 3 shows three boxes. Enforced in the frontend and the backend.
- [ ] **Double elimination: a different best-of per bracket** (playoffs setting). For example
  winners bracket best of 3 and losers bracket best of 1, or 5 and 3. Interacts with the
  per-set caps above, since each bracket then has its own number of sets.

Decided for the cap settings:

- 0 or blank means no cap.
- A set is won by reaching the cap (no win-by-two).
- Matches already scored are kept as they are; a cap only applies to games scored after it is set.

## Tidy-ups

- **Drop the unused `settings_confirmed` column.** The model no longer has it, but databases
  created before the confirm step was removed still do (it has a server default of 0, so
  inserts work). Removing it needs a real migration, since `_add_missing_columns` only adds
  columns. Do it with the next change that needs one, and take a backup first (`scripts/backup-db`).
- **`advance_per_pool` stays a non-null integer, with 0 meaning automatic.** Older databases
  have the column as NOT NULL, so storing a real null would need the same migration.

## Ideas, each waiting on a decision

Each changes how the app looks or behaves, so none was done unasked.

- **Faster score entry on the court.** Tab goes from the left score to its +1 button, not to
  the right score, and the Finish confirmation is not answered by Enter (about 7 actions per
  match). Reordering focus would make +1/−1 harder for keyboard users.
- **Adding players without a page hop per team**: an inline add-player box, or a pasted roster.
- **A "next match" link on every court.** Playoff matches move between courts (a bracket 2
  semifinal on court 1 while court 2 sat free); that follows the dispatch rules, but
  scorekeepers must check All courts.
- **Settings**: the Save button is at the bottom of a long panel, and the panel opens over the
  page for any tournament with no teams.
- **The correction confirmation** says "Round 2 match 1", not the teams, or that a champion
  would change.
- **The stage** stays "Pool play" once every pool match is finished; a "12 of 12 pool matches
  done" line, or a checklist of what to do next, would say where an organizer is.
- **Self-hosting the fonts**: no third-party request, cacheable forever. It means adding font
  files or a `@fontsource` dependency.
- **One request for a bracket's matches and dispatch** instead of two: halves a bracket
  viewer's requests, but adds an endpoint.
- **Prebuilt queries** for the hottest reads: a little more off a cold read, across many call sites.

## Decided against

- **`PRAGMA synchronous=NORMAL`.** About half of saving a running score is the commit's fsync
  (10.4 ms down to 5.1). It trades a little durability on power loss, and was declined.
- **Serving spectators data a few seconds old** to lift the cache hit rate at small crowds, and
  **clearing only one tournament's cache** on a write.
- **Code-splitting**: the app is one 359 kB script (109 kB compressed), mostly React and the
  router, so splitting would add round trips on weak wifi for little gain.
- **Making endpoints `async`**: a thread hop costs 0.12 ms.

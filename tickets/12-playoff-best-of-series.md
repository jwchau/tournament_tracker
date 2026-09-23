# 12 — Playoff Best-Of Series

## Goal

Let a playoff match be a best-of-N series instead of a single game: a team
advances only after winning a majority of the games.

## Scope

- `Tournament.playoff_best_of`: odd, 1–7, default 1, in the Settings form.
  `400` on an even or out-of-range value, or on any change while brackets
  exist (it unlocks again after a bracket reset, ticket 11 A5). It applies
  to every playoff match in every tier, including grand finals and the
  grand-final reset. Pool play is unaffected.
- With best-of 1, scoring is exactly as today.
- With best-of N > 1, each playoff match is a series. Games are entered
  one at a time with their own points (a new `Game` table: `match_id`,
  game number, `team1_score`, `team2_score`). A game can't be tied.
  Entries are version-checked on the match, as today. The match's
  `team1_score`/`team2_score` hold games won. The series completes when a
  team reaches (N+1)/2 wins, and the winner advances (and in double
  elimination the loser drops) through the existing advancement code.
- While a series is unfinished, an entered game can be edited freely,
  since nothing downstream depends on it yet. On a completed series,
  "Correct" (ticket 11 C3) edits game scores in the modal. If the series
  winner changes, the existing cascade and preview run as today.
- The diagram shows games won (e.g. "2–1") on playoff matches, and the
  bracket page lists each game's score under the series controls.

## Depends on

Ticket 11: the bracket page (`/brackets/:id`), the per-match correction
modal, and bracket reset.

## Out of scope

Different best-of values for finals or per tier; best-of for pool play.

## Done / demoable

With best-of 3, a playoff team advances only after its second game win;
editing a game in an unfinished series changes nothing downstream; and
correcting a game that flips a completed series cascades like any other
correction.

## Test plan (TDD)

- Backend:
  - `playoff_best_of` validation: even, out of range, and locked while
    brackets exist.
  - A series completes at (N+1)/2 game wins; advancement and the loser
    drop happen only on completion.
  - Tied games are refused; stale versions get `409`.
  - Editing an unfinished series doesn't cascade; correcting a completed
    series that changes the winner does.
  - Rerun the ticket 08 stress suite (`pytest -m stress`) with best-of 3
    added to its scenarios.
- Frontend:
  - Series game entry on the bracket page.
  - The "2–1" display in the diagram.
  - The best-of field in Settings, rejecting even numbers.

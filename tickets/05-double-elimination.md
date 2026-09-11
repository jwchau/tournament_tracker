# 05 — Double Elimination

## Goal

Extend bracket generation, scoring, and correction (slices 02–04) to
double elimination, including bye-aware losers-bracket wiring and a real
grand-finals bracket reset.

## Scope

- `Match.loser_next_match_id` / `loser_next_slot` (already on the model,
  unused until now) come into play.
- Bracket generation service: `generate_double_elimination` (PRD §6.2) —
  winners bracket (reuses `generate_single_elimination`), losers bracket
  built round-by-round (LR1 pairs WR1's losers; each subsequent WR
  round's losers drop into a round facing current LB survivors
  one-for-one, consolidating between drops unless it's the WR final's
  drop, which becomes the losers final). **Must support any team count**,
  not just power-of-two — bye-aware: a bye never produces a loser, so
  losers-bracket slots with no incoming loser auto-advance the present
  side, and this must cascade correctly through multiple LB rounds.
- Grand finals: winners-bracket champion vs. losers-bracket champion.
  If the losers-bracket champion wins, dynamically create a second
  grand-finals (reset) match — the tournament isn't decided until that
  second match is played.
- Scoring/advancement (slice 03's service) extended to also write the
  loser into `loser_next_match_id`/`loser_next_slot` when applicable.
- Cascading correction (slice 04) extended to follow *both*
  `winner_next` and `loser_next` chains when resetting downstream
  matches.
- API/frontend: format choice (single/double) at bracket-generation time;
  bracket diagram (slice 02) extended to render winners bracket, losers
  bracket, and grand finals (plus the reset match when it exists) with
  correct connecting lines.

## Out of scope

Pools (slice 07) — this slice generates/scores a double-elim bracket
directly from a flat team list, same as slice 02 did for single elim.

## Done / demoable

Generate and fully play out a double-elimination bracket for several
team counts, **including at least one non-power-of-two count**, and
confirm: losers correctly drop into the losers bracket, byes in the
losers bracket resolve correctly without a phantom "loser," the grand
finals reset match appears only when the losers-bracket champion wins
game one, and the bracket diagram renders all three sections correctly.
Correct an early match's result and confirm the cascade follows both
winner and loser chains.

## Test plan (TDD)

- Backend: unit tests for `generate_double_elimination` covering exact
  power-of-two counts (4, 8) against the known-correct standard
  structure (match counts per LR round), **and** non-power-of-two counts
  exercising bye cascades through the losers bracket. Integration tests
  playing a bracket fully to completion via the scoring service and
  asserting the reset-match creation logic (both branches: winners-side
  champion wins game one → no reset; losers-side champion wins game one
  → reset match created and decides it). Correction cascade test
  following a loser-side chain.
- Frontend: component test for the three-section bracket diagram layout
  against a known double-elim fixture, including the conditional reset
  match.

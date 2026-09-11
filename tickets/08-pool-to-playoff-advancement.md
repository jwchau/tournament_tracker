# 08 — Pool → Playoff Advancement

## Goal

The manual transition from completed pool play to generated playoff
brackets, tying slice 07 (pools/standings) to slices 02/05 (bracket
generation).

## Scope

- `Tournament.advance_per_pool` / `playoff_bracket_count` (on the model
  since slice 01; exercised for real now).
- Advancement service (PRD §5): given final pool standings, split each
  pool's ranks into tiers of size `advance_per_pool`, with the **last**
  `PlayoffBracket` as a catch-all receiving every remaining rank from
  every pool (pools may contribute different remainder counts). Reject
  the transition if any pool match is incomplete.
- Cross-pool seeding within a tier: rank the tier's teams (drawn from
  multiple pools) using the same points/differential/points-scored
  ranking as in-pool tiebreakers, producing one ordered seed list per
  tier, fed into the existing bracket-seeding algorithm (slice
  02/05).
- `PlayoffBracket` model (PRD §3): one row per tier, `tournament_id`,
  tier index, format (inherited from tournament-level choice — all tiers
  share it).
- If double elimination is selected and a tier's resulting team count
  requires bye-aware handling, this is already covered by slice 05's
  double-elim implementation — no new bracket-generation logic here,
  just correct input assembly (the seeded team list per tier).
- API: `POST /tournaments/{id}/advance-to-playoffs`.
- Frontend: an "advance to playoffs" action in the admin flow, gated on
  pool completion, showing the resulting tier brackets once generated.

## Out of scope

Playoff court auto-dispatch (slice 09) — brackets are generated here
with matches in `pending`/`ready` state per slice 02/05's existing
behavior; court assignment is still manual (slice 06) until slice 09.

## Done / demoable

Complete pool play for a tournament with unevenly-sized pools, advance
to playoffs, and confirm: the correct number of tier brackets exist,
each has the correct teams seeded correctly (verify at least one tier
where cross-pool seeding order matters), and the catch-all bracket
correctly absorbed every pool's remainder regardless of differing pool
sizes.

## Test plan (TDD)

- Backend: tests with multiple pools of different sizes and a chosen
  `advance_per_pool`/`playoff_bracket_count`, asserting the exact tier
  membership matches the PRD §5 rule (including the catch-all case from
  the original worked examples: pool of 6 with k=2 → top 2 to bracket 1,
  bottom 4 to bracket 2). Cross-pool seeding test verifying tie-break
  ranking is applied correctly when assembling a tier's seed list.
  Rejection test for attempting the transition with incomplete pool
  matches.
- Frontend: component test for the gated "advance" action and the
  resulting tier-bracket display.

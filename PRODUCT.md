# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, phones first (confirmed):

- **Scorekeepers** stand at a court with a phone, sign in, and enter scores for the match in front of them, game by game, then move to the next match the court is given.
- **Players and spectators** follow pools, standings, brackets and results read-only on their own phones, without an account.
- **The organizer** runs the event from a laptop: sets up the tournament, checks teams in, builds pools and schedules, advances to playoffs, sets courts by hand when needed, and corrects scores.

## Product Purpose

Tournament Tracker runs a bracket-and-pool tournament from check-in to final placings on a single day at a venue: pool play with round-robin schedules, then tiered single- or double-elimination playoffs with best-of series, live scoring from several phones at once, and cascading score corrections. Success is an event that runs without paper, where everyone at the venue can see what is being played on which court and who is winning.

## Positioning

Self-hosted by the organizer and built for the venue floor: courts are dispatched to the next match automatically, several scorekeepers can score at once without overwriting each other, and a correction re-plays everything downstream of it after previewing what it resets.

## Operating Context

- Events are played **outdoors, in daylight** (confirmed). Phones are read in direct sun, often one-handed, at arm's length, between rallies.
- Pages poll every 10 seconds; there is no live push. Scorekeepers work from the court view (`/tournaments/:id/courts/:court`).
- The organizer's laptop sits at a desk or table at the venue; the backend runs on that machine and is reached through a Cloudflare tunnel.
- A day runs roughly: check-in, pool play across all courts, advance to playoffs, playoffs on dispatched courts, results.

## Capabilities and Constraints

- Tournament stages: draft, pool play, playoffs, complete. Settings lock once the first score is in.
- Pools: snake-seeded auto-assign, round-robin schedules spread over each pool's courts, standings ranked by points, then point difference, then points for.
- Playoffs: one or more tiers, single or double elimination (grand-final reset), best-of 1/3/5/7, seeded per match played across pools.
- Courts: auto-dispatch per bracket, hand-set courts take priority, holds, and a finished bracket lends its courts to the others.
- Access: every GET is public; any change needs a signed-in user. No roles, no sign-up.
- Frontend: React 19 + Vite, plain CSS in `frontend/src/index.css`, deployed from `main` to Cloudflare Workers. Tests use Vitest + Testing Library and query by role and accessible name, so labels and roles are part of the contract.
- The sport is not pinned in the product; rehearsal data used volleyball-style team names and games to 21.

## Brand Commitments

- Product name: **Tournament Tracker**.
- `design.md` (Kiln) is the binding visual system, chosen by the owner.

## Evidence on Hand

- No logo, photography, sponsor marks, or real event data are in the repo. Rehearsal log: `docs/rehearsal.md`. Anything shown as sample content must be labeled as sample, not presented as a real event.

## Product Principles

1. The current match and its score are never more than one tap away for a scorekeeper.
2. Readable at arm's length in sunlight beats compact.
3. Nothing is lost or double-counted: conflicts, corrections and pending states are always visible.
4. Spectators never need an account to follow along.

## Accessibility & Inclusion

- WCAG AA contrast as a floor, with extra margin for direct-sun reading on phones.
- Touch targets at least 48px on the phone surfaces used between rallies.
- Respect `prefers-reduced-motion` and the device's light/dark preference.

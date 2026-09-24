# Changelog

## v1.0.0 — 2026-09-24

The first release: a self-hosted tool that runs a bracket-and-pool tournament
from team check-in to final placings. It runs on the organizer's machine
with Docker Compose, and the venue reaches it through a Cloudflare tunnel.
Tickets 00–19 are in [tickets/](tickets); the release was checked by a full
dress rehearsal on the production stack ([docs/rehearsal.md](docs/rehearsal.md)).

### Setting up

- **Tournaments and teams** (01, 13, 14): create a tournament, confirm its
  settings in a review dialog, and add teams with seeds. Team names can
  change at any time. A team can be deleted until its pool has a schedule,
  and seeds and settings lock once the first score is in.
- **Pools** (07, 11): auto-assign teams to pools by snake seeding, or place
  them by hand. Generate round-robin schedules, with one or more games per
  pairing, spread across each pool's courts.

### Playing

- **Live scoring** (03): scores are saved with a version check, so two
  scorekeepers on the same match can't overwrite each other. The second
  one is told and can refetch.
- **Court view** (16): a phone-sized page per court shows the match on it
  now, its score form and what comes next, and moves on by itself after
  each score.
- **Corrections** (04): any finished score can be corrected. A preview
  lists the later matches it would reset before anything changes.
- **Playoffs** (02, 05, 08, 12): pools advance into one or more tiered
  playoff brackets, single or double elimination (with a grand-final
  reset), with best-of-1/3/5/7 series recorded game by game.
- **Court dispatch** (06, 09): playoff matches go onto free courts on their
  own, in the order they became ready. Courts can still be set by hand,
  which takes priority, and a match can be held off court.
- **Results** (15): the tournament moves from draft through pool play and
  playoffs to complete, then shows each tier's champion, runner-up and
  full placings.

### Running an event

- **Access control** (19): anyone can follow along read-only. Changing
  anything needs a username and password, created from the command line
  and hashed with argon2id.
- **Venue deployment** (10, 17): a production Compose stack with secure
  cookies, restart-on-crash, a health check, and a database backup every
  15 minutes, plus scripts to back up and restore it. The public frontend
  is deployed to Cloudflare Workers from `main`.
- **Error handling** (18): unknown pages and missing ids show a not-found
  page, a render error offers a reload instead of a blank page, and failed
  requests show a notification instead of failing silently.

### Fixed in the dress rehearsal (18)

- Finished pool matches can now be corrected from the pool page; before,
  only bracket matches had a **Correct** button.
- Teams from pools of different sizes are now seeded into playoffs per
  match played. Before, raw totals favored teams in the bigger pool.
- A finished bracket's courts are lent to brackets still playing, earliest
  round first. Before, they sat idle.

### Known limits and next up

- Pages poll every 10 seconds rather than updating live.
- Post-v1: [ticket 20](tickets/20-load-performance.md) (faster page loads
  on phones) and [ticket 21](tickets/21-loading-states.md) (loading
  placeholders instead of empty pages).
- Not in v1: player stats, roles or two-factor auth, printable schedules,
  and end-to-end browser tests. See [V1_MVP_PLAN.md](V1_MVP_PLAN.md).

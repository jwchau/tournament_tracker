# Changelog

## v1.1.0 — unreleased

Refs for every match, point caps, a different best-of for each part of a
double-elimination bracket, and a full restyle in the Kiln design. Scorekeepers
now score rally by rally on a flip scoreboard, and pages load and update more
lightly on phones. Existing databases upgrade themselves when the backend
starts; back up first (see "Upgrading").

### Scoring and courts

- **Flip scoreboard**: each team's score is a large flip-card number with +1
  and −1, saved point by point as the running score so spectators follow the
  game live. A best-of game in play is saved the same way. Finish match asks
  for confirmation, and **Swap sides** puts the teams the other way round for
  a scorekeeper on the far side of the net.
- **Point caps**: a pool point cap, and a playoff point cap with one box per
  set. Blank is no cap, and a set is won by reaching it. +1 stops at the cap,
  a higher score typed in is held at it, and the server refuses anything
  higher. Games already scored are kept as they are.
- **Best-of per bracket section**: the losers bracket and the grand final
  (including its reset match) can be played over a different number of games
  from the winners bracket, for example winners best of 3 and losers best of
  1. "Same as winners" is the default.
- The tied-score note on the court view no longer moves the board or the
  Finish match button when it appears.

### Refs

- **Pools** (23): every pool match gets a ref from the teams idle in that
  round, spread evenly. The organizer can pick another team, or N/A, and
  choose Automatic to go back.
- **Playoffs** (24): a playoff match gets a ref when it gets a court, favouring
  the team due next on that court, then knocked-out teams. The ref stays until
  they are called to play.
- **On the courts** (25): the court view and the courts list show each
  match's ref.

### Pools and playoffs

- **Rounds** (26): pool play is read as rounds, not slots. A round holds each
  pairing once with its games listed together, and the results grid has a
  column per round showing each team's day: who they play, where, the score,
  when they ref, and when they rest.
- **Seeding review** (29): advancing to playoffs opens a dialog showing each
  bracket's teams in seed order with their pool finish. Teams can be moved
  within their bracket before anything is built.
- The pool page shows its schedule as a round-robin sheet, and the bracket page
  reads round by round with each match opening its tools.

### Settings

- **Advance per pool is automatic** by default, splitting each pool evenly
  across the brackets. A number still works.
- **Date and venue**, optional, shown under the tournament's name.
- **Locks, one setting at a time, with the reason.** Games per pairing and
  pool size lock at the first score; advance per pool and the bracket count
  once brackets exist; the playoff best-ofs at the first playoff score. Court
  count never locks. Point caps never lock.
- **No confirm step.** Saving a setting that would change what already exists
  lists what it will do first.
- Teams can't be added once pool play starts, and the Add a team form sits in
  the Teams section. Team names can't be empty, and the Teams heading shows the
  count.

### Look and feel

- The whole app moved to the **Kiln design**: the app shell and a page trail
  with back and forward arrows, the tournament, pool, bracket, team and account
  pages, and a main page that leads with today's events and names the champion
  of finished ones.
- Long pool lists scroll in place, schedule rows and bracket cards no longer
  overlap on phones, and loading placeholders replace empty pages.

### Speed

- Public reads are cached until the next write and carry an ETag, so an
  unchanged page is an empty 304. The court list and dispatch need far fewer
  database statements.
- Phones poll less: a bracket every 4 seconds while a match is on a court,
  every 10 seconds while matches wait, every 30 seconds once finished, and not
  at all in a hidden tab. Cached page data expires after 5 seconds, so one
  phone sees another's changes.

### Upgrading

- **Back up first**: `scripts/backup-db`.
- The backend adds the new columns and drops the retired `settings_confirmed`
  one when it starts. Nothing needs running by hand.
- The public frontend is the Cloudflare Workers build of `main`, and the
  backend is rebuilt on the venue machine
  (`docker compose -f docker-compose.prod.yml up -d --build --wait`). The new
  frontend reads fields only the new backend sends, so do both together.

### Known limits

- Pages still poll rather than update live.
- All bracket sections share one playoff point cap box per set.
- Not included: player stats, roles or two-factor auth, printable schedules,
  and end-to-end browser tests.

## v1.0.0 — 2026-09-24

The first release: a self-hosted tool that runs a bracket-and-pool tournament
from team check-in to final placings. It runs on the organizer's machine
with Docker Compose, and the venue reaches it through a Cloudflare tunnel.
The release was checked by a full
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
- Post-v1, both since done: faster page loads on phones, and loading
  placeholders instead of empty pages.
- Not in v1: player stats, roles or two-factor auth, printable schedules,
  and end-to-end browser tests.

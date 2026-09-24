# v1 MVP Release Plan

## Goal

Run one real tournament day from start to finish at a venue:

- The organizer sets everything up on a laptop.
- Scorekeepers enter scores from their phones.
- Anyone with the link can follow pools and brackets.

v1 is a proof of concept. It needs to survive one real event, not scale.

## Where we are

Tickets 00–08 and 10–13 are done. The whole lifecycle works through the API
and the UI: settings, teams, pools, round-robin schedules, standings, tiered
playoffs (single or double elimination, best-of series), live scoring with
conflict detection, and cascading corrections.

Gaps before a real event:

| Gap | Why it matters on the day | Ticket |
| --- | ------------------------- | ------ |
| Teams can't be deleted and seeds can't be edited | No-shows and late seed changes are normal at check-in | 14 |
| `stage` never becomes `pool_play` or `complete`, and there's no results view | Nobody can see who won, and the tournament never ends | 15 |
| Playoff courts are assigned by hand | The organizer becomes the bottleneck once brackets start | 09 |
| Scorekeepers have to find their match through tournament → pool/bracket pages | Too slow on a phone. Scorekeepers think in courts, not pools | 16 |
| No login: anyone with the URL can change or delete anything | A spectator or a mistyped link can wreck the event | 19 |
| The app runs on dev servers, and there's no backup | A crash or bad correction can't be undone | 17 |
| The app has never been through a full event run | Unknown bugs show up on the day | 18 |

## Release tickets (in order)

1. **[14 — Team check-in edits](tickets/14-team-check-in-edits.md):** delete a team, edit its seed. Small, and unblocks realistic rehearsal data.
2. **[15 — Tournament lifecycle and results](tickets/15-tournament-lifecycle-and-results.md):** real stage transitions and a results summary.
3. **[09 — Playoff court auto-dispatch](tickets/09-playoff-court-auto-dispatch.md):** already written; the largest remaining piece.
4. **[16 — Court view for scorekeepers](tickets/16-court-view-for-scorekeepers.md):** one phone-friendly page per court. Needs 09 for playoff courts.
5. **[19 — Access control and login](tickets/19-access-control-and-login.md):** username and password login, with passwords hashed in SQLite. Signed-in users can make changes; everyone else is read-only.
6. **[17 — Venue deployment](tickets/17-venue-deployment.md):** production build, secure cookies, and database backups.
7. **[18 — Dress rehearsal and v1.0.0](tickets/18-dress-rehearsal-and-release.md):** play a full mock event, fix what breaks, tag the release.

14, 15, and 19 are independent of each other. 16 comes after 09, and 17 after 19, because production cookies need to be `Secure`.

19 touches every write route and form. Doing it earlier makes later tickets write auth-aware tests from the start. The cost is that more of the existing tests have to be touched at once.

## Release criteria

- [ ] Every ticket above is Done.
- [ ] Backend, stress, and frontend tests pass, and lint is clean.
- [ ] The rehearsal script in ticket 18 runs end to end on the production setup, with two phones scoring at once.
- [ ] The database can be restored from a backup taken during the rehearsal.
- [ ] `v1.0.0` is tagged on main, with release notes.

## Not in v1

- Real-time push (WebSocket/SSE). Pages keep polling.
- Player stats or match participation. Rosters are names only.
- Pool corrections that regenerate already-built playoff brackets.
- End-to-end browser tests (Playwright).
- Roles, two-factor auth, self sign-up, or per-tournament permissions. Every signed-in user can do everything (ticket 19).
- Editing pools or schedules after play starts, other than through corrections.
- Printable schedules and exports.
- Hosting the backend anywhere other than the organizer's machine.

## Open decisions

- **Who can read (19):** the ticket leaves every `GET` public, so spectators don't need an account. If you want the whole app private, it's a one-line change to the dependency and a login redirect on every page.
- **Auto-dispatch (09):** it's the biggest remaining ticket. If the event date forces a cut, the fallback is to keep manual court entry and have the court view (16) show only pool courts plus manually assigned playoff matches.

# Dress rehearsal

A mock event played on the production stack before a real one (ticket 18).
It runs every part of the app that an event day uses, in order. The run
passes when it gets to the end with no manual database edits.

Log every problem in the table at the bottom as it happens. Don't stop to
fix it. Bugs get a failing test first, then the fix (ticket 18's branch, or
a follow-up ticket if the fix is large).

## You need

- The host machine with Docker and the Cloudflare tunnel.
- Three phones (or phone-sized browser windows on different devices):
  - **Phone A** and **Phone B**, signed in as scorekeepers.
  - **Phone C**, signed out, following along read-only.
- A laptop signed in as the organizer.
- About 90 minutes.

## 0. Start the production stack

```sh
docker compose down                                  # the dev stack, if it's running
docker compose -f docker-compose.prod.yml up -d --build --wait
cloudflared tunnel run tournament-tracker            # in another terminal
```

- [ ] `https://tournament.johnchau.org` loads and the header shows
      "Backend status: connected".
- [ ] A user exists for the organizer and one for each scorekeeper. If not:
      `docker compose -f docker-compose.prod.yml exec backend python -m app.users create <name>`

## 1. Create the tournament

On the laptop, signed in:

1. Create a tournament named "Rehearsal <date>".
2. Set the settings, then **Save and confirm settings**:

   | Setting | Value |
   | ------- | ----- |
   | Court count | 4 |
   | Target pool size | 4 |
   | Advance per pool | 2 |
   | Playoff bracket count | 2 |
   | Games per pairing | 1 |
   | Playoff best-of | 3 |

- [ ] The confirm dialog lists exactly these values.
- [ ] Afterwards, the page offers teams and pools.

## 2. Teams (ticket 14)

1. Add 14 teams, each with a seed from 1 to 14.
2. Delete one team (e.g. seed 14).
3. Open another team and change its seed to 14, the one freed by the
   deletion.

- [ ] 13 teams remain, and the team page shows the new seed.

## 3. Pools and schedules

1. **Auto-assign teams (snake seeding)**.
2. Open each pool and **Generate schedule**.

- [ ] Pool sizes are as even as 13 teams allow. Record the split: ____
- [ ] Each pool has courts, and every match is on a court.
- [ ] Deleting a team whose pool has a schedule is refused with a clear
      message.
- [ ] Once the first score is in (step 4), settings lock except the name,
      and changing a seed is refused with a clear message.

## 4. Pool play from two phones (tickets 16 and 19)

1. Phone A and Phone B sign in. Each opens **Courts (scorekeeper view)**
   and picks a different court.
2. Phone C stays signed out and opens a pool page.
3. Score pool matches on both phones at the same time, straight from the
   court view.
4. **Deliberate conflict:** open the same court on A and B. Enter different
   scores on both, then tap **Submit score** on both within a second.

- [ ] Each court moves on to its next match after a score, with no reload.
- [ ] In the conflict, one phone saves and the other shows a version
      conflict with **Refetch latest**. Refetching shows the saved score.
      (The API answers 409.)
- [ ] Phone C sees scores and standings update within about 10 seconds,
      and has no score or edit controls.
- [ ] Play every pool match to the end.

## 5. Correct a pool score

After a pool has finished, open one of its matches and click **Correct**.
Change the score so the winner flips, then **Review correction** and
confirm.

- [ ] The preview says what changes.
- [ ] That pool's standings update to match.

## 6. Advance to playoffs (ticket 09)

On the tournament page, choose **Double elimination** and click
**Advance to playoffs**.

- [ ] Two brackets exist, one per tier, and seeding follows the pool
      standings.
- [ ] Courts fill with first-round matches without anyone setting a court
      by hand. The courts page shows what's on each one.

## 7. Play the playoffs

Score both brackets to the end from the phones. Each match is a best-of-3
series, recorded game by game.

Along the way:

1. **Backup mid-playoffs:** after about half the playoff matches are done,
   run `scripts/backup-db` on the host (Git Bash on Windows). Write down
   the file name: ____
2. **Cascading correction:** correct an early playoff match whose winner
   has already played on, so the winner flips.
3. **Grand-final reset:** in one tier, let the team from the lower bracket
   win the grand final.

- [ ] Courts that free up get the next match in line on their own.
- [ ] The correction preview lists the later matches it resets. After you
      confirm, those matches are reset and the right team moves on.
- [ ] Winning the grand final from the lower bracket creates a reset match,
      and that reset match decides the champion.
- [ ] The bracket diagram shows final scores and games won, with the
      winner in bold.

## 8. Restore the backup somewhere else

Restore the mid-playoff backup into a separate scratch stack, so the event
database isn't touched:

```sh
export MSYS_NO_PATHCONV=1   # Git Bash on Windows only
scratch="docker compose -p tt-scratch -f docker-compose.prod.yml"
$scratch run --rm --no-deps -T backend python -m app.backup restore /backups/<file from step 7>.db
BACKEND_PORT=8100 $scratch up -d --no-deps --wait backend
curl -s http://localhost:8100/tournaments
```

Or copy the file to a second machine and use `scripts/restore-db` there.

- [ ] The rehearsal tournament is there, with scores up to the moment of
      the backup (pools finished, playoffs about half played).
- [ ] Clean up: `docker compose -p tt-scratch -f docker-compose.prod.yml down -v`
      (`-v` is safe here: it only deletes the scratch volume).

## 9. Results (ticket 15)

- [ ] The tournament's stage reads Complete.
- [ ] The Results section names the champion and runner-up for each tier.
- [ ] **Full placings** on each bracket page lists every team's finish.

## 10. Error handling

- [ ] An unknown address (e.g. `/nope`) shows "Page not found" with a link
      home.
- [ ] A deleted or made-up id (e.g. `/teams/99999`) shows "Team not found".
- [ ] With the backend stopped (`docker compose -f docker-compose.prod.yml stop backend`),
      trying to save something shows "Couldn't reach the server". Start it
      again afterwards.

## Log

### Run 1 — 2026-09-24

Production stack through the tunnel. The 14 teams were added through the API
by a `rehearsal-bot` user; everything else was done in the UI.

| # | Step | What happened | Bug? | Test / fix |
| - | ---- | ------------- | ---- | ---------- |
| 1 | 3 | 13 teams snaked into pools of 5 / 4 / 4 (A: seeds 1, 6, 7, 12, 14; B: 2, 5, 8, 11; C: 3, 4, 9, 10). All 22 matches on courts, all 4 courts in use. | No | — |
| 2 | 4 | Simultaneous submit on court 4: one phone saved, the other got the conflict and refetched the saved score. | No | — |
| 3 | 4 | Some pages took a few seconds to load on the phones. The endpoints take 8–21 ms locally and 60–96 ms through the tunnel, so the delay is probably in how the frontend fetches. | Slow, post-v1 | [Ticket 20](../tickets/20-load-performance.md) |
| 4 | 4 | Pages show empty, then suddenly fill with data. | UX, post-v1 | [Ticket 21](../tickets/21-loading-states.md) |
| 5 | 4 | All 22 pool matches complete. Standings match the scores; ties rank by point difference, then points for. | No | — |
| 6 | 5 | Pool matches have no **Correct** button; only bracket matches had one. Corrected Hitters vs Kill Shots 22–20 → 20–22 through the API instead. Kill Shots moved to 2nd in Pool B, Hitters to 3rd, with no other matches reset. | Yes | `PoolSchedule.test.jsx`: finished pool matches get **Correct** when signed in; the fix adds `CorrectionForm` to `PoolSchedule`. |
| 7 | 6 | Seeding across pools used raw totals, which favors teams in the 5-team pool (4 matches played against 3). Servers (3–1, 9 pts, +11) got a bye ahead of Setters, who went unbeaten (3–0, 9 pts, +10). | Yes | `tests/test_playoffs.py`: seed on points, point difference, then points scored, each per match played. Stress-test model updated to match. Brackets reset and advanced again. |
| 8 | 6 | After the reset and a second advance, the pairings matched the per-match seeding: byes to Diggers, Setters and Pancakes. All 4 courts filled on their own. | No | — |
| 9 | 7 | Mid-playoff backup: `tournament_tracker-20260924-200917.db`, taken with tier 1 at 12 of 14 matches complete and tier 2 at 3 of 14 (both counts include byes). | No | — |
| 10 | 7 | Cascading correction in bracket 1: the preview listed the later matches it resets, and after it was applied the right team moved on. | No | — |
| 11 | 7 | Grand-final reset: the losers'-side team won the grand final, and the reset match appeared and decided the champion. | No | — |
| 12 | 7 | Bracket 1 finished while bracket 2 still had matches waiting, but courts 1–2 sat idle. Only brackets without courts could borrow; one that owns courts never used another's, even after the other finished. Rare, because brackets play in parallel. | Yes | `test_court_dispatch_api.py`: a finished bracket lends its courts; a lent court takes the earliest round (grand finals last), then the longest wait; a bracket reopened by a correction takes its court back once the borrowed match ends. A bracket's own courts stay first come, first served. The stress tests' consistency check now allows lent courts and fails if one sits idle. |
| 13 | 8 | Restored the mid-playoff backup into a `tt-scratch` stack on port 8100. Its completed matches were identical to those at backup time (tier 1: 12 of 14, tier 2: 3 of 14), all 22 pool matches were complete, and the pool correction was kept. The scratch stack was then removed; the event volume wasn't touched. | No | — |
| 14 | 9 | Stage Complete. Bracket 1: Setters champion, Kill Shots runner-up. Bracket 2: Pancakes champion, Spikers runner-up. Placings list all 13 teams. | No | — |
| 15 | 10 | `/nope` and `/teams/99999` showed an empty page on `tournament.johnchau.org`. That site serves the Cloudflare Workers build of `main` (bundle `index-Cu389IOH.js`), not this branch. The branch preview and the local prod container (`index-BWCRXdoP.js`) include the not-found pages. Frontend fixes from this run (pool **Correct**, not-found pages, failure notices) weren't public during the rehearsal. | Deployment | README notes where the public frontend comes from. Re-check step 10 after merging. |
| 16 | 10 | After merging to `main`, the public site served the new bundle. `/nope` showed "Page not found" and `/teams/99999` showed "Team not found". With the production backend stopped, the API answered 502 and the header showed "Backend status: error"; the backend was then restarted. | No | — |

**Result:** the script ran end to end on the production stack with no manual
database edits. Three bugs were fixed test-first (entries 6, 7 and 12), and
two post-v1 tickets were opened (20 and 21). Afterwards, `rehearsal-bot`'s
password was reset to a random value that wasn't kept.

# Manual test walkthrough: Kiln overhaul

Scenarios to walk through by hand after the Kiln UI overhaul (tournament page,
court view and courts list, pool page, bracket page). Each one lists its setup, what to do,
and what should happen. Tick the box when it passes; note anything odd under
the scenario.

Use the dev stack (`docker compose up -d`, app on http://localhost:5173) unless
a scenario says production. Scenarios marked **phone** are worth doing on a
real phone outdoors; the rest can use a desktop browser, with devtools device
mode (390×844) for the phone widths.

Sign in as the organizer for the signed-in scenarios. For signed-out ones, use
a private window.

**Status: complete.** Walked through by hand on 2026-09-24, against the
overhaul in PRs #32–#36; every scenario passed. To walk it again after a later
change, untick the boxes it touches.

---

## 1. Tournament page

- [x] **Stage and courts at a glance**
  - Setup: any tournament in pool play.
  - Do: open the tournament page.
  - Expect: an ink band with the name in large type, a "Stage: Pool play" chip and a Courts link; standings cards follow, with the top N places of each pool tinted amber and their rank in amber.

- [x] **Manage drawer**
  - Do: signed in, tap Manage. Then press Escape, then open it again and tap the dark backdrop.
  - Expect: the drawer slides in from the right with Settings, Add a team and Delete tournament; Escape and the backdrop both close it. Signed out, there is no Manage button.

- [x] **Unconfirmed settings open the drawer**
  - Setup: a new tournament whose settings aren't confirmed.
  - Expect: the Manage drawer opens by itself on the page.

- [x] **Bracket-only tournament**
  - Setup: a tournament that went straight to a bracket (no pools).
  - Expect: no Standings section at all; the Playoffs section leads.

- [x] **Playoffs first once playoffs start**
  - Setup: a tournament that advanced from pools to playoffs.
  - Expect: bracket cards come before standings; on desktop two brackets sit side by side; on a phone they stack and a wide bracket scrolls sideways inside its card.

- [x] **Team count wording**
  - Expect: a team with one player reads "(1 player)", more read "(N players)".

- [x] **Results**
  - Setup: a complete tournament.
  - Expect: a Results section with one card per bracket: the bracket's name as the heading, "Champion:" with the name in large type, the runner-up, and a Full placings link.

- [x] **Phone app bar**
  - Do: open any page at phone width.
  - Expect: the app bar stays on one row (logo mark only, arrows, your name, Sign out, status dot); hovering the dot on desktop shows "Backend status: connected".

## 2. Courts list

- [x] **Every court as a tile**
  - Setup: a tournament with matches on some courts and at least one free court.
  - Expect: each busy court shows both teams, each with a small ink score chip (0 before the first point); a free court is a single outlined line reading "Free".

- [x] **Running scores**
  - Do: score a few points on a court (section 3), then reload the courts list.
  - Expect: that court's chips show the running score.

- [x] **Best-of court**
  - Setup: a playoff court with a best-of-3 match under way.
  - Expect: a "Best of 3 · Games 1–0" line, and the chips show the game in play.

## 3. Court view: single-game match (**phone**)

- [x] **First screen**
  - Do: open a court with a match on it, signed in.
  - Expect: the court number on the ink strip, two tall columns with each team's name and score, +1 under each (large), −1 under that, and Finish match at the bottom of the screen. Up next is below, off the first screen.

- [x] **Score rally by rally**
  - Do: tap +1 a few times for each team.
  - Expect: the number flips each time (the top half folds down); "Saving…" then "Saved" appears under the board. Quick taps are saved together.

- [x] **Spectator sees it live**
  - Do: open the same court signed out on a second device while scoring on the first.
  - Expect: within about 10 seconds the spectator's numbers flip to the new score.

- [x] **−1 stops at zero**
  - Expect: −1 is disabled when a team has 0.

- [x] **Type a score**
  - Do: tap a number and type a new score.
  - Expect: the digits show while typing, and the score saves like a tap.

- [x] **Tied match can't finish**
  - Expect: at a tie, Finish match is an outlined, disabled button with "A match can't finish tied." above it; it turns ember once the score isn't tied.

- [x] **Finish match**
  - Do: tap Finish match, then Keep playing; then Finish match and Finish.
  - Expect: a confirm dialog with the final score. Keep playing closes it with nothing saved. Finish records the result and the board slides to the court's next match at 0–0.

- [x] **Swap sides**
  - Do: tap the swap icon on the strip, add a point, reload the page.
  - Expect: the teams trade places; the point goes to the team you tapped; after reload it's still swapped on this device only (another phone isn't affected).

- [x] **Lost signal**
  - Do: turn on airplane mode, tap +1, wait a second.
  - Expect: "Couldn't save the score. Check your connection." with Try again. Turn the connection back on and tap Try again (or add another point): it saves.

- [x] **Two scorekeepers on one court**
  - Do: open the same court signed in on two devices; score on one, then tap +1 on the other before it refreshes.
  - Expect: the second device shows "Someone else updated this match." with Refetch latest; Refetch shows the other device's score.

- [x] **Empty court**
  - Setup: a court with nothing left to play.
  - Expect: "Nothing left to play on this court right now." and no Swap sides button.

- [x] **Playoff court note**
  - Setup: a playoff court with a queue.
  - Expect: under Up next, "These go to the next free Bracket N court, which may not be this one."

- [x] **Light mode in sun**
  - Do: set the phone to light mode outdoors.
  - Expect: the score cards stay dark with a light top half and a dark seam; everything readable at arm's length.

## 4. Court view: best-of match

- [x] **Game in play is saved**
  - Setup: a playoff with best-of 3 and a match on a court.
  - Do: tap +1 a few times.
  - Expect: "Saving…" then "Saved"; a spectator device shows the running game score and "Best of 3 · games 0–0".

- [x] **Survives a reload**
  - Do: reload mid-game.
  - Expect: the game's running score comes back from the server.

- [x] **Record a game**
  - Do: finish a game (untied) and tap Record game 1.
  - Expect: game 1 appears under the board with the winner's score in amber; the board resets to 0–0 for game 2; the tally reads 1–0.

- [x] **Fix a recorded game**
  - Do: tap Fix game 1, change a score, save.
  - Expect: the Save button is a quiet grey (not ember); the game updates.

- [x] **Series decided**
  - Do: record games until one team has a majority.
  - Expect: the court moves on to its next match, and the winner advances in the bracket.

- [x] **Correction clears the game in play**
  - Setup: a downstream match with a game in play.
  - Do: correct an earlier match so the downstream match is reset.
  - Expect: the reset match starts again at 0–0 with no leftover game score.

## 5. Pool page

- [x] **Sheet layout**
  - Setup: a pool in pool play.
  - Expect: the pool name large on the ink strip, then standings (advancing places amber), then the Results grid, then the Schedule. On desktop, standings and grid side by side.

- [x] **Results grid**
  - Expect: teams lettered A, B, C… down and across; the diagonal hatched; a finished match is a dark chip with the winner's score in amber, read from each row's side (A vs B shows 17–21, B vs A shows 21–17); matches to come read "S3 / Ct 1"; the current slot's cells are outlined.

- [x] **Jump between grid and schedule**
  - Do: tap a result in the grid.
  - Expect: the page scrolls to that match in the schedule, and the row is filled and outlined; scroll back up and both of that pairing's grid cells are outlined. Tapping the team names in a schedule row jumps back to the grid.

- [x] **Current-slot selection**
  - Do: tap an appointment cell in the current slot.
  - Expect: it shows both its thin Now outline and the thicker selection outline.

- [x] **Scoring links**
  - Expect: unfinished matches show "Score on Court N" signed in, "Watch Court N" signed out, and the link opens that court's scoreboard. Finished matches show Correct (signed in only). There are no score forms on the pool page.

- [x] **Now slot**
  - Expect: the first slot with unfinished matches is outlined and marked "Now".

- [x] **Five or more teams**
  - Setup: a pool with 5+ teams.
  - Expect: on a phone the grid scrolls sideways inside its panel; nothing else on the page scrolls sideways. Observing and Resting lines appear under slots where teams sit out.

- [x] **More than one game per pairing**
  - Setup: a tournament set to 2 games per pairing.
  - Expect: each grid cell stacks both matches, split by a thin line, each linking to its own match.

- [x] **No schedule yet**
  - Setup: a pool with teams and no schedule.
  - Expect: signed in, "No schedule yet…" with Generate schedule; signed out, "The schedule hasn't been made yet." Generating shows the grid and slots.

- [x] **Correct a result**
  - Do: correct a finished match from the schedule.
  - Expect: the grid, the schedule row and the standings all update.

- [x] **Delete pool**
  - Do: signed in, Delete pool at the bottom, then confirm.
  - Expect: a confirm dialog; a pool with scored matches refuses with a message; an empty one returns to the tournament.

## 6. Bracket page

- [x] **Opens on the round being played** (**phone**)
  - Setup: a playoff bracket partway through.
  - Expect: the ink strip with "Bracket N" and its format; round tabs (Quarters, Semis, Final, or Winners/Losers/Grand final for double elimination) with the current round lit; that round's match cards below, the next round's edge showing at the right.

- [x] **Swipe and tabs**
  - Do: swipe the cards sideways a couple of rounds; then tap a far tab.
  - Expect: the lit tab follows the swipe and stays in view in the tab strip; tapping a tab slides to that round with no other tabs flashing on the way; the last round sits flush, with nothing of the previous round showing. "Next: {round}" moves on one round.

- [x] **Match cards**
  - Expect: both teams with flip-card scores (winner amber, loser greyed); a match on a court is outlined in orange with its court and "Score on Court N" (signed in) or "Watch Court N" (signed out); a match in line says "Waiting for a court · #N"; a finished one says "Finished".

- [x] **Open a match**
  - Do: tap a card (phone) or a card in the tree (laptop).
  - Expect: a sheet slides up (phone) or in from the right (laptop), titled like the tabs ("Semis · match 2", "Final"); Escape, the ✕ and tapping outside close it; the open card has a white outline.

- [x] **Organizer tools in the panel**
  - Do: signed in, open an unfinished match with both teams; set its court and time and save; then Hold it, then Release it; then open a finished match and Correct it.
  - Expect: the card shows the new court and time right away; Hold explains what it does, the card says "On hold", Release brings it back; a match that has a score can't be held; Correct works as on the pool page. A bye or a match still waiting for a team has no tools.

- [x] **Signed out**
  - Expect: tapping a match shows its teams, status and "Watch Court N", and no tools.

- [x] **Laptop tree**
  - Do: open the page on a wide window.
  - Expect: the whole bracket as a tree of the same cards, round names over the columns, lines between rounds; double elimination shows its winners and losers sections and the grand final.

- [x] **Champion and placings**
  - Setup: finish the bracket's last match on its court.
  - Expect: without reloading, "{Team} win the bracket" appears above the rounds; once the whole tournament is complete, Placings lists every team's finish with the champion in amber.

- [x] **Results scored on the court show up**
  - Do: score a bracket match on its court on another device.
  - Expect: the bracket page updates within a few seconds.

- [x] **Tournament page brackets**
  - Expect: the small brackets on the tournament page are unchanged (read-only tree), and "Open Bracket N" leads to this page.

## 7. Across the app

- [x] **Reduced motion**
  - Do: turn on reduced motion in the OS.
  - Expect: no flips, slides or drawer animation; scores simply change.

- [x] **Keyboard**
  - Do: tab through the court view and pool page.
  - Expect: every control shows a visible focus ring; the score numbers can be typed into.

- [x] **Production after an upgrade**
  - Do: after the next production deploy, open a court on https://tournament.johnchau.org and score a point.
  - Expect: it saves, and the backups folder still gets a copy every 15 minutes.

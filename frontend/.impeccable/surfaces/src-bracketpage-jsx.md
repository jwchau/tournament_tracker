---
version: 1
slug: "src-bracketpage-jsx"
primary_target: "src/BracketPage.jsx"
related_targets: ["src/BracketBoard.jsx"]
---

# Bracket page

Mode: Operate. Players and spectators follow a playoff tier on phones outdoors; the organizer runs it (courts, times, holds, corrections) from a laptop or phone. Confirmed answers: scoring happens on the court's scoreboard, so a match on a court links there ("Score on Court N" / "Watch Court N"); tapping a match opens its tools in a panel.

States: loading, connection lost, overflow bracket (no courts of its own), match waiting for teams, in line for a court, on a court (running score), on hold, finished, champion decided, tournament complete (placings), signed out.

## Direction contract

THESIS: The bracket read round by round on a phone, the way sports apps page through a draw, with any match one tap from its details. Refuses the category default of one tiny zoomed-out tree with forms stacked beneath it.

OWN-WORLD: Kiln. Ink strip with the tier name at board-title scale and its format; round tabs (the current round filled light); each round a page of Kiln-panel match cards, both teams with flip-card score chips (winner in amber, a running score muted), the court or place in line beneath with the court link; the next round peeking at the right edge. Desktop shows the whole tree in a panel, each box clickable. The match panel is a bottom sheet on phones and a right-hand sheet from 900px.

STORY: A spectator opens the bracket on the round being played, swipes ahead to see who's next, and taps a match to watch its court. The organizer taps a match to set its court and time, hold it, or correct it.

FIRST VIEWPORT (390×844): ink strip; the round tabs; the current round's cards, the next round's edge visible.

FORM: Round by round, candidate 2 of 7 (dealt second), seed key 3c6c1df1. Signature interaction: swiping the pages moves the round tabs with them; tapping a match slides its panel up.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

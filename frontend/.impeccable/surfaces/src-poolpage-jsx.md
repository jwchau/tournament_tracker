---
version: 1
slug: "src-poolpage-jsx"
primary_target: "src/PoolPage.jsx"
related_targets: ["src/PoolSchedule.jsx"]
---

# Pool page

Mode: Operate (read-mostly). Players and spectators on phones outdoors check the pool's standings, results and when they play; the organizer corrects finished matches and manages the pool. Confirmed answers: standings lead, then the schedule; scoring happens on the court's scoreboard, so unfinished matches link there ("Score on Court N") and finished ones keep Correct here.

States: loading, no schedule yet (signed in: Generate schedule), in play (a current slot), finished, a match on hold or without a court, signed out.

## Direction contract

THESIS: The pool as its printed round-robin sheet: standings, then every team against every other in one grid, each cell a result or an appointment. Refuses the category default of a long list of match lines with score forms under each.

OWN-WORLD: Kiln. Ink band with the pool name and its courts; the standings table with advancing places in amber; the grid as a Kiln panel whose cells are small ink score chips (winner's score in amber) or muted "S3 · Ct 1" appointments, the diagonal an empty hatch, the current slot's cells ringed in the band accent; the slot list as rows of court chip, teams, score chips and a Score on Court link. Tabular numerals throughout.

STORY: A player finds their row, reads across to see who they've beaten and when they play the rest, and sees the pool's standing; a scorekeeper jumps from the current slot to their court; the organizer corrects a result from the slot list.

FIRST VIEWPORT (390×844): ink band (pool name, courts, back link); standings table; the top of the grid. Desktop: standings and grid side by side, slot list below.

FORM: Pool sheet, candidate 7 of 7 (dealt third), seed key 33d13465. Signature interaction: tapping a grid cell or a slot match highlights that pairing in both the grid and the slot list.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

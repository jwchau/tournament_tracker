---
version: 1
slug: "src-courtpage-jsx"
primary_target: "src/CourtPage.jsx"
related_targets: ["src/CourtsPage.jsx"]
---

# Court view and courts list

Mode: Operate. Scorekeepers at a court, phone in one hand, outdoors in daylight, between rallies. Spectators without an account see the same board read-only.

Job: keep the running score of the match on this court, rally by rally, and finish it so the court moves to its next match. Confirmed answers: live scoring with big +1 / −1 (typing a number stays possible); the match and its score come first; the courts list gets the same pass.

States that must stay visible: saving, saved, save failed (with retry), version conflict (refetch), on-hold / empty court, series tally for best-of matches, signed out (read-only board plus sign-in link).

## Direction contract

THESIS: The phone is the courtside flip scoreboard. Two tall columns of giant numerals own the screen; every point is one thumb tap. Refuses the category default of a form with two number fields and a submit button.

OWN-WORLD: Kiln. Ink strip for the court and match; each column a Kiln panel (16px radius) with the team name in Manrope 700 over an Unbounded 700 numeral split by a hairline like a flip card; +1 as wide as its column in ghost at 64px tall, −1 smaller; Finish match in the ember gradient, the view's one primary action. Amber only on the winning side of a finished game in a series tally. Tabular numerals everywhere.

STORY: The scorekeeper sees their court, the two teams and the score at arm's length, taps +1 for whoever won the rally, sees it saved, and finishes the match; the next match slides in. Spectators watch the same board update.

FIRST VIEWPORT (390×844): ink strip with "Court 2", the court label and a courts link; two columns filling the screen width, numerals about 96px; +1 / −1 under each column in the thumb zone; save status line; Finish match full width at the bottom of the first viewport. Up next below the fold.

FORM: Flip scoreboard, candidate 1 of 7 (dealt third), seed key 484913f4. Signature interaction: the numeral flips (top half folds down over 180ms, off under reduced motion) when a point is added or taken.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

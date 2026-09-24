---
version: 1
slug: "src-tournamentpage-jsx"
primary_target: "src/TournamentPage.jsx"
related_targets: ["src/App.jsx","src/index.css"]
---

Scope: tournament page (`/tournaments/:id`) plus the app shell every page inherits. Mode: Operate. Audience: spectators and players on phones in daylight first, scorekeepers, then the organizer on a laptop.

## Direction contract

THESIS: The tournament page is the results board players crowd around between games: standings are the page. It refuses the admin-form-stack default where settings, forms and lists compete at equal weight.

OWN-WORLD: Kiln. Ink-gradient header band, charcoal surface gradient ground (Kiln light grounds when the device is in light mode), Unbounded for the tournament name and section heads, Inter for tables and UI, DM Sans on buttons and navigation, Manrope on the primary action. Ember gradient only for the primary action; amber marks advancing places; tabular numerals; 12px buttons, 16px panels.

STORY: A spectator sees who is leading every pool within one glance; a scorekeeper jumps to Courts; the organizer opens Manage for setup, teams, pools and playoffs without those tools crowding the board.

FIRST VIEWPORT: Ink band with the tournament name large, stage chip and Courts link, Manage button right when signed in. Below it, pool standings tables side by side on a laptop, stacked on a phone, advancing rows marked in amber. Results replace standings once complete.

FORM: Scoreboard first, candidate 6 of 7 on my list, seed key bfef9b26.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

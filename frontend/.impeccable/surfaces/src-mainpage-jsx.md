---
version: 1
slug: "src-mainpage-jsx"
primary_target: "src/MainPage.jsx"
related_targets: ["src/TournamentForm.jsx", "src/homeModel.js"]
---

# Main page

Scope: main page (`/`, `MainPage.jsx`) and the create-tournament form (`TournamentForm.jsx`). Mode: Operate. Audience: spectators and players finding today's event on their phones first; the organizer creates and opens tournaments from a laptop. Each tournament shows its stage, team count, created date, and its champion once complete (the top bracket's winner, added to the tournaments list response). Signed in, a New tournament button opens the name form.

## Direction contract

THESIS: The main page is the club's fixtures board: today's events first and large, then the season behind them. It refuses the flat link list where a live event, a draft and last year's final all read the same.

OWN-WORLD: Kiln. Ink band with the page title at board-title scale and the ember New tournament button; charcoal ground; Unbounded for group heads and today's names, Inter for rows; stage chips; amber only for champions; 16px panels, 12px buttons, 48px targets.

STORY: A spectator opens the site and today's tournament is the first, biggest thing, one tap from its board or its courts. Older events recede into dated rows naming who won. The organizer opens New tournament, names it, and sees it land under Today.

FIRST VIEWPORT: Ink band, "Tournaments" large, New tournament right when signed in (its form opens under the band). "Today" group head, then today's tournaments as large panel rows: name in Unbounded, stage chip, team count, a Courts link while in play. "This week" and "Earlier" follow as compact rows: name, stage, teams, date, champion in amber.

FORM: By date, candidate 6 of 7 on my list, seed key e705ccad.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

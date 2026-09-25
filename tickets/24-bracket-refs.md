# 24 — Bracket Refs

Post-v1. From feedback after the Kiln overhaul. Needs ticket 23 (ref
storage and the override endpoint).

## Goal

Every playoff match that goes on a court gets a reffing team that isn't
playing, chosen by the server from the teams best placed to do it, and an
organizer can change it.

## Scope

### When a ref is chosen

- At the moment a match **gets a court**, whether by dispatch or by hand.
- It isn't recalculated after that, so a ref doesn't change under people
  mid-match, except in the one case below.
- Dispatch never holds a match back for lack of a ref. If the chosen ref is
  **called to play** (their own match gets a court), that ref is replaced by
  the same rules, unless it was hand-set.

### Who is chosen

Among teams not in a match that's on a court right now, and not in this match:

1. The team playing **next on the same court** (they're already there).
2. The **same bracket's most recently knocked-out** team.
3. Any other **same-bracket** team that's waiting (not on a court).
4. **Another bracket's most recently knocked-out** team.
5. A team that **didn't make the playoffs** (eliminated in pool play), if any.
6. Otherwise **N/A**.

Ties at any step go to the team with the **fewest refs so far** (pool and
playoff refs together).

### Override

- The ticket 23 endpoint, for bracket matches. Eligible teams are those in
  the same tournament that aren't on a court right now and aren't in this
  match. Hand-set refs stick; "Automatic" returns the match to the rules.
  Refs stay editable after the match.

### Backfill

- At startup, bracket matches currently on a court with no ref get one by
  these rules. Finished bracket matches stay ref-less (who reffed them isn't
  known) and show no ref.

### Bracket page

- Each match card's status line adds "· Ref: Aces" (or "· Ref: N/A") once
  the match has a court.
- The match panel shows the ref, and signed in, a **Ref** dropdown next to
  court and time: Automatic, the eligible teams, then N/A.

## Done / demoable

Run a playoff: as each match is dispatched to a court it shows a ref who
isn't playing, preferring the team due next on that court or the latest team
knocked out. When a ref is dispatched to play, their reffing match gets a new
ref. An organizer changes a ref from the match panel and it sticks.

## Test plan

- Backend:
  - Each step of the order wins over the ones below it, with the
    fewest-refs tiebreak.
  - N/A when nobody's free.
  - A ref who is dispatched to play is replaced; a hand-set ref who is
    dispatched is not replaced.
  - Hand-setting a court assigns a ref too.
  - Override eligibility and refusals; editable after completion.
  - Backfill covers only on-court matches.
  - Dispatch order and timing are unchanged by refs: the existing
    dispatch and stress tests still pass.
- Frontend:
  - Cards show "Ref: …" once on a court.
  - The panel's Ref dropdown lists eligible teams, saves, and offers
    Automatic; signed out there's no dropdown.

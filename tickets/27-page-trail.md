# 27 — Page Trail in the App Bar

Post-v1. From feedback after the refs tickets.

## Goal

The app bar shows where the reader is in the app, as a trail from Home to
the current page, so they can see and step back through where they are.

## Scope

### The page tree

Every page has a place in one tree:

```
Home
└── Tournament
    ├── Pool      ── Court
    ├── Bracket   ── Court
    ├── Courts    ── Court
    └── Team
```

- Pools, brackets, teams and the courts list sit under their tournament.
- A court's parent is **the page it was opened from**: its pool, its bracket
  or the courts list. Opened any other way (a link from elsewhere, a
  reload), it's whatever is using the court now (a pool or a bracket), else
  the courts list.
- Pages outside the tree (account, sign in, not found) sit under Home.

### The trail

- In the app bar between the two arrows: `Home › Spring Classic › Pool A ›
  Court 2`. Earlier crumbs are links, the current page isn't
  (`aria-current="page"`). It's a `nav` labelled "Breadcrumb".
- Names come from the page data the pages already load (cached): the
  tournament's, pool's and team's names, "Bracket N", "Courts", "Court N".
  A blank or unloadable name shows a placeholder ("Tournament", "Team").
- Long names end in an ellipsis (about 18ch, full name as a tooltip); when
  the trail still doesn't fit, the crumbs between Home and the current page
  shrink first.
- Pages the reader came up from (ticket 28) stay on the trail after the
  current one, dimmed.
- The separate Home link goes; the trail starts at Home, and the brand still
  links there.
- **Phones (below 640px):** the trail takes its own row in the bar, between
  the arrows, scrolling sideways with the current page kept in view and the
  start fading out while scrolled.

## Done / demoable

Walk Home → a tournament → a pool → a court: the trail reads Home › the
tournament › Pool A › Court 2. The same through a bracket, the courts list
and a team. Open a court by its link and its trail runs through the pool
or bracket using it.

## Test plan

- The four paths: tournament › pool › court, tournament › bracket › court,
  tournament › courts › court, tournament › team.
- A court opened directly sits under what's using it (or the courts list).
- Pages outside the tree sit under Home; blank or missing names show a
  placeholder.
- It survives React's development double-run of effects (tests run in
  StrictMode).

# 22 — Team Count on the Tournament Page

Post-v1. From feedback after the Kiln overhaul.

## Goal

The tournament page says how many teams are registered, right where the
teams are listed.

## Scope

- The Teams section head reads "Teams" followed by the count as a muted
  number in the same heading, e.g. **Teams** 12.
- The count is every registered team, with no split by check-in (check-in
  status is already shown per team).
- Screen readers hear "Teams, 12".
- It appears once the teams have loaded. A tournament with none shows
  "Teams 0" beside the existing empty message.

## Done / demoable

Open any tournament: the Teams heading shows the number of teams, and adding
or removing a team updates it.

## Test plan

- The Teams heading includes the count of the tournament's teams.
- Zero teams shows 0 with the empty message.
- Adding a team from the Manage drawer updates the count.

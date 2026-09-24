# 20 — Load Performance

Post-v1. Found in the dress rehearsal (ticket 18, step 4).

## Goal

Pages open within a second on a phone at the venue, including over the
tunnel.

## What the rehearsal showed

Some pages took a few seconds to show their data on the scorekeeper phones.
The endpoints themselves were fast when timed during the rehearsal
(13 teams, 22 pool matches):

| Endpoint | Local | Through the tunnel |
| -------- | ----- | ------------------ |
| `GET /tournaments/1` | 15 ms | 96 ms |
| `GET /tournaments/1/teams` | 8 ms | 75 ms |
| `GET /tournaments/1/courts` | 11 ms | 60 ms |
| `GET /pools/1/matches` | 21 ms | 65 ms |
| `GET /pools/1/standings` | 8 ms | 72 ms |

So the delay most likely comes from how the frontend fetches, not from the
database. Measure before changing anything.

## Scope

1. **Measure.** Record a slow page load on a phone through the tunnel
   (browser dev tools, or the network log). Note which requests run, in
   what order, and how long each one waits.
2. **Waterfalls.** Pages that wait for one request before starting the
   next (e.g. the pool and bracket pages load the pool or bracket, then
   the tournament and teams) should start what they can at the same time.
3. **Caching.** Check the page-data cache in `api.js`: every write clears
   all of it, and live reads (matches, courts, standings) aren't cached at
   all. See whether showing the last known data at once, then refreshing,
   removes the wait.
4. **Polling.** After a score, check that the court view and pool pages
   refetch right away instead of waiting for the next 10 s poll.
5. **Backend.** With a bigger tournament (e.g. 32 teams, 4 brackets), log
   query counts per request. Fix any N+1 queries in standings, courts, or
   dispatch.

## Done / demoable

A recorded before/after for the slowest page from step 1, on a phone
through the tunnel.

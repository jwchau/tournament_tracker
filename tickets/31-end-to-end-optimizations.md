# 31 — End-to-End Optimizations

Post-v1. Fewer database hits, faster reads on phones at the venue, fewer steps
for organizers and scorekeepers, and faster builds and tests.

## How it was measured

- **`DB_TRACE=1`** (`app/dbtrace.py`): every response carries `X-DB-Queries` and
  `X-DB-Ms`, and each request is logged with any statement it repeated (the tell
  of a query in a loop).
- **`uv run python -m tests.bench_api`**: plays a 24-team, 4-pool, 2-bracket day
  through the API in memory (setup, pool play, advancing, playoffs) and reports
  statements and time per request type and per page load, cold (after a write) and
  warm (the same read again).

## Baseline (before)

Per page load, in database statements: tournament page 44 (56 once playoffs exist),
courts 16 (28 in playoffs), pool page 8, bracket page 8, main page 2.5. Writes:
advancing to playoffs 147, a playoff score up to 56, auto-assign 35, generating a
schedule 28 per pool. Every phone polled all of this every 10 seconds (a bracket
every 4 seconds, in a hidden tab too).

## What changed

- **Read cache** (`app/readcache.py`). Public reads are worked out once and replayed
  until any write (POST, PATCH, PUT, DELETE) empties the cache. A read that overlaps a
  write is never kept. Cached reads carry an ETag, so a phone whose page is unchanged
  gets an empty 304 (about half the requests in a real session). Warm reads run
  0 statements. Only safe with one backend process and every change going through the
  API, which is how it runs (`READ_CACHE=0` turns it off; documented in the README).
- **Dispatch reads once** (`Snapshot` in `app/dispatch.py`). The playoff matches are
  read in one query and who is on a court, who is next and which brackets are finished
  are worked out in memory. The rules are unchanged (all 37 stress tests pass). The
  courts list went from 29 statements to 5, the dispatch read from 13 to 4, a playoff
  score from 56 to 45, advancing from 147 to 118.
- **Readiness planning and tournament detail**: all pools' teams and matches in two
  queries, and the locks and "pool play started" from one aggregate (readiness 11 to 5,
  detail 5 to 3). Auto-assign: 35 statements to 9.
- **Brackets poll by how live they are**: every 4s while a match is on a court, every
  10s while matches only wait for courts, every 30s once finished, and not at all in a
  hidden tab.
- **Assets** are cached for a year on the Cloudflare deploy (`public/_headers`; nginx
  already did this), and the Google Fonts stylesheet no longer blocks the first paint.
- **CI**: the backend tests run in parallel (`pytest -n auto`, 63s to about 23s on 4
  workers), the docker build runs alongside the tests instead of after them, and uv's
  cache is on.

## What the measurements say

The database is not where the time goes: a playoff score takes about 16 ms and 0.5 ms
of that is SQL. The cost is Python and the ORM per request. So the cache (which
skips all of it on a hit) matters far more than trimming statements from writes, and
the remaining write-path statements (advancing 118, a playoff score 45, generating a
schedule 28 per pool) are left alone: they happen a few times a day.

## Not done

- **Self-hosting the fonts** (no third-party requests, cacheable forever). It means adding
  the font files or a `@fontsource` dependency, so it wants a decision first.
- **Code-splitting**: the app is one 359 kB script (109 kB compressed), most of it React
  and the router, so splitting would gain little and add round trips on weak wifi.
- **One request for a bracket's matches and dispatch** instead of two: halves a bracket
  viewer's requests, but adds an endpoint.

## Test plan

- The cache: a hit after a miss; any write empties it; a refused write still does;
  errors and sign-in are never cached; ETag and 304; CORS headers on a replay;
  a read overlapping a write is not kept; the size bound; `READ_CACHE=0`.
- The whole existing backend suite runs with the cache on, which is how stale reads
  would show up (one test that changed the database behind the API's back now goes
  through the API).
- Bracket polling: every pace, and a hidden tab.

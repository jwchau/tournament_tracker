# Frontend on Cloudflare Workers

Optionally serve the static Vite frontend from Cloudflare Workers instead
of the local machine. The backend can't run on Workers (stateful FastAPI
with file-based SQLite) and stays on Docker Compose behind the Cloudflare
Tunnel.

## Setup

- `frontend/wrangler.jsonc` configures a Workers Static Assets site.
- Set up in the Cloudflare dashboard: Workers & Pages → Create → Import a
  repository, with:

| Field | Value |
| ----- | ----- |
| Project name | `tournament-tracker` (matches `wrangler.jsonc`'s `name`) |
| Build command | `npm install && npm run build` |
| Deploy command | `npx wrangler deploy` (default) |
| Non-production branch deploy command | `npx wrangler versions upload` (default) |
| Path | `frontend` (scopes the monorepo build to that directory) |
| API token | "Create new token" (Cloudflare mints and stores a scoped token) |
| Environment variable | `VITE_API_BASE_URL` = the backend's public Tunnel URL, e.g. `https://tournament-api.johnchau.org` |

`VITE_API_BASE_URL` is baked in at build time, so it must be a build
variable in the Cloudflare project. Without it the frontend falls back to
same-origin requests (`API_BASE_URL = ''` in `frontend/src/api.js`), and
every API call fails because the Worker only serves static assets.

`frontend/public/_headers` gives the built files in `/assets` a year-long cache header (they
have a content hash in their names), while `index.html` stays revalidated so a new deploy is
picked up. To check it after a deploy, `curl -I` one of the `/assets/` files.

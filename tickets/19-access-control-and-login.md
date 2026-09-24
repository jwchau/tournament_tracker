# 19 — Access Control and Login

## Goal

Only signed-in users can change anything. Everyone else can still follow
pools and brackets read-only. Users sign in with a username and password
that the backend stores in SQLite.

Up to now the app has had no authentication. This is deliberately simple: no two-factor auth, no self sign-up, no roles.

## Scope

### Backend

- `User` table: `id`, `username` (unique, case-insensitive), `password_hash`,
  `created_at`.
  - Passwords are hashed with argon2id (`argon2-cffi`), never stored or
    logged in plain text. Hashing is one-way; there's no decrypting.
  - Minimum password length is 8.
- `Session` table: a random token (`secrets.token_urlsafe(32)`), stored
  hashed with SHA-256, plus `user_id`, `created_at`, and `expires_at`
  (14 days).
- Endpoints:
  - `POST /auth/login` takes `{username, password}`. On success it sets an
    `httpOnly`, `SameSite=Lax` session cookie, which is `Secure` outside
    local dev, and returns the user. A wrong username and a wrong password
    get the same `401 "invalid username or password"`.
  - `POST /auth/logout` deletes the session and clears the cookie.
  - `GET /auth/me` returns the current user, or `401`.
  - `POST /auth/password` takes `{current_password, new_password}`.
    Changing the password signs out the user's other sessions.
- Brute-force limit: after 5 failed logins for a username within 15
  minutes, that username gets `429` until the window passes.
- Access rule, enforced by one FastAPI dependency on the routers:
  - `GET` endpoints and `/health` stay public, for spectators.
  - Every `POST`, `PATCH`, and `DELETE` needs a valid session, or gets
    `401`.
  - The only exception is `/auth/login`.
- CORS sends `allow_credentials=True`. That works with the explicit origin
  list, because the frontend and API share the `johnchau.org` site (and
  `localhost` in dev).
- There's no sign-up endpoint. Users are created from the command line:
  `uv run python -m app.users create <username>`, which prompts for the
  password. `... users reset-password <username>` covers lost passwords.
- The test `client` fixture signs in by default. There's also a
  `anonymous_client` fixture for checking what signed-out users can do.

### Frontend

- `api.js` sends `credentials: 'include'` on every request.
  - A `401` from a write sends the user to `/login?next=<current path>`,
    with a "Sign in to make changes" notification.
- `/login` page: username and password fields and a submit button. Errors
  from the backend are shown inline.
- An `AuthContext` loads `GET /auth/me` on start.
  - The nav bar shows "Sign in", or the username with "Sign out".
  - Signed out, the forms and write buttons are hidden, so pages are
    read-only.
- A signed-in user can change their password from an account page.

## Out of scope

Two-factor auth, self sign-up, email resets, per-tournament permissions,
roles, and OAuth.

## Done / demoable

- Create a user from the CLI.
- Signed out on a phone, browse a bracket but see no score forms. A direct
  `curl -X PATCH` gets `401`.
- Sign in, score a match, sign out, and the forms disappear again.
- Five bad passwords lock the username out for 15 minutes.

## Test plan (TDD)

- Backend:
  - The password is stored hashed, and never equals or contains the plain
    text.
  - Login succeeds with correct details, and fails the same way for an
    unknown user and for a wrong password.
  - The session cookie is `httpOnly`.
  - Logout invalidates the session. Expired sessions are refused.
  - Every write route refuses signed-out requests with `401`. A
    parametrised test walks the app's routes so new routes can't skip
    this.
  - Every `GET` route stays public.
  - The lockout starts after 5 failures and ends after the window.
  - A password change signs out the user's other sessions.
  - The CLI creates a user and resets a password.
- Frontend:
  - The login form submits and redirects to `next`.
  - Login errors show inline.
  - Write controls are hidden when signed out.
  - A `401` redirects to the login page.
  - The nav bar shows the sign-in state.

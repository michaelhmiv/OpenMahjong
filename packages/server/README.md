# @openmahjong/server

The Open Mahjong backend (slice 2): Google sign-in, sessions,
finished-game records, stats sums, and settings sync. It stores
records only — it never runs game logic and never sees a live hand
(brief §3/§5). Post-game review runs entirely in the client from the
stored decision log.

TypeScript, Node's built-in `http`, `pg` as the only runtime
dependency. Handlers depend on a `Store` interface (`src/store.ts`):
`PgStore` is the production implementation (thin SQL), `MemoryStore`
backs the test suite and the no-database boot fallback.

## API contract

The server is deployed at `https://api.openmahjong.app`; the web app
is `https://openmahjong.app`. CORS on `/api/*` allows exactly that
origin, with credentials.

Sessions: cookie `om_session` (opaque 32-byte token; only its SHA-256
hash is stored), `HttpOnly; Secure; SameSite=Lax;
Domain=.openmahjong.app; Path=/`, 30-day expiry. Mutations under
`/api` require the session's CSRF token in the `x-csrf-token` header
— 401 without a session, 403 on a bad token. The client learns its
CSRF token from `GET /api/me`.

| Route | Behavior |
| --- | --- |
| `GET /healthz` | 200 `ok`, no auth. |
| `GET /auth/google/start` | 302 to Google's consent screen (scopes `openid profile`). 503 when Google credentials are not configured. |
| `GET /auth/google/callback` | Verifies state, exchanges the code, upserts the user by Google subject id, creates a session, sets the cookie, 302 to the app origin. |
| `POST /auth/signout` | Deletes the session, clears the cookie, 204. |
| `GET /api/me` | `{ user: null }` signed out; `{ user: { name, avatarUrl }, csrfToken }` signed in. |
| `POST /api/games` | Records a finished game `{ id, length, placement, score, finishedAt, log, stats }`. Idempotent on (user, id): 201 on first insert, 200 with the existing record on a repeat. |
| `GET /api/games` | Summaries `[{ id, finishedAt, length, placement, score }]`, newest first, max 200. |
| `GET /api/games/:id` | The full record including `log` and `stats`; 404 if not the user's. |
| `GET /api/stats` | Raw sums `{ games, wins, placementSum, hands, riichi, dealIns, handsWon, winPoints }`; the client derives rates. |
| `GET /api/settings` | `{ settings }` — the stored object, or `null` when never synced. |
| `PUT /api/settings` | Stores `{ settings }` verbatim, 204. |
| `POST /api/import` | `{ games: [...] }` (same shape as `POST /api/games`) → inserts the ones not already present, returns `{ inserted: n }`. |
| `DELETE /api/me` | Hard-deletes the user, their games, settings, and sessions (brief A3/B6); clears the cookie; 204. |

Game `stats` are the per-game counters the client computes at game
end: `{ hands, riichi, dealIns, handsWon, winPoints }`, all
non-negative integers.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | Listen port (Railway sets this). |
| `DATABASE_URL` | — | Postgres connection string. When unset the server boots on the in-memory store with a loud warning — data does not persist. |
| `GOOGLE_CLIENT_ID` | — | When either Google variable is missing, the server still boots; `/auth/google/start` answers 503 so deployment can precede the Google Cloud setup. |
| `GOOGLE_CLIENT_SECRET` | — | See above. |
| `APP_ORIGIN` | `https://openmahjong.app` | The web app origin: the only CORS origin and the post-sign-in redirect target. |
| `API_ORIGIN` | `https://api.openmahjong.app` | This server's public origin; the OAuth redirect URI is `<API_ORIGIN>/auth/google/callback` and must be registered in the Google Cloud console. |
| `COOKIE_DOMAIN` | `.openmahjong.app` | Session cookie domain. |

## Storage and migrations

Postgres, schema in `migrations/` (`001_users`, `002_sessions`,
`003_games`, `004_settings`). A small runner executes unapplied
migrations at boot, each in a transaction, recording them in
`schema_migrations`. Games, sessions, and settings reference `users`
`ON DELETE CASCADE`, which is what makes `DELETE /api/me` a hard
delete.

## Deployment (Railway)

A separate service in the existing OpenMahjong Railway project,
built from this monorepo:

- Build: `npm ci && npm run build --workspace=@openmahjong/server`
- Start: `npm start --workspace=@openmahjong/server`
- Custom domain: `api.openmahjong.app` (DNS CNAME to the service's
  Railway domain).
- A Postgres database in the same project provides `DATABASE_URL`.
- Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` once the Google
  Cloud OAuth client exists; until then the service runs with
  sign-in disabled.

## Development

```sh
npm run typecheck --workspace=@openmahjong/server
npx vitest run packages/server/test/server.test.ts
```

The suite runs the real HTTP layer against `MemoryStore` with a fake
Google client — no network, no live Postgres.

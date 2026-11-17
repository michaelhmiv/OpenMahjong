# @openmahjong/server

The Open Mahjong backend (slice 2): Google sign-in, sessions,
finished-game records, stats sums, settings sync, and in-progress
game carry-over. It stores
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

Google sign-in also uses a separate, host-only
`__Host-om_oauth_state` cookie (`HttpOnly; Secure; SameSite=Lax;
Path=/`, ten-minute expiry). The callback must match the initiating
browser's cookie and a one-use, unexpired server-side transaction.
Transactions are currently process-local and capped at 1,000; sign-in
must be restarted after an API restart, and multi-replica deployment
requires shared transaction storage first.

`POST /auth/signout` requires the same session/CSRF gate as API
mutations. Its CORS policy permits the app origin, including preflight.
Private and authentication responses send `Cache-Control: no-store`.

| Route | Behavior |
| --- | --- |
| `GET /healthz` | 200 `ok`, no auth. |
| `GET /auth/google/start` | 302 to Google's consent screen (scopes `openid profile`). 503 when Google credentials are not configured. |
| `GET /auth/google/callback` | Verifies state, exchanges the code, upserts the user by Google subject id, creates a session, sets the cookie, 302 to the app origin. |
| `POST /auth/signout` | Requires session + CSRF, deletes the session, clears the cookie, 204. |
| `GET /api/me` | `{ user: null }` signed out; `{ user: { name, avatarUrl }, csrfToken }` signed in. |
| `POST /api/games` | Records a finished game `{ id, length, placement, score, finishedAt, log, stats }`. Idempotent on (user, id): 201 on first insert, 200 with the existing record on a repeat. |
| `GET /api/games` | Summaries `[{ id, finishedAt, length, placement, score }]`, newest first, max 200. |
| `GET /api/games/:id` | The full record including `log` and `stats`; 404 if not the user's. |
| `GET /api/stats` | Raw sums `{ games, wins, placementSum, hands, riichi, dealIns, handsWon, winPoints }`; the client derives rates. |
| `GET /api/settings` | `{ settings }` — the stored object, or `null` when never synced. |
| `PUT /api/settings` | Stores `{ settings: object }` including namespaced learning progress, 204. |
| `GET /api/resume` | `{ resume }` — `{ state, savedAt }` for the caller's in-progress game, or `null` when none is stored. Session required. |
| `PUT /api/resume` | Stores `{ state, savedAt }` (the client's serialized SavedGame plus its save time) as the caller's one in-progress game, replacing any previous one; 204. Session + CSRF required. |
| `DELETE /api/resume` | Clears the caller's in-progress game (finishing or abandoning a game); idempotent, 204. Session + CSRF required. |
| `POST /api/import` | `{ games: [...] }` (same shape as `POST /api/games`) → inserts the ones not already present, returns `{ inserted: n }`. |
| `DELETE /api/me` | Hard-deletes the user, their games, settings, and sessions (brief A3/B6); clears the cookie; 204. |

Game `stats` are the per-game counters the client computes at game
end: `{ hands, riichi, dealIns, handsWon, winPoints }`, all
non-negative safe integers. Counters other than `winPoints` must fit
PostgreSQL `integer` (maximum 2,147,483,647); riichi, deal-ins, and hands
won cannot exceed hands played. Scores must be safe integers, and
`finishedAt` must use an ISO date/time with timezone. Invalid game IDs
are rejected as 400 before querying a UUID column.

Input limits: settings request 2 MiB (bounded learning evidence plus lesson snapshots), one game request 2 MiB, import
request 16 MiB and at most 200 games. Each imported log is also bounded
to 2 MiB. A resume state is bounded to 2 MiB and at most 20,000
decisions; envelope/shape violations return 400. JSON nesting is limited to 64 levels and one million values
per settings object/log. Requests exceeding byte bounds return 413;
count/shape violations return 400. Import clients must batch uploads.
Legacy records with a null decision log remain accepted.

These checks bound storage work and protect the API contract. They do
not establish that the client played a valid match. Scores, placement,
statistics, and replay logs are untrusted private history and must
never supply ratings or authoritative competitive results.

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
`003_games`, `004_settings`, `005_resume`). A small runner executes unapplied
migrations at boot, each in a transaction, recording them in
`schema_migrations`. Games, sessions, settings, and in-progress games reference `users`
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
npx vitest run packages/server/test   # HTTP + Google client + pg wire types
```

The suite runs the real HTTP layer against `MemoryStore` with a fake
Google client — no provider network and no live Postgres. A separate
test exercises the real driver's bigint parser at the Store boundary;
SQL constraints, migrations, and concurrency still need PostgreSQL
integration coverage. See
[`docs/audit/security-performance-audit.md`](../../docs/audit/security-performance-audit.md)
for known storage, synchronization, abuse-control, and recovery gaps.

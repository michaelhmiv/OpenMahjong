# Security, data integrity, and server performance audit

Assessment date: 2026-11-16. Baseline: `main` commit
`989927ba57dde781a4a856eaa2bbb6a1d01afb4b`. Line references below are
to that immutable baseline unless marked **patch**. The audit describes
observed code and local verification; it does not claim a penetration test,
a completed Google consent flow, a database restore, or production load testing.

## Verified boundaries

- The backend stores private, client-submitted game history. It does not run a
  match coordinator. Placement, scores, logs, and statistics are untrusted
  personal records, never evidence for ratings or competitive results.
- Sessions use 32 random bytes, SHA-256 hashes at rest, a 30-day server expiry,
  and `HttpOnly; Secure; SameSite=Lax` cookies (`src/auth.ts:10–46`). Expired
  sessions are rejected and deleted when used (`src/app.ts:114–125`).
- API mutations require a session and its CSRF token
  (`src/app.ts:129–143`). Reads and writes are scoped by the authenticated
  user ID; SQL uses parameters (`src/pg-store.ts:130–164`). The HTTP suite
  verifies cross-user record isolation and deletion.
- Only `https://openmahjong.app` receives credentialed API CORS by default
  (`src/config.ts:23`; `src/app.ts:245–267`). CORS is a browser response-reading
  control, not authentication or a substitute for CSRF checks.
- The account schema stores Google subject, display name, avatar URL, and
  creation time, rather than email (`migrations/001_users.sql:1–10`).
  User deletion cascades to games, sessions, and settings in the schema.
- `(user_id, id)` protects game-upload idempotency; the history index matches
  user/newest-first queries (`migrations/003_games.sql:7–26`).

All paths in the findings are prefixed by `packages/server/` unless stated
otherwise. Proposed PR identifiers are logical units in the roadmap, not
claims that a particular GitHub PR already exists.

## Findings, ordered by impact

### SEC-01 — P1: OAuth state was not bound to the initiating browser

- **Area / complexity:** Authentication; small, targeted fix.
- **Expected:** A callback must complete a transaction initiated by this browser,
  expire promptly, and be consumed once.
- **Observed / evidence:** `src/app.ts:159–191` creates a random state in a
  process-global map and accepts it from any browser. No browser transaction
  cookie is issued or checked.
- **Reproduction:** With the fake provider, start sign-in in browser A and send
  its callback URL to browser B. The baseline creates A's session in B.
  No production account was used to reproduce this.
- **User impact / cause:** Login CSRF can associate a user's subsequent private
  history with an attacker's account. Random state prevents guessing, but a
  global existence check does not prove browser ownership.
- **Correction / acceptance:** Issue a short-lived host-only
  `__Host-om_oauth_state` cookie; require an exact match before consuming state;
  reject missing, other-browser, expired, and replayed transactions. A rejected
  other-browser callback must not cancel the legitimate transaction.
- **Status / proposed PR:** Implemented in the authentication hardening PR.
  `test/server.test.ts`, “OAuth transaction security,” verifies these cases.
  An additional concurrent-callback regression holds the provider exchange
  open and verifies that a second callback is rejected before any session
  exists; the provider is called once and the original transaction completes.
  The patch retains existing sessions and requires no database migration.

### SEC-02 — P1: Signout bypassed CSRF and lacked the app's CORS contract

- **Area / complexity:** Account workflow; small fix shared with the web client.
- **Expected:** The real app can preflight and sign out; other sites cannot
  mutate the session without its CSRF token.
- **Observed / evidence:** `src/app.ts:223–232` deletes a session solely from
  its cookie. CORS is installed only inside `handleApi` (`:245`), while
  `/auth/signout` is routed outside it. The web client sends a JSON content type
  and CSRF header, causing a cross-origin preflight the baseline does not allow.
- **Reproduction:** Send `OPTIONS /auth/signout` with the app Origin and a POST
  requested method: baseline returns no usable preflight response. Separately,
  POST with a session cookie and no CSRF token deletes the session.
- **User impact / cause:** Browser signout can fail, while a same-site sibling
  origin can force logout. Auth routes were excluded from the API policy.
- **Correction / acceptance:** Apply exact-origin CORS to signout and use the
  existing session-plus-CSRF gate. Verify allowed preflight, rejected missing
  token, preserved session on rejection, and successful authenticated signout.
- **Status / proposed PR:** Implemented and HTTP-tested in authentication
  hardening; coordinated with the web client's 204-response handling repair.

### SEC-03 — P1: Numeric and identifier validation allowed predictable 500s

- **Area / complexity:** API/database integrity; small to medium.
- **Expected:** Inputs incompatible with SQL column ranges or API types are
  rejected as client errors before a query.
- **Observed / evidence:** `src/validate.ts:18–35` accepts any nonnegative
  `Number.isInteger`, including values beyond JavaScript precision and
  PostgreSQL `integer`. `src/app.ts:321–326` decodes arbitrary game IDs and
  passes them to a UUID column. `src/pg-store.ts:211–218` casts aggregate sums
  back to 32-bit integers, so two individually valid large counters overflow.
- **Reproduction:** Upload `stats.hands = 2147483648`; baseline MemoryStore
  accepts it, while the SQL insert cannot. GET an authenticated game URL with
  an invalid UUID or malformed percent encoding. The baseline's decoding/SQL
  path raises a server error. SQL overflow is code-derived, not a live DB test.
- **User impact / cause:** Broken API responses and disagreement between
  MemoryStore tests and production. TypeScript annotations do not validate
  input or database wire types.
- **Correction / acceptance:** Validate safe integer scores, SQL integer
  counters, counters no greater than hands, safe integer win points, ISO date
  syntax, and UUID paths. Aggregate without narrowing back to SQL `int`.
  Invalid IDs and bad numbers must return 400 without insertion.
- **Status / proposed PR:** Implemented in API integrity hardening. HTTP
  regression cases pass. The aggregate SQL change still needs a real
  PostgreSQL integration run; very large aggregate totals above JS safe
  integer precision are not suitable for competitive measurement.

### SEC-04 — P1: Production full-game records returned bigint points as strings

- **Area / complexity:** Persistence/API contract; small.
- **Expected:** `stats.winPoints` is a JSON number from either Store.
- **Observed / evidence:** `migrations/003_games.sql:21` defines `win_points`
  as bigint. The default `pg` int8 parser returns a string, but
  `src/pg-store.ts:175–180` forwards it under a TypeScript `number` annotation.
- **Reproduction:** Use the installed driver's int8 parser on `"9100"`, then
  pass that row through `PgStore.getGame`: the baseline returns a string.
  This can corrupt downstream arithmetic through string concatenation.
- **User impact / cause:** Account record types differ from guest/test data;
  numeric rendering and calculations can break.
- **Correction / acceptance:** Convert bigint values at the Store boundary;
  a row produced using the real driver's parser must serialize `9100` as a
  number. Existing safe integer input limits bound new stored values.
- **Status / proposed PR:** Implemented in API integrity hardening;
  `test/pg-store.test.ts` verifies the actual driver parser plus row mapping.
  This is not described as a live database integration test.

### SEC-05 — P2: Request, nesting, and pending-login resource limits were coarse

- **Area / complexity:** Availability and storage cost; medium.
- **Expected:** Each endpoint bounds its own input and work; rejection sends a
  useful HTTP error and does not keep buffering a discarded body.
- **Observed / evidence:** A uniform 16 MiB limit applies even to settings
  (`src/app.ts:41,94–111`); imports have no count limit
  (`src/validate.ts:90–94`) and insert sequentially. OAuth's pending map
  (`src/app.ts:78,164–170`) has TTL cleanup but no size bound. JSON nesting is
  unchecked before the subsequent stringify/database traversal.
- **Reproduction:** Supply thousands of tiny import records, a deeply nested
  log, or repeated sign-in starts. The baseline accepts work until the coarse
  body bound or runtime limits intervene.
- **User impact / cause:** Authenticated write amplification, memory pressure,
  excessive database work, and unauthenticated pending-state accumulation.
- **Correction / acceptance:** Limit settings requests to 64 KiB, single game
  requests/logs to 2 MiB, imports to 16 MiB and 200 records, JSON depth to 64
  and node count to one million, and pending OAuth transactions to 1,000.
  Both Content-Length and streamed chunked overflow must return 413 before
  storage and close the request connection. Batch legitimate client imports.
- **Status / proposed PR:** Bounds implemented and HTTP-tested in API integrity
  hardening; pending-state cap/TTL recovery tested. This is **partial** abuse
  protection. A streamed-overflow regression deliberately omits request EOF
  and verifies that the server still sends 413 with `Connection: close`
  before storing settings. No distributed rate limiter, per-account storage quota, or
  concurrency budget exists yet. A flood can still occupy the bounded OAuth
  pool. These need an operations follow-up before broad public exposure.

### SEC-06 — P2: Private/authentication responses lacked explicit cache policy

- **Area / complexity:** Privacy and proxy correctness; small.
- **Expected:** Private history, session probes, CSRF tokens, and OAuth
  transactions must not be cached. CORS response variation is explicit even
  for requests without an allowed Origin.
- **Observed / evidence:** `src/app.ts:80–87` sets content type only;
  `:245–252` adds `Vary: Origin` only for an allowed Origin.
- **Reproduction:** Inspect baseline response headers on `/api/me` and OAuth
  start. No explicit cache policy is sent. This identifies a policy gap;
  no actual shared-cache leak was observed.
- **User impact / cause:** Cache behavior depends on intermediaries rather
  than an explicit privacy contract.
- **Correction / acceptance:** Set `Cache-Control: no-store`, `nosniff`, and
  `Referrer-Policy: no-referrer`; vary API/signout responses on Origin.
- **Status / proposed PR:** Implemented; header assertions pass in the
  authentication hardening tests.

### SEC-07 — P1: Missing DATABASE_URL silently enables volatile account storage

- **Area / complexity:** Data durability; medium deployment-contract change.
- **Expected:** A production configuration failure must not accept account
  writes into a store that disappears on restart.
- **Observed / evidence:** `src/index.ts:21–35` logs a warning and enables
  MemoryStore whenever DATABASE_URL is absent. `/healthz` still reports 200.
- **Reproduction:** Start the server without DATABASE_URL, sign in through a
  configured/fake provider, save a record, restart: records disappear by
  design. Current production has DATABASE_URL configured; this is a failure
  mode, not an observed production data-loss incident.
- **User impact / cause:** Silent loss of newly accepted account data after an
  environment regression; readiness does not distinguish durable storage.
- **Correction / acceptance:** Require an explicit development-only ephemeral
  storage opt-in; fail startup when production durability configuration is
  absent. Add readiness that checks the configured Store, with a bounded DB
  query. Keep a simple liveness endpoint.
- **Status / proposed PR:** Open; deployment reliability PR. Test missing-DB
  production refusal, explicit local fallback, DB outage readiness, and
  recovery before deploying this policy change.

### SEC-08 — P2: OAuth state and request budgets are process-local

- **Area / complexity:** Scaling and abuse controls; medium.
- **Expected:** Authentication survives replica selection and rolling
  deployment, and write budgets cannot be bypassed through arbitrary headers.
- **Observed / evidence:** `src/app.ts:78` keeps state in a Map. No rate limiter
  or quota exists. No trusted-proxy policy is implemented.
- **Reproduction:** Start a transaction in one createApp instance and complete
  it in another: it is rejected. Repeated valid authenticated uploads remain
  unlimited across time. Railway currently reports one API replica, so the
  cross-replica failure is a scaling prerequisite, not an observed outage.
- **User impact / cause:** Intermittent sign-in failure after scaling/restart;
  potential resource exhaustion from valid sessions.
- **Correction / acceptance:** Store hashed, expiring, one-use transaction
  state centrally or adopt a carefully reviewed stateless design. Define
  per-account budgets and a trusted proxy boundary before IP-based controls;
  never accept arbitrary `X-Forwarded-For` as identity. Verify two-instance
  callback completion and spoofed-header resistance.
- **Status / proposed PR:** Open; shared authentication/abuse-control PR.

### SEC-09 — P2: Database behavior and concurrent migrations lack integration proof

- **Area / complexity:** Deployment and persistence; medium.
- **Expected:** Real SQL constraints, cascades, idempotency, driver types,
  aggregates, rollback, and parallel startup are exercised.
- **Observed / evidence:** Baseline `test/server.test.ts:65–81` uses only
  MemoryStore. `src/migrations.ts:23–46` reads applied migrations before taking
  any global lock; two starting processes may run the same pending migration.
- **Reproduction:** Launch two runners against an empty test database. Both
  can observe a migration as pending and race the DDL/ledger insert. This race
  is derived from code; it was not executed against production or a local DB.
- **User impact / cause:** Green HTTP tests can miss production-only behavior;
  concurrent deploys can fail startup.
- **Correction / acceptance:** Add an isolated PostgreSQL CI service, execute
  the Store contract and real HTTP routes, and lock the migration sequence
  using a dedicated connection/advisory lock. Test rollback and two-runner
  startup. Never test against production data.
- **Status / proposed PR:** Open; database integration/migration PR. The added
  driver-boundary regression improves coverage without closing this finding.

### SEC-10 — P2: Full-object settings writes have no conflict protocol

- **Area / complexity:** Learning progress persistence; medium.
- **Expected:** A late offline client must not silently erase newer learning
  progress from another device; settings choices follow a documented policy.
- **Observed / evidence:** `src/pg-store.ts:234–240` replaces the JSON blob
  unconditionally. No revision, timestamp precondition, or server merge exists.
  Guest-to-account tutorial union exists in the web layer but is not a general
  concurrent-device synchronization protocol.
- **Reproduction:** Read settings on clients A/B, add distinct progress on
  each, PUT A then PUT B. B's entire object replaces A's.
- **User impact / cause:** Lost progress or stale preferences under concurrent
  use; last arrival wins implicitly rather than by an explicit contract.
- **Correction / acceptance:** Version learning events/content separately,
  define monotonic completion merge and exercise-attempt identity, and use
  revision/ETag preconditions for preference conflicts. Test offline retries,
  duplicates, account switching, and two-client writes.
- **Status / proposed PR:** Open; progress synchronization PR. Avoid a blind
  deep merge that makes deliberate resets/deletions impossible.

### SEC-11 — P2: Session cookie authority extends to every sibling subdomain

- **Area / complexity:** Authentication hardening; medium migration.
- **Expected:** Only the API host should receive and set its session cookie.
- **Observed / evidence:** `src/auth.ts:25–46` deliberately uses
  `Domain=.openmahjong.app`; `src/config.ts:28` sets that default. No sibling
  subdomain compromise was observed.
- **Reproduction:** Inspect the Set-Cookie scope. An unrelated sibling server
  receives this cookie on requests, and a sibling origin can set a same-name
  domain cookie. The current `parseCookies` resolves duplicate names by order.
- **User impact / cause:** Larger session trust boundary than the API requires;
  confidentiality/session confusion if a sibling subdomain is compromised.
- **Correction / acceptance:** Migrate to a host-only `__Host-` session cookie
  with a documented legacy-cookie retirement window; clear legacy domain
  cookies on authentication/signout. Test existing-session compatibility and
  duplicate-cookie handling. CORS fetches can use an API-host-only cookie.
- **Status / proposed PR:** Open; session-cookie migration PR. The new OAuth
  transaction cookie is already host-only; existing sessions are unchanged.

### SEC-12 — P2: Retention, cleanup, and recovery are not operationally proven

- **Area / complexity:** Privacy, operations, and cost; medium.
- **Expected:** Expired sessions are routinely removed, storage growth is
  bounded, backups have stated retention, and restore is rehearsed.
- **Observed / evidence:** `src/app.ts:119–120` deletes an expired session only
  when its token is presented. There is no purge job, per-account record quota,
  or backup/restore script. `migrations/002_sessions.sql` has no expiry index.
  Account deletion's live-table cascade does not prove deletion from backups.
- **Reproduction:** Create expired sessions and never present their tokens:
  no application path sweeps them. Backup retention/restore was not inspected
  through database credentials and remains unverified.
- **User impact / cause:** Unbounded stale rows and account history; uncertain
  recovery time and backup deletion semantics.
- **Correction / acceptance:** Define retention, purge/index strategy, account
  export/deletion behavior, restore objectives, and a staging restore drill.
  Document how backup expiration interacts with deletion. Capture measured
  restore evidence without exposing production records.
- **Status / proposed PR:** Open; operations/retention PR and owner-run restore
  exercise. See the architecture/operations roadmap for Railway observations.

### SEC-13 — P2: Provider calls had no explicit deadline

- **Area / complexity:** Authentication availability; small.
- **Expected:** Token exchange and profile lookup have bounded deadlines and
  errors do not create a partial session.
- **Observed / evidence:** `src/google.ts:45–66` calls fetch without an AbortSignal.
- **Reproduction:** A provider/fake fetch that never settles leaves the callback
  waiting until lower-level networking decides to fail.
- **User impact / cause:** Open requests and a stalled sign-in experience.
- **Correction / acceptance:** Add a 10-second AbortSignal deadline per call;
  provider/token/profile errors fail closed. Keep provider tokens out of stored
  profiles and error payloads.
- **Status / proposed PR:** Deadline implemented in authentication hardening.
  `test/google.test.ts` verifies signals on both calls, minimal scopes, no
  retained access token, and invalid-provider response rejection. A real
  provider outage/latency experiment was not performed.

## Competitive integrity gate

Client submissions can forge a plausible score even after all shape checks
pass. This is acceptable only for the existing private personal-history
feature. Do not promote these rows to official results, public leaderboards,
ratings, achievements with competitive significance, or authoritative puzzle
sources. Multiplayer must own wall generation, turn/action legality,
hidden-information delivery, settlement, action idempotency, and result
identity on the server. This is a design prerequisite, not a claim that rated
play is currently exposed or vulnerable.

## Verification and release implications

Executed locally after the server patch:

```sh
npx vitest run packages/server/test
npm run typecheck --workspace=@openmahjong/server
npm run build --workspace=@openmahjong/server
```

Result: **42 tests passed across 3 files; typecheck and server build passed**.
`npm audit --omit=dev --json` also completed successfully with **zero reported
runtime dependency vulnerabilities** on this lockfile at assessment time.
This advisory check is not proof that dependencies are free of vulnerabilities.
The suite uses real HTTP with MemoryStore, fake Google responses, and one
real `pg` wire-parser boundary test. It does not execute SQL or real OAuth.
No production deployment, infrastructure mutation, account deletion, database
migration, load test, or backup restore was performed for this audit.

The patches add no runtime dependency and no schema migration. Existing
sessions remain readable; pending sign-ins begun before an upgrade must be
restarted because they lack the new browser transaction cookie. Web clients
must send the existing CSRF token for signout, honor successful empty 204
responses, and batch imports at no more than 200 records/request. New input
bounds can reject oversized/malformed historical exports; existing stored rows
are retained. Expensive competitive analysis remains client-side and outside
this server's trust boundary.


## SEC-014 — Client/server account contract failures (P1, fixed in client reliability unit)

**Area/impact:** Settings and tutorial progress did not sync, account history could
not replay, and successful deletion/signout could be reported as failure.
**Baseline evidence:** `packages/web/src/api.ts:74` parses JSON on every success;
`:149` posts raw settings; `:115` casts summary responses as full records.
`packages/server/src/app.ts` returns204 for mutations, expects `{settings}`,
and lists summaries without logs. `packages/web/src/app.ts:1037` disables
history rows without a log rather than fetching authenticated details.
**Reproduction:** Sign in, change Guided mode, reload; inspect failed PUT.
Open an account history row; the list has no log. Delete account; JSON parsing
of204 fails. These paths were missed by independent mock-only tests.
**Root cause/correction:** Mismatched wire contracts. Client now uses the
settings envelope, distinguishes successful empty settings from unavailable
service, handles204, types summaries explicitly and fetches details on demand.
Imports split into bounded count/byte batches; failed import remains retryable.
**Acceptance:** Real client methods against real HTTP handlers round-trip
preferences/progress, retrieve summary then detail, import205 records
idempotently, and recognize deletion/signout while rejecting missing CSRF.
**Proposed PR:** Client reliability; `packages/web/test/api-contract.test.ts`.
No live OAuth or PostgreSQL coverage is implied.

## DATA-015 — Dual-written guest history and invalid legacy import IDs (P1)

**Expected:** One completed match produces one history/stat/import record; old
history stays importable and imports remain idempotent.
**Baseline evidence/reproduction:** `packages/web/src/app.ts:1169` appends a
legacy history line and`:1180` a full record, while `localGameRecords():717`
concatenates both. Finish one guest game and inspect History/counts/import.
Converted legacy IDs use `legacy-index-date`, incompatible with the server's
UUID column/validator; the UUID fallback in `records.ts:28` also used `om-…`.
**Impact/root cause:** Duplicate game-level metrics and rejected legacy imports
from overlapping persistence generations and incompatible ID contracts.
**Correction:** Stop new legacy mirror writes. A pure read-time merge matches
old mirror pairs conservatively one-to-one (same length/rank/score and completion
within1second), retaining the full log/stats and all unmatched legacy summaries.
Underlying storage is preserved. Legacy conversion uses deterministic custom
UUIDv8 identifiers; new IDs use UUIDv4 format even on older browser runtimes.
**Acceptance:** Tests cover old-only, mirrored, distinct and repeated data,
stable UUID-form IDs and preserved full-record statistics. Import tests use the
actual HTTP UUID validator. Legacy-only human seat defaults to0 because that
format did not store a seat; raw data is retained for future migration.
**Proposed PR:** Client reliability. No schema migration or deletion is required.

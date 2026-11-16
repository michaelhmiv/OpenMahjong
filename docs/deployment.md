# Deployment and operations

The checked-in configuration describes reviewable deployment options; no
production change is performed by adding these files. Build with the
supported Node line documented in [contributing](../CONTRIBUTING.md).

## Observed production, 2026-11-16

Read-only Railway `describe-environment`, `describe-service` and
`environment-status` calls observed the existing OpenMahjong project:

| Resource | Observed state |
|---|---|
| web | Online, latest deployment SUCCESS, one replica, `main`, custom domain `openmahjong.app` |
| api | Online, latest deployment SUCCESS, one replica, `main`, custom domain `api.openmahjong.app` |
| Postgres | Online/SUCCESS, `postgres:17-alpine`, one persistent 5 GB volume |
| Environment | Production only; no staged/applying changes |
| Release checks | Both GitHub sources had `checkSuites:false` |
| Health/tracing | No configured deployment healthcheck path; tracing/auto-instrumentation off |

Four older failed web deployments were reported in the observation window;
the settled web deployment was healthy. Their existence is not evidence of
a current outage. Variable names, not values, were inspected: API had
`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Backups,
restorability, cost history and physical-device latency were not verified.

## Build and service definitions

```sh
npm ci
npm run typecheck
npm run build
npm run check:packages
npm test
npm run check:security
```

Libraries build engine→AI→coach. The package smoke imports the built package
entry points directly, without test aliases. API builds with
`npm run build --workspace=@openmahjong/server` and starts with
`npm start --workspace=@openmahjong/server`. Web builds with
`npm run build --workspace=@openmahjong/web` and starts with
`node packages/web/server.mjs`. Both listen on Railway's `PORT`.

`railway.api.json` and `railway.web.json` supply optional per-service config
paths using the existing commands plus `/healthz` checks. They do not
automatically select themselves or change existing Railway settings.
Selecting the appropriate config path is a reviewed release action.
API health currently checks process availability; it is not a DB recovery
or dependency-readiness test. Web health checks the built shell exists.

The browser build generates a content-versioned SW manifest from shipped
assets, including fonts and static privacy. Cache installation completes
before activation. Verify offline support with a fresh visit, SW control,
cleared HTTP cache, then network offline; a warm browser cache can hide a
broken precache. Use `npm run test:browser -- http://127.0.0.1:4173` against
a built server for screenshots, axe, reload/resume and offline evidence.
`BROWSER_FULL_GAME=1` exercises the complete-match/history and Review-to-Practice
path. Learning views require native physical 44px controls/11px text at 360px;
those measurements must not be inferred from the older scaled-table geometry.

## Release plan

1. Review and merge focused dependencies in order. A merge into `main` may
   trigger the existing production sources; merging is a release action.
2. Before release, enable waiting for successful CI in Railway and verify
   the branch/service scope. This session did not change that setting.
3. Rehearse migrations and data restoration on an isolated staging DB.
   Do not clone production secrets or private records into PR previews.
4. Select healthcheck/config paths, deploy the reviewed commit to staging,
   and observe terminal SUCCESS plus HTTP behavior before production.
5. Owner authorizes production release. Observe terminal deployment SUCCESS,
   health, guest play/lessons and account flows. A queued build is not a
   successful deployment.

No shared database schema migration is required by this implementation.
Current server hardening uses existing sessions/settings/games tables. Learning
evidence and saved decision references remain namespaced settings JSON. The
settings request bound is now 2 MiB, accommodating the bounded 2,000-attempt
practice model plus lesson snapshots and up to fifty decision references; tests
exercise the full history through real HTTP without truncation.
OAuth transaction state remains process-local: deployments can invalidate
in-flight sign-ins; multiple API replicas require shared state first.

## Recovery, privacy and cost

Document backup frequency, retention, RPO/RTO and a successful restore
rehearsal before relying on recovery claims. A persistent volume is not a
verified backup. Migration concurrency and local-memory fallback risks are
tracked in the [security/performance audit](audit/security-performance-audit.md).

Rollback must pair an app revision with compatible replay schemas,
settings and DB migrations. Back up namespaced learning settings before an older
client rollback: full-replacement writes from a client that omits the new keys
can overwrite newer cloud evidence. An old application that cannot understand new
v2 saves must not reinterpret them as v1. Retain backups and review schema
compatibility before rollback; do not delete services/volumes as recovery.

Monitor deploy failures, 5xx, CPU/memory, DB connections/storage and actual
cost. Prefer the current simple topology until measured traffic justifies
more infrastructure. Avoid storing private payloads/tokens in logs. Account learning cache/session keys
are scoped to account IDs; sign-out restores guest learning state, and account
deletion removes the corresponding local cache. Per-client serialized writes and
boot/online merges do not establish a durable outbox or concurrent-device conflict
resolution.
Representative 120-game simulations stay in PR checks; the disjoint 10,000-
game sweep runs weekly/on demand. Browser artifacts contain guest fixtures.


For the learning UI release, deploy the API identity/settings-budget change
before or alongside the web client. The client handles an older `/api/me`
without an opaque account ID conservatively: private learning evidence stays
in memory rather than entering the guest cache. Rollback must preserve the
namespaced learning fields; old full-replacement settings clients remain a
known compatibility/conflict risk rather than a solved distributed protocol.

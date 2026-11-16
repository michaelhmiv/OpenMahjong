# @openmahjong/web

The Vite browser client for OpenMahjong: guest riichi play against AI, eleven
introductory lessons, guided hints, table/Focus Frame interaction, hand and match
breakdowns, local history, thirteen curated Practice exercises, player-perspective
decision Review and optional Google account persistence. Approved v7 learning
layouts retain the v6 dark felt green/gold palette, Fraunces/Figtree and existing
table geometry; see
[design rules](../../docs/design-rules.md).

The engine owns legal transitions and scoring; the renderer must not introduce a
second rules implementation. Engine behavior is still verified against independent
fixtures: source authority does not make an incorrect rule true.

## Runtime ownership

| Module | Responsibility |
|---|---|
| `src/model.ts` | Fold engine events into table presentation state |
| `src/drivers.ts` | Human suspension and current/legacy AI policy adapters |
| `src/runner.ts`, `src/replay.ts` | Deterministic decision replay, validated versioned saves and historical behavior compatibility |
| `src/review.ts`, `src/review-ui.ts` | One-pass recorded-action reconstruction, frozen player-perspective decisions, hand/decision navigation, discard comparison and public table details |
| `src/app.ts` | Screen routing, table controls, animation, lessons, Focus Frames, hand/match results, Practice/Review integration and account orchestration |
| `src/tutorial.ts` | Existing lesson interactions and real seeded gameplay scenes |
| `src/education/`, `src/practice-ui.ts` | Versioned curriculum, bounded lesson progress, curated exercise validation, Practice controls, assistance-aware evidence, due/unseen recommendations and saved review references |
| `src/learning.css` | Approved native-width learning layouts with scrollable content and persistent navigation |
| `src/settings.ts` | Guest-local settings, in-progress game and private history |
| `src/api.ts` | Optional authenticated account HTTP client; session cookie/CSRF remain server-owned |
| `src/sound.ts` | Quiet synthesized tile clicks |
| `public/sw.js`, `vite.config.ts` | Build-versioned offline shell and asset precache |

New games use the current engine and AI revisions. Version-1 saves keep an
isolated historical implementation rather than silently changing their result;
see the [replay contract](../../docs/architecture/replay.md). Reconstructing the
whole match on each human action remains a measured-performance follow-up, not an
incremental engine/snapshot API.

Learn exposes Practice without an account. All thirteen starter exercises support
explicit checking, corrective retry and resumable selections; assistance and retry
counts remain separate from independent first-answer accuracy. Recommendations
use transparent due/unseen evidence and never lock category selection. Results
and History expose Review, which navigates recorded hands/decisions, compares
physical discard options and saves up to fifty record/decision references for
related practice and return to the original decision. A saved reference is not a
generated, validated graded puzzle. Advanced curriculum, a full difficulty ladder,
calibrated call/EV grading and full-information mode remain separate work; see the
[implementation register](../../docs/audit/implementation-status.md).

## Storage and information boundaries

Guest settings, lesson/practice progress, saved decision references, saves and
history use browser storage. Full or
blocked storage can prevent persistence; clearing site data removes local records.
Optional accounts store private records/settings through `packages/server`, backed
by Postgres in production. Learning caches and practice sessions are scoped by
account ID; sign-out restores guest learning state, and account deletion removes
the corresponding local learning cache. Sign-in merges guest and account evidence,
serializes this client's settings writes, and retains local data after failed saves
for a later boot/online merge and retry. This is not a durable outbox or a complete
concurrent-device conflict resolver. Guest play does not depend on API availability.
Client-submitted results are private, unrated records, never official rating input.

Internal engine events may contain hidden tiles. AI/coach inputs are restricted
to the legitimate player view. Review reconstructs information at the decision boundary; legacy v1 review is
display-only. Full-information inspection is not implemented and would require a
separately labeled mode that cannot contaminate advice.

The production build precaches its shipped shell, scripts, styles, fonts and
privacy document as one revision. Offline availability starts after installation
completes; a successful same-session reload with a warm HTTP cache is insufficient
proof. The browser smoke clears HTTP cache while preserving service-worker
CacheStorage, then reloads and plays offline. Browser storage is not a backup.

## Development and build

From the repository root, using a runtime supported by the root `engines` range:

```sh
npm ci
npm run dev --workspace=@openmahjong/web -- --host 0.0.0.0
npm run build --workspace=@openmahjong/web
PORT=4173 node packages/web/server.mjs
```

Vite bundles workspace libraries from source; an engine/AI prebuild is unnecessary
for the web build. `server.mjs` serves `packages/web/dist` and the standalone
`/privacy` document. The account service is a separate Node server, not part of the
static bundle. Existing Railway services and release/rollback considerations are
in the [deployment guide](../../docs/deployment.md); building a PR is not permission
to deploy production.

## Verification

From the repository root:

```sh
npm run typecheck --workspace=@openmahjong/web
npx vitest run packages/web/test --maxWorkers=2
BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/browser-smoke.mjs http://127.0.0.1:4173 work/browser-smoke
```

The final command needs the built static server and Chromium. It records actual
viewports, keyboard/accessibility, persistence and offline evidence using a guest
API fixture. `BROWSER_FULL_GAME=1` adds the complete-match/history and Review-to-Practice path.
The learning checks measure native 44px controls/11px text, actual fonts, scroll
navigation, feedback and reload behavior at the six representative viewports.
See [testing strategy](../../docs/testing/strategy.md) for the full repository gates,
physical-device/production limitations and the distinction between model tests and
a complete learner journey.

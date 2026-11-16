# Testing and evidence strategy

Tests protect actual behavior. Neither a high test count nor agreement between
an evaluator and the policy it shares establishes expert strategy or complete
rules correctness. Use independently derived fixtures where a false rule could
otherwise be repeated in both code and expected output.

## Verified baseline

An untouched checkout at `989927ba57dde781a4a856eaa2bbb6a1d01afb4b` was checked
separately from implementation edits on November 16, 2026:

| Command / scope | Observed result |
|---|---|
| `npm ci --ignore-scripts --cache /workspace/work/baseline-npm-cache` | Completed successfully in the isolated baseline checkout |
| `npm run typecheck` | Clean across workspaces |
| `npx vitest run --maxWorkers=2` | 603 tests in 23 files passed; reported duration 250.75s |

The cache path is an environment-specific reproducibility detail, not a required
contributor path. `npm ci` is the normal setup command. Baseline suite success did
not expose the independently found scoring, wall, auth, teaching and packaging
issues; the added regressions must exercise those cases.

Separate baseline artifact reproduction: all three library build commands
completed, then actual Node imports of engine, AI and coach each failed with
`ERR_MODULE_NOT_FOUND` at their promised `dist/index.js` paths.

Focused library packaging verification during implementation: clean ordered
engine → AI → coach builds and `node scripts/check-package-imports.mjs` passed.
Other implementation test counts/results belong in the exact PR verification
report after all concurrent changes are integrated. Do not reuse baseline counts
as a claim about a later commit.

## Fast local and PR gates

Use a supported runtime: Node 22.22.2+ or Node 24.15+ in their supported release
lines, matching the root `engines` range and lockfile. The baseline was evaluated
with its original tooling; the implementation updates the test runner separately
to address dependency advisories and rechecks behavior after that upgrade.

```sh
npm ci
npm run typecheck
npx vitest run --maxWorkers=2
npm run build --workspace=@openmahjong/engine
npm run build --workspace=@openmahjong/ai
npm run build --workspace=@openmahjong/coach
node scripts/check-package-imports.mjs
npm run build --workspace=@openmahjong/web
npm run build --workspace=@openmahjong/server
```

Run focused tests while iterating, then the appropriate complete gates. Preserve
existing tests. Simulation-heavy tests carry explicit time budgets; do not bypass
a failure by filtering it out or loosening correctness assertions. Record actual
runtime/device/seed configuration when interpreting a performance result.

Library builds use src-only configs and emitted dependency declarations. The
Node import smoke is necessary because Vitest/Vite source aliases intentionally
avoid the package entry points; source tests alone cannot catch a wrong `main`,
`exports` or declaration output path.

## Coverage and independent oracles

| Boundary | Required checks |
|---|---|
| Tiles/hand analysis | Four physical copies, valid counts/notation, standard/seven-pairs/orphans forms; independent hand-worked positions and fast-vs-reference disagreements investigated |
| Scoring | Legal/illegal hand validation, each yaku and exclusions, open reductions, fu/wait interpretation, dealer/nondealer/honba/sticks and limits; written independent derivations |
| Hand/match state | Live/dead/rinshan conservation, kan caps/timing, riichi/furiten/ippatsu, call priority, draws, dealer rotation/termination and score conservation |
| Replay | Same version/seed/actions → same events; historical immutable v1 fixtures; unknown version/corruption/excessive input rejection; illegal action rollback and no duplicate results |
| AI/coach | Physical visibility counted once; exact drawn tile identity; no hidden/future information; multiple-threat safety; qualified evidence; policy agreement is consistency only |
| Education | Correct/incorrect answers, retry without advancement, all scenario states legal, every module completable, resume/restart/version migration and content/ruleset compatibility |
| Practice/progress | Independently checked answers, accepted alternatives, idempotent attempt identity, assisted evidence separation, scheduling boundaries and local/account merge cases |
| Account HTTP | Browser-bound one-use OAuth state, expiry/replay, sessions/CSRF/CORS, private ownership, bounded bodies/counters, correct envelope and 204 handling, import idempotency |
| Database | Real Postgres migrations from clean and prior schema, cascade deletion, indexes/query plans, concurrent migration and backup restore rehearsal; memory-store tests do not prove these |
| PWA/build | Actual served artifact, service-worker update across two builds; clear HTTP cache while preserving CacheStorage before offline navigation/reload; include fonts/privacy, missing assets/error paths and cache isolation |

## Browser checks

Use a real browser for actual visual/interaction assertions. jsdom cannot prove
layout, tile readability, responsive geometry, media queries, OS installation,
service-worker behavior or physical phone performance. Record whether a check
uses local Chromium, production, an authenticated account, or a physical device.

Representative viewport suite: 360×800, 390×844, 412×915, tablet portrait/landscape
and 1440×900. Capture arrival, Learn, lesson feedback/completion, normal and Large
Tiles table, call/riichi prompts, Focus Frames, hand results, Settings and History.
Inspect screenshot files, geometry, console/network errors, keyboard focus and
accessibility labels. Automated accessibility checks supplement manual keyboard
and assistive-technology review; they do not certify WCAG compliance.

The current [UX audit](../audit/ux-accessibility-audit.md) identifies exact tested
paths/artifacts and unverified cases. Production Google consent, PWA OS install,
mobile 60fps and database recovery must never be inferred from a desktop screenshot.

The repeatable smoke script uses the built static app, Playwright and axe:

```sh
npm run build --workspace=@openmahjong/web
PORT=4173 node packages/web/server.mjs
# In another terminal, with Chromium installed:
BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/browser-smoke.mjs http://127.0.0.1:4173 work/browser-smoke
```

The script saves screenshots, geometry, axe findings and a JSON result report.
`BROWSER_FULL_GAME=1` additionally completes a real East match and opens its
History result. The default account API is a guest fixture: this does not test
production Google consent or authenticated cross-device synchronization. Use
`BROWSER_NO_SANDBOX=1` only in an isolated container that requires it; the script
does not disable TLS verification by default. Review the images as well as the
automated checks, and record the browser/runtime and the exact built commit.

## Integrated learner acceptance

The required end-to-end path remains a product gate:

1. Arrive as guest, start tile lesson, make a wrong answer and retry correctly.
2. Complete introductory interactions and start guided play without an account.
3. Complete a real match and inspect meaningful decision-level review.
4. Practice an identified concept, return to play and reload with progress intact.
5. Repeat with offline interruptions and then optional account synchronization.

Steps involving an unimplemented Review/Practice surface remain unverified until
the real interface exists; pure model tests cannot mark the journey complete.
No account or live user data should be created/deleted merely to make a test pass.
Use explicit test identities or mocked providers for destructive account scenarios.

## Expensive tests and operational evidence

Baseline CI runs a bounded Vitest gate plus an eight-shard 10,000-game AI soak
on every PR/push. The reliability unit moves that full soak to a weekly/manual
job while retaining the default 120-game legality/conservation soak in PR tests.
The full job keeps eight disjoint seed ranges of 1,250 games and the same assertions;
its result is distinct from the bounded PR gate. Check the workflow for the exact
schedule and report executed counts rather than implying 10,000 games ran locally.

Track startup, late-game replay/analysis p50/p95, peak memory and bundle size
with named builds/seeds/runtimes. A desktop timing is not a midrange-phone timing.
Heavy deeper analysis must be cancellable and cannot delay an ordinary legal
move. Collect production health/log/metrics only within authorized read scopes;
a terminal Railway SUCCESS is deployment evidence, while backup availability
requires restore evidence.

Each PR reports exact commands, results, skipped/unverified checks, relevant
artifacts and remaining risks. Do not invent screenshots, benchmarks, database
checks or CI statuses.

# Review, in-person tools and variant implementation

Implementation date: 2026-11-17. Baseline `main` was refreshed through the
connected GitHub tools and local Git at
`da4b27b06079637bf9afe9239017a7b298035502`. The five issue bodies and every comment
are retained in the [program record](../implementation-program.md), including the
owner's exception to intermediate design-approval gates. No photo input, production
deployment, merge, paid provisioning, repository permission change or issue comment
is part of this work.

## Acceptance map

| Issue | Implemented behavior | Main evidence and documentation |
| --- | --- | --- |
| [#39](https://github.com/michaelhmiv/OpenMahjong/issues/39) | Standings/settlement, every hand, hand-time winner wind, indexed board review, event/significant/decision seeking, immutable public comparisons, Practice return, active-game isolation and legacy display-only review | `board-review.test.ts`, `review.test.ts`, browser smoke and timeline reports; [review architecture](../architecture/review.md) |
| [#31](https://github.com/michaelhmiv/OpenMahjong/issues/31) | Riichi and all three new variant tile/fast calculators, American entered-card-value helper, reasoned corrections and confirmation, named four-player ledgers, deposits/draws/simultaneous wins/penalties, undo/recomputation/settlement, offline storage and private conflict-preserving sync | Engine/web/server in-person tests, real PostgreSQL tests, calculator and two-device sync browser reports; [ledger/API brief](../architecture/in-person.md) |
| [#32](https://github.com/michaelhmiv/OpenMahjong/issues/32) | Hong Kong Old Style Clear Chapter adapter, flowers, eligibility/scoring/payments/progression, CPU driver, lessons/coaching/review/practice, resume/history/statistics and calculator | Hong Kong fixtures, variant integration/legality tests, complete mobile/desktop matches; [rules brief](../rules/hong-kong.md) |
| [#33](https://github.com/michaelhmiv/OpenMahjong/issues/33) | Frozen WMO 2006 MCR adapter, all 81 patterns and exclusions, eight-before-flowers eligibility, payments, full lifecycle and the same complete learning/play/manual stack | Independently composed all-81 fixtures and numeric table, exclusions, integration tests, complete browser matches; [rules/provenance](../rules/mcr.md) |
| [#34](https://github.com/michaelhmiv/OpenMahjong/issues/34) | Named Taiwanese Every-flower/no Ting/30–10 adapter, five sets/16–17 tiles, restrictions/replacements, tai and per-payer dealer bonuses, full play/learning/manual stack, Large Tiles and Focus Frames | Taiwanese fixtures, independent DFS/fast-analysis comparison, physical-inventory soak, full-stack and browser sizing/resume tests; [rules brief](../rules/taiwanese.md) |

American remains a payment helper, not a playable variant. In-person sessions stay
outside CPU statistics. Each new variant owns its inventory, hand structure, legal
contexts, public projection, scoring, payments and lifecycle rather than executing
the Riichi controller with flags. See [variant architecture](../architecture/variants.md).

## Repository gates

Environment: Linux, Node **24.22.1**, npm **11.9.0**, Chromium **156.0.8078.79**,
PostgreSQL **17** in an ephemeral loopback-only fixture. The Node version satisfies
the current root manifest. Logs accompany the local evidence archive.

| Exact command | Result |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache` | Pass; 87 packages installed |
| `npm run typecheck` | Pass; all five packages |
| `npm test` | Pass; 63 files passed, 1 opt-in file skipped; **1,097 passed, 3 opt-in PostgreSQL tests skipped (1,100 total)**; 652.30 s |
| `npm run build` | Pass for engine, AI, coach, server and web; main JS 498.71 KB, legacy 38.03 KB, MCR 88.88 KB, CSS 52.05 KB |
| `npm run check:packages` | Pass; built engine/AI/coach import checks |
| `npm_config_cache=/workspace/.npm-cache npm run check:security` | Pass; zero audit vulnerabilities |
| `OPENMAHJONG_TEST_DB=postgresql://postgres@127.0.0.1:55432/openmahjong_test npx vitest run packages/server/test/postgres-integration.test.ts --maxWorkers=2` | Pass; 3 real-database tests, including clean/upgrade/concurrent migrations, all variant mappings, revisions, duplicates, ownership and deletion |
| `EMXX=/workspace/mahjong-research/emsdk/upstream/emscripten/em++ scripts/build-mcr-scorer.sh` followed by `cmp` against the checked-in runtime | Pass; byte-identical pinned source rebuild; SHA-256 `fa91d99cf8cc5ad209b13e664c93166f0f11510e67c0659c31957d32795ec3ce` |
| `git diff --check` | Pass |

The first full suite reported two five-second timeouts in existing exhaustive-wall
Riichi rule fixtures under two-worker contention, without failed result assertions.
Four expensive rule fixtures now have explicit bounded 30-second budgets; their
assertions and game behavior are retained. The focused recheck passed all 25 tests.
An incomplete attempt without loopback listener access was stopped; the final
command runs with test-network access. A final primary-source audit corrected
the 2006 mixed-kong combination from individual 1+2 awards to the six-point
combination specified under pattern 57. The independent regression hand totals
nine (6+1+1+1), meets the eight-fan minimum and pays 17/8/8 on a discard win.
The catalog remains 81 patterns. All 102 affected scorer/content/calculator
checks passed before the final whole-suite rerun.

## Browser commands and results

The built app was served with `PORT=4173 node packages/web/server.mjs`.
These container runs set `BROWSER_NO_SANDBOX=1`; the reusable scripts retain the
browser sandbox by default elsewhere. Each new-surface script asserts no uncaught
page errors and no axe violations in its inspected surfaces.

| Command after `BROWSER_NO_SANDBOX=1` | Result |
| --- | --- |
| `BROWSER_FULL_GAME=1 npm run test:browser -- http://127.0.0.1:4173 work/browser-smoke` | **42/42** checks: 360/390/412/768/1024/1440 viewports, keyboard/focus/reduced motion, accessibility, learning, complete Riichi game, review/Practice and cold-cache offline use |
| `node scripts/browser-in-person.mjs http://127.0.0.1:4173 work/program-evidence/riichi-tools` | Pass at 390/1440: tile and han/fu entry, payments, correction, undo, scorekeeping, settlement and offline reload |
| `node scripts/browser-variants.mjs http://127.0.0.1:4173 work/program-evidence/variants hong-kong` | Pass at 390/1440: complete matches in 91/95 UI actions, Play/Table/coach/Learn/history/review/Practice return |
| `node scripts/browser-variants.mjs http://127.0.0.1:4173 work/program-evidence/variants mcr` | Pass at 390/1440: complete matches in 74/79 UI actions and the same feature traversal |
| `node scripts/browser-variants.mjs http://127.0.0.1:4173 work/program-evidence/variants taiwanese` | Pass at 390/1440: complete matches in 64/147 UI actions and the same feature traversal |
| `node scripts/browser-variant-calculators.mjs http://127.0.0.1:4173 work/program-evidence/calculators` | Pass for HK/MCR/Taiwanese/American at 390/1440: both applicable inputs, payments, corrections, undo, settlement and cold-cache offline reload |
| `node scripts/browser-variant-sizing.mjs http://127.0.0.1:4173 work/program-evidence/sizing` | Pass for all three variants at 360/390/1440: late ponds, 13th-discard condensation, Large Tiles, keyboard Focus Frames, call windows and offline resume |
| `node scripts/browser-review-timeline.mjs http://127.0.0.1:4173 work/program-evidence/review` | Pass at 390/1440: current and frozen legacy review, exact Practice return, active-game byte preservation and measured long-record seeking |
| `node scripts/browser-table-sync.mjs http://127.0.0.1:4173 work/program-evidence/sync` | Pass with two isolated browser stores and real local HTTP handlers: private carry-over, offline edit/reload, no unauthenticated sync, revision conflict, Keep Both and fixture account deletion |
| `node scripts/index-program-evidence.mjs work/program-evidence` | Creates the screenshot/report gallery; 208 screenshots before final indexing |

The private-sync fixture creates only disposable synthetic identities and runtime
credentials. It never logs cookie/CSRF values. Chromium's online hint became true
after offline navigation while uncached requests still failed; the app therefore
selects remembered local account data independently of that hint, and requires
fresh same-account authentication for writes. The script verifies actual failed
uncached network requests, local reload, and authenticated reconnection.

## Timeline measurement

Seed `review-performance-mcr`: **16 hands, 3,058 events, 1,674 decisions**. A single
reconstruction builds 16-event checkpoints; each seek folds at most 15 events.
The script measures 100 synchronous seek/update samples and 40 two-frame samples
while switching hands and positions. Cold coach calculations are included in DOM
time. Other browser/test workloads were stopped during this measurement.

| Viewport width | Open details + first board | DOM p50 / p95 | Two-frame p50 / p95 | JS heap sample |
| --- | ---: | ---: | ---: | ---: |
| 390 | 989 ms | 4.0 / 71.2 ms | 44.0 / 156.6 ms | 32.8 MB |
| 1440 | 772 ms | 4.7 / 65.4 ms | 44.5 / 138.6 ms | 40.8 MB |

These describe desktop Linux Chromium with mobile/desktop viewports. They are not
physical phone measurements, hard real-time guarantees or production telemetry.

## Compatibility, delivery and limits

Existing Riichi defaults, policy and frozen legacy sources are retained. Riichi
payment extraction changes the caller, not its arithmetic. Current-engine live-wall
display accounts for quad replacement; historical engine-one display retains its
old behavior. Schema 1 remains display-only in review. New records pin schema 3,
engine 3, policy 1 and canonical profile/version; unknown combinations fail shared
client/server validation. Migrations 006/007 are additive and tested from clean and
prior-five-migration schemas. CPU records remain private, unrated client claims;
the server does not certify their outcomes.

Saved-decision references now accept indices through 49,999, matching the largest
supported schema-three log. Their record ID resolves the variant/version and the
actual recorded decision; existing 20,000-decision Riichi replay bounds remain
unchanged. Boundary tests preserve both old and new reference ranges.

The new browser checks and real PostgreSQL fixture are wired into GitHub CI.
[Run 82](https://github.com/michaelhmiv/OpenMahjong/actions/runs/44040856735)
passed build/typecheck/security/package checks, **1,097 tests** (three opt-in
PostgreSQL tests skipped in that job), the separate **three real PostgreSQL tests**,
and the entire browser job on Node **22.23.4**. Its implementation commit is
`959028716642e5d25ade2285585506f74b1c069c`, including the MCR correction and
long-reference fix. The browser-evidence artifact contains the reproducible
screenshots/reports. Subsequent documentation-only commits have the same executable
code; [PR checks](https://github.com/michaelhmiv/OpenMahjong/pull/42/checks) show
the current status.
No production rollout or live OAuth consent/cookie verification was performed.
The ordinary suite includes the representative 120-game Riichi soak and a 24-match
new-variant inventory/legality/conservation soak; the separate scheduled 10,000-game
sweep is not claimed here. No external tournament certification or physical-device
test is implied.

Completed-app images and machine-readable reports are indexed in
`work/program-evidence/index.html`, with logs in `work/program-verification/` and
the original smoke report in `work/browser-smoke/`. The gallery contains game
details, board/comparison review, both calculator inputs, payment breakdowns,
scorekeeping/corrections/settlement, offline/sync conflicts, and representative
Play/Learn/Table/coach/Practice/history for every new variant. All rendered account
and game data are synthetic. The source-controlled browser scripts reproduce them.

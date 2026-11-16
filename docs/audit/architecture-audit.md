# Architecture audit

Audit date: November 16, 2026. Baseline: `main` at
[`989927ba57dde781a4a856eaa2bbb6a1d01afb4b`](https://github.com/michaelhmiv/OpenMahjong/tree/989927ba57dde781a4a856eaa2bbb6a1d01afb4b).
Evidence below deliberately points to that immutable snapshot. Changes in the
implementation PRs do not make the original observations disappear.

## Discovery and scope

This is an existing TypeScript/npm-workspaces application, not a prototype to
replace. The repository contains five working packages, a real riichi engine,
AI, coaching, eleven lessons, guided play, anonymous persistence, Google accounts,
account history/settings, and a service worker. No technology-stack change is
justified by this audit.

At discovery, the default branch was `main`. Recent merged changes include
[#15](https://github.com/michaelhmiv/OpenMahjong/pull/15) (tutorial and coach),
[#16](https://github.com/michaelhmiv/OpenMahjong/pull/16) (responsive fitting), and
[#17](https://github.com/michaelhmiv/OpenMahjong/pull/17) (approved green v6 design).
Open PRs [#18](https://github.com/michaelhmiv/OpenMahjong/pull/18) (manifest copy)
and [#19](https://github.com/michaelhmiv/OpenMahjong/pull/19) (master brief) must be
reviewed independently; their changes are not duplicated here. The connected
GitHub issue search returned no open issues at discovery. Remote historical
feature branches remain; their presence alone is not evidence of active work.

The audit combines source inspection with the separate browser, security,
education, AI, and rules investigations. Passing tests establish the assertions
actually executed, not complete mahjong correctness. Verification details live in
[testing strategy](../testing/strategy.md) and the individual implementation PRs.

## Verified package inventory

| Package | Actual baseline responsibilities | Boundary and evidence |
|---|---|---|
| engine | 136 physical tile instances, seeded walls, three shanten forms, scoring, complete synchronous matches and events | No runtime dependencies or DOM; `src/game.ts:113` defines legal contexts and `:183` player-visible state |
| ai | Memoized hand analysis, efficiency/value heuristics, riichi/call policy, riichi-focused defense | Depends on engine `PlayerView`; source/runtime information-boundary tests exist |
| coach | Ranked legal discard candidates, structured facts/reasons, rendered headline and riichi advice | Uses the AI evaluator; does not constitute an independently calibrated expert engine |
| web | DOM screens, table model/event folding, animation, replay driver, lessons, local persistence, API client and PWA | Engine is bundled from source through Vite aliases; account calls are optional for play |
| server | Google OAuth, hashed-token sessions, CSRF checks, user-scoped private records, settings and statistics | Node HTTP + `pg`; memory store for tests/development and Postgres store for production; no authoritative live match coordinator |

The baseline README omitted `server`. Its web package documentation still
mentioned v5, local-only storage and slice-1 static hosting despite actual v6 and
accounts. [Current architecture](../architecture/overview.md) replaces those
current-status claims while retaining the historical brief.

## Findings

Severity follows the master brief: P0 critical, P1 high, P2 medium, P3 low.
Complexity is an engineering estimate, not a delivery promise: S localized,
M several modules/tests, L new system or substantial state migration.

### ARCH-001 — P1: replay format does not identify executable behavior

- **Area / impact:** resume and history. Rules corrections can reinterpret a
  stored match or desynchronize the decision stream, threatening trusted records.
- **Expected:** a stored record identifies schema, engine behavior and ruleset;
  historical decisions reproduce the same events after an upgrade.
- **Observed:** [`runner.ts:80`](https://github.com/michaelhmiv/OpenMahjong/blob/989927ba57dde781a4a856eaa2bbb6a1d01afb4b/packages/web/src/runner.ts#L80)
  saves `v:1`, seed, length, seat and decisions without engine/ruleset identity;
  `restore` at line256 always invokes the current `Game`.
- **Reproduction:** save a v1 game containing a kan, then replay it with corrected
  kan wall accounting. The next draw/call context can differ despite identical
  seed and recorded actions. Use a checked-in legacy fixture, not this description
  alone, as the regression proof.
- **Root cause:** determinism is assumed across implementation revisions rather
  than within a named executable version.
- **Correction / proposed PR:** replay compatibility PR, coupled to engine fixes:
  validate a versioned envelope; isolate the historical implementation; route v1
  records to it; identify new records explicitly. Do not silently rewrite old scores.
- **Acceptance:** old event-prefix fixtures round-trip byte-for-byte, new records
  name supported versions, unsupported/corrupt inputs fail before execution, and
  restored records do not create duplicate results. **Complexity:** M.

### ARCH-002 — P2: every human action rebuilds the entire match

- **Area / impact:** responsiveness and future decision navigation; runtime cost
  grows with history rather than only the new action.
- **Expected:** ordinary actions remain responsive late in long matches and
  repeated review seeks have measured, bounded work.
- **Observed:** [`runner.ts:118`](https://github.com/michaelhmiv/OpenMahjong/blob/989927ba57dde781a4a856eaa2bbb6a1d01afb4b/packages/web/src/runner.ts#L118)
  starts a fresh game at line206 for each `advance`; `act` at line232 calls it
  again. `tutorial.ts:208` describes the same reconstruction pattern.
- **Reproduction:** record action counts and elapsed `advance` time near match
  start and end on the same seeded game/device. Sequential reconstruction creates
  cumulative work proportional to the sum of replayed prefixes; this is a code
  complexity finding, not a measured mobile latency claim.
- **Root cause:** synchronous engine policy calls are suspended by exceptions;
  the runner cannot continue an existing engine stack.
- **Correction / proposed PR:** benchmark first; add a stable decision index for
  review; introduce an explicit engine step/snapshot API only when measured gains
  justify its state/serialization cost. Keep the validated replay contract.
- **Current stack:** `packages/web/src/review.ts` reconstructs recorded actions
  once into a hand/decision index and frozen player-perspective views. This fixes
  neither the ordinary `GameRunner.act` reconstruction cost nor the absence of a
  measured mobile latency/memory baseline; the finding remains open for gameplay.
- **Acceptance:** publish device/runtime, seeds, action counts, p50/p95 latency
  and memory before/after; identical event output; no UI blocking during deep
  analysis; snapshot restore matches full replay. **Complexity:** L.

### ARCH-003 — P2: UI ownership and async account work concentrate in one module

- **Area / impact:** regression risk when adding practice/review or changing sync.
- **Expected:** lesson progression, replay/analysis and account synchronization
  have independently testable owners; screen rendering consumes their results.
- **Observed:** baseline `app.ts` has 2,518 lines and owns auth boot (`:647`),
  settings writes (`:690`), import (`:744`), history/replay (`:997`), game lifecycle
  (`:1112`), animation and table controls. `tutorial.ts` has 1,159 lines containing
  content, progress parsing, replay scenes, and controller behavior.
- **Reproduction:** trace one lesson completion through `LessonController`,
  `App.persistTutorial`, localStorage and `putSettings`; adding a lesson or new
  progress evidence currently touches several responsibilities in these owners.
- **Root cause:** successful initial slices accumulated responsibilities faster
  than reusable education/analysis contracts were introduced.
- **Correction / proposed PR:** nonvisual education/practice data modules first;
  next extract an account-sync coordinator and small screen controllers when
  adding their real workflows. Do not rewrite the DOM framework for file size.
- **Acceptance:** new exercise validation and progress scheduling are pure and
  tested without DOM; existing lessons/guest play keep working; new review logic
  does not grow the central UI controller with analysis algorithms. **Complexity:** M.

### ARCH-004 — P2: event names are typed; their payloads are not

- **Area / impact:** engine-to-model/review compatibility and refactor safety.
- **Expected:** discriminated event payloads make required fields available after
  narrowing by event type; wire data is validated separately.
- **Observed:** [`game.ts:81`](https://github.com/michaelhmiv/OpenMahjong/blob/989927ba57dde781a4a856eaa2bbb6a1d01afb4b/packages/engine/src/game.ts#L81)
  declares `[key:string]:unknown`. Consumers use casts such as
  `model.ts`'s `apply` and `records.ts:39`; a missing field is not rejected by
  TypeScript's event-name union.
- **Reproduction:** remove a required event payload property in an isolated
  branch and typecheck producers/consumers; the broad dictionary can hide it.
- **Root cause:** an animation log contract grew without payload schemas.
- **Correction / proposed PR:** typed event contract and runtime-validation PR;
  define exhaustive payload types and adapt the legacy log at its boundary.
- **Acceptance:** every event has a tested payload contract, producer omissions
  fail typecheck, unknown wire event/schema versions are rejected, and current
  model folds/deterministic logs agree. **Complexity:** M.

### ARCH-005 — P1: successful source-aliased tests hide broken package entry points

- **Area / impact:** standalone engine library and downstream contributors.
- **Expected:** the public package entry and declaration paths exist after build,
  and Node can import engine, AI and coach without test/bundler aliases.
- **Observed:** [`engine/package.json:7`](https://github.com/michaelhmiv/OpenMahjong/blob/989927ba57dde781a4a856eaa2bbb6a1d01afb4b/packages/engine/package.json#L7)
  promises `dist/index.js`, while `engine/tsconfig.json` uses `rootDir:'.'`,
  includes tests and emits `dist/src/index.js`. AI/coach source path mappings pull
  sibling source trees into their inferred output roots. Vitest/Vite aliases
  bypass those published entries.
- **Reproduction:** clean `dist`, build the libraries, then run Node imports of
  `@openmahjong/engine`, `@openmahjong/ai`, and `@openmahjong/coach` from the repo.
- **Observed reproduction:** all three baseline library builds completed; Node
  imports then failed with `ERR_MODULE_NOT_FOUND` for each declared
  `dist/index.js`. The corrected ordered builds/import smoke passed.
- **Root cause:** one TS config served both source-based monorepo checks and
  distributable-library output.
- **Correction / proposed PR:** packaging fix: separate src-only build configs,
  compile engine → AI → coach against built declarations, clean stale output,
  and add `scripts/check-package-imports.mjs`. Typecheck still covers source/tests.
- **Acceptance:** clean ordered builds and source-free import smoke pass; emitted
  declarations exist; tests are not packaged as runtime output; legacy imports
  use supported package subpaths. **Complexity:** S.

### ARCH-006 — P2: CI omits built-artifact and real-browser checks

- **Area / impact:** release confidence. Source tests cannot verify packaging,
  service-worker updates, actual accessibility or visual geometry.
- **Expected:** fast PR gates include deployable builds and a focused browser
  smoke; expensive stochastic soaks have an explicit operational budget.
- **Observed:** [CI at baseline](https://github.com/michaelhmiv/OpenMahjong/blob/989927ba57dde781a4a856eaa2bbb6a1d01afb4b/.github/workflows/ci.yml#L17)
  installs, typechecks and runs Vitest. A separate eight-job 10,000-game soak runs
  for every PR/push; no build/browser/security audit step appears in that workflow.
- **Reproduction:** inspect job steps and compare with the source-free package
  import failure above; source green does not prove the served build works.
- **Root cause:** CI inherited correctness-slice gates before deployment and
  educational-browser workflows expanded.
- **Correction / proposed PR:** build/import/browser CI PR; preserve existing
  correctness tests, publish audit artifacts, and consider moving the full soak
  to scheduled/manual runs after retaining a bounded PR smoke.
- **Acceptance:** clean build and library imports gated; beginner guest smoke in
  actual Chromium; dependency security report reviewed; expensive-job placement
  explicitly documented. **Complexity:** M.

### ARCH-007 — P2: historical requirements are presented as current truth

- **Area / impact:** contributor decisions, privacy/copy accuracy and scope.
- **Expected:** one current decision register identifies superseded requirements
  without editing historical approvals retroactively.
- **Observed:** `README.md` says teaching/coaching comes later; web README claims
  v5/local-only/no server; `brief-v1.md:25` says no ads/no accounts and a light
  toggle, whereas v6 design law and shipped accounts supersede those decisions.
  The manifest issue already belongs to open PR#18.
- **Reproduction:** follow root README → package web README → current Settings
  and compare account/theme/storage statements.
- **Root cause:** package docs were not updated after later slices and approvals.
- **Correction / proposed PR:** audit/current-architecture docs PR; use
  [product decisions](../product/vision.md#current-decisions-and-authority), link
  current implementation docs, retain the original brief as historical.
- **Acceptance:** setup and package inventory match actual code; AGPL/guest/free
  floors remain; ads are not incorrectly ruled out; future variants/multiplayer
  are clearly proposals. **Complexity:** S.

### ARCH-008 — P2: the promised variant seam is not an executable variant system

- **Area / impact:** roadmap estimates and safe future expansion.
- **Expected:** status distinguishes a riichi rules descriptor from a generic
  game family; other variants get dedicated legality/scoring/curriculum tests.
- **Observed:** `game.ts:56` hardcodes East, 25,000/30,000 stakes and uma;
  `tiles.ts:15` fixes 34 types ×4; scoring, furiten, riichi and round advancement
  are directly embedded. No ruleset object selects a distinct implementation.
- **Reproduction:** attempt to express jokers/Charleston or MCR fan requirements
  with the current `GameOptions`; there is no such configuration contract.
- **Root cause:** documentation described intended future abstraction as an
  already established seam.
- **Correction / proposed PR:** explicit versioned current-rules descriptor now;
  [variant design](../architecture/variants.md) before implementing a second game.
- **Acceptance:** no advertisement of unsupported variants; replay/content IDs
  bind to riichi's rules; a second variant has authoritative fixtures and a
  dedicated controller where mechanics differ. **Complexity:** L for variants,
  S for honest current-state docs.

## Other subsystem findings

Rules and scoring defects take precedence over architectural expansion; see
[rules compliance](rules-compliance.md). Information-integrity/heuristic claims
are covered by [AI/coach audit](ai-coach-audit.md), learning defects by
[education audit](education-audit.md), actual browser/accessibility findings by
[UX audit](ux-accessibility-audit.md), and server/data controls by
[security/performance audit](security-performance-audit.md).

## Verification boundaries

The source inventory and baseline findings above are inspected evidence. The
focused patches and their executed checks must be assessed from the associated
PR and [testing strategy](../testing/strategy.md). No claim of a physical-phone
frame rate, production sign-in round trip, database restoration, calibrated
expert strategy, multiplayer fairness, or complete curriculum is made here.

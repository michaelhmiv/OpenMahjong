# Product and implementation roadmap

Status date: November 16, 2026. This roadmap distinguishes working baseline,
focused implementation foundations and future product work. A schema or PR is
not the exit criterion for a user workflow.

## Dependency order and exit gates

| Phase | Baseline / current scope | Next coherent implementation unit | Exit evidence |
|---|---|---|---|
| 0 Audit | Existing five-package product inspected; subsystem findings, browser/production observations and current docs recorded | Audit/decision register PR | Every subsystem has evidence, severity, criteria, owner/next unit and explicit unverified checks |
| 1 Correctness | Real engine/AI/server/lessons exist but audit finds rules, scoring, information-boundary, sync and auth defects | Separate security/sync, engine+replay compatibility, and teaching/AI correctness PRs | Independent regression fixtures, existing suites, clean builds and affected browser paths pass; old records remain readable |
| 2 Foundations | Focused stack implements versioned rules, replay/analysis/education contracts, separate learning renderers and built-package import checks | Typed event payloads, incremental gameplay measurements and deeper cancellation/caching | Stable validated contracts with compatibility fixtures; new logic added without enlarging monolithic algorithms |
| 3 Beginner learning | Eleven working introductory modules and guided game, with content/progress corrections | Approved beginner expansion rendering, then original interactive tile/shape/waits modules | Guest beginner can finish introductions and guided match, resume accurately, and explain basic win legality without external help |
| 4 Practice | Approved starter Practice UI exposes thirteen engine-validated exercises across eight categories, retry/resume, evidence and optional due/unseen recommendations | Broaden original content, supported categories and progressive difficulty; validate generated publication separately | Final browser path: answer → feedback/retry → another drill, with offline resume and honest assistance evidence |
| 5 Review | Approved Review UI navigates immutable original player-perspective decisions/hands, compares physical discard facts, shows public table details and saves bounded references for related practice | Richer decision markers, explicitly labeled full-information mode and validated game-derived graded exercises | Final browser path: finish game → review → compare → save/reference related practice → return to the original decision |
| 6 Deeper analysis | One lightweight heuristic opponent/coach, not calibrated expert strategy | Shared evaluator evidence/uncertainty, call/riichi/situation assessment; validate before probabilistic model | Claims match measured behavior, public information only; latency budget/cancelability and calibration report for numerical predictions |
| 7 Personalized improvement | Assistance-separated evidence, due/unseen suggestions, account-scoped caches/sessions and bounded evidence/reference merge are integrated into learning UI | Concurrent-device/older-client conflict strategy, broader adaptive difficulty and approved longitudinal insights dashboard | Recommendations trace to evidence; final reload/account merge tests pass; actual improvement assessed on new tasks |
| 8 Advanced curriculum | Mostly absent; introductory defense is not a full strategy course | Original multi-concept defense/value/placement modules and study collections | Substantive advanced path with accepted alternatives and assumption-qualified explanations, reviewed against rules/evaluator evidence |
| 9 Multiplayer | No server-authoritative live game coordinator or realtime transport | Private rooms, coordinator, per-seat projections, reconnect/persistence tests | Four real clients finish/reconnect reliably; unauthorized/duplicate/stale actions rejected; hidden tiles never cross boundaries |
| 10 Competitive/community | No trustworthy competitive data source or ratings | Evaluate four-player placement ratings; casual matchmaking before rated launch; moderation plans before sharing/community | Independently assessed fairness, versioned results, reporting/abandonment policy and calibrated rating behavior |
| 11 Variants | Executable Hong Kong Old Style, MCR WMO2006 and Taiwanese Every-flower adapters join Riichi, with calculators,30 lessons,60 checks, coaching, review, practice and account carry-over | Broader house profiles and curricula require their own sourced implementations | Named profiles, independent scoring/exclusion/legal fixtures, real browser/offline evidence and preserved Riichi outcomes |

Do not mark phases 3–11 complete because a data interface, a research document or
a lesson label exists. Every shipped workflow needs functional, educational,
accessibility, persistence and performance evidence from the master brief.

## PR sequence

1. **Audit and current documentation:** required subsystem audits, source-backed
   research, current decisions, contributor setup and testing/operations limits.
2. **Server account safety:** browser-bound one-use OAuth, signout CSRF/CORS,
   bounded body/input validation, provider deadlines and stable numeric wire
   types. No production mutation or schema migration.
3. **Riichi, AI and replay integrity:** scoring/wall/call fixes with independent
   fixtures; physical visibility/legal action identity/multiple-threat coaching;
   versioned analysis and single-pass public-view review/navigation;
   executable-version routing for old saves and current records; emitted-library package fixes. Engine behavior changes cannot ship
   before historical replay compatibility passes.
4. **Lesson correctness and education/practice foundations:** corrected exceptions,
   bounded/resumable progress, versioned skills/content, validated curated
   exercises and assistance-aware scheduling. New Practice UI remains separate.
5. **Client reliability and build/browser checks:** account settings envelope,
   empty 204 handling, summary-to-detail history replay, existing-surface keyboard
   and dialog/accessibility fixes, offline shell installation, deployable builds,
   dependency security checks and browser evidence.
6. **Approved Practice and Review UI:** Michael approved both QC-checked
   renderings. The separate dependent learning unit implements real exercises,
   decision navigation/comparison, saved-reference practice/return and bounded
   account learning sync; final integrated verification is reported with its PR.
7. **Evidence-driven recommendations and advanced education:** persisted evidence,
   recommendations, curriculum expansion and validated deeper evaluation in
   dependency order.
8. **Private multiplayer foundation:** after local learning/review is strong;
   rated/community and variants follow their own detailed plans.

The first five units form the foundation stack (#20–#24); the approved learning
UI is its next dependent unit. Actual PR boundaries
may split further if an independently testable correction is easier to review
separately. Independent corrections proceed while future screen decisions remain
open; approval of these two learning screens is already recorded in v7. Use drafts when acceptance is incomplete; no PR grants permission to merge
or deploy production. The [implementation register](../audit/implementation-status.md)
tracks all thirty brief sections individually and records the larger remaining scope.

## Requirements coverage map

| Master brief sections | Tracking artifact / acceptance location |
|---|---|
| 1–2 Executive direction, discovery, principles | vision, architecture audit, current decision register, baseline verification |
| 3 Research and rules sources | [research](research.md), rules-compliance audit and rulesets reference |
| 4 Mandatory subsystem audits | [audit index and priorities](../audit/recommendations-and-roadmap.md) |
| 5–7 Learner stages, domains A–I, lesson engine | vision learner table; curriculum/lesson-framework docs; phases 3/8 |
| 8 Practice categories, validation and feedback | practice-system doc; phase 4 exercise/UI gates |
| 9 Post-game review, perspective, alternatives and practice | replay/review/analysis architecture and methodology; phase 5 browser path |
| 10 Evaluation levels, uncertainty and performance | AI/coach audit, analysis/methodology; phase 6 calibration/latency gate |
| 11 Evidence, recommendations and spaced review | progress-model and success-metrics; phase 7 persistence/transfer gate |
| 12 Match and decision statistics | success-metrics definitions/segmentation and phase 7 insights |
| 13–14 UX/design/accessibility | v7 design rules retaining v6 tokens/table geometry, UX/accessibility audit, browser artifacts and rendering decisions |
| 15 Architecture, event/schema/API/performance | architecture audit, replay/analysis, testing and deployment docs |
| 16 Variants and American card constraints | variants proposal; phase 11 separate rules/licensing study |
| 17 Multiplayer, ratings, fairness and community | multiplayer proposal; phases 9/10 integrity and moderation gates |
| 18 Content review and rules vs strategy | curriculum authoring and methodology; independent rule fixtures |
| 19 Privacy/security/trust | security audit, SECURITY policy, account data boundaries and sync work |
| 20 Testing and quality | testing strategy and exact PR verification evidence |
| 21 Reliability and operations | deployment docs, Railway read-only observations and recovery plan |
| 22 Open-source documentation | current decisions, README, CONTRIBUTING and architecture/education indexes |
| 23–25 Roadmap, focused PRs and acceptance | this dependency table, PR template/checks and per-finding criteria |
| 26 Success measures | success-metrics local-first measurement proposal |
| 27 Risks | severity/decision register below and subsystem audits |
| 28 Required docs | artifact index in README and linked module docs |
| 29–30 Finished journey and execution | phase 5 integrated browser path, then measured phase 7 learning transfer; no audit-only completion claim |

## Decisions to resolve with concrete review material

| ID | Decision / recommended next step | Work that can proceed now |
|---|---|---|
| DEC-UX-1 — resolved for starter screens | Michael approved the independently QC-checked [Practice/Review proposals](../design/proposals/README.md); v7 records their native-width learning layouts | Complete actual browser verification and keep future layout changes within the rendering/QC process |
| DEC-RULES-1 | Additional selectable house/tournament rules: enumerate behavior differences and fixtures before exposing toggles | Correct intended existing defaults; bind records/content to named current rules |
| DEC-ANALYSIS-1 | Stronger analysis: benchmark shared heuristics on held-out positions before choosing sampling/rollout compute | Exact legal-action, shanten/ukeire and public-information contracts |
| DEC-SYNC-1 | Current-client evidence/reference union, account-scoped local cache and serialized writes are implemented; durable outbox, older-client replacement and concurrent active-lesson conflicts still need a versioned policy | Preserve bounded local evidence and test boot/online merge/retry without claiming a complete conflict resolver |
| DEC-OPS-1 | Staging/backups/recovery: approve actual cost/retention target and rehearse restore before production rollout | Read-only inventory, deployment/rollback runbooks and CI checks |
| DEC-COMP-1 | Four-player rating/abandonment rules: benchmark placement-native model before ranked launch | Private authoritative coordinator design and information-integrity tests |
| DEC-VARIANT-1 — resolved for this program | Owner selected HK Old Style → MCR → Taiwanese, including calculators; photo input excluded | See the named rule briefs and executable adapters; preserve Riichi/historical behavior |

These are decision records, not requests for redundant approval of already
authorized fixes. A future decision should be presented with concrete renderings,
fixtures, measured options or a deployment plan, as appropriate.


Program update, 2026-11-17: [the approved implementation](../implementation-program.md) expands phase5 with game details/all-event indexed board review and supplies the three named phase11 variants plus local/private in-person ledgers. Its owner instruction explicitly supersedes intermediate brief/rendering approval stops; the visual laws remain. [Verification/evidence](../audit/program-verification.md) records the actual completed checks and remaining limits. Broader pedagogical effectiveness, multiplayer and unsupported house profiles are not implied by this work.

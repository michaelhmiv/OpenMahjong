# Master brief implementation status

Status date: November 16, 2026. Baseline: `989927b`. This register maps every
numbered section of the supplied master brief to actual code or documentation
and the remaining acceptance gate. It describes the implementation stack, not a
production release. The original brief is tracked by
[PR #19](https://github.com/michaelhmiv/OpenMahjong/pull/19); the independent
manifest correction remains in [PR #18](https://github.com/michaelhmiv/OpenMahjong/pull/18).

**Implemented** means code exists in this stack; executed verification is reported
in its PR. **Foundation** means a reusable model exists without the complete user
workflow. **Planned** means design or roadmap work only. These terms do not mark
an entire product phase complete.

| Brief section | Current evidence and status | Remaining acceptance gate / phase |
|---|---|---|
| 1 Executive directive | Baseline guest riichi play, eleven lessons and guided play are preserved. [Vision](../product/vision.md) defines the connected learning objective. | The complete Learn → Play → Analyze → Practice → Improve journey remains open; phases 3–8. |
| 2 Operating instructions | Repository/default branch and open PR scopes inspected; isolated baseline checks recorded in [testing](../testing/strategy.md). Implementation is split into coherent PRs. | Review and pass each PR's affected checks. No merge, production deploy or unrelated-work replacement is implied. |
| 3 Research | [Research](../product/research.md) separates inspected public sources, publisher claims, unavailable clients and engineering inferences; [rules audit](rules-compliance.md) identifies named-rule differences. | Hands-on comparison of authenticated competing clients and further variant-specific authoritative rules remain separate research tasks. |
| 4 Comprehensive audit | Required architecture, rules, education, UX/accessibility, security/performance and recommendations documents exist; [index](recommendations-and-roadmap.md) links them and the AI/coach report. | Resolve findings against their own testable criteria. Production sign-in, live Postgres recovery and physical-device performance are not proved by source review. |
| 5 Educational vision | [Vision](../product/vision.md#learner-experience) specifies all five stages. [Curriculum](../education/curriculum.md) maps the introductory content to skills and domains. | Broader learner-stage coverage and demonstrated skill transfer remain phases 3, 7 and 8. |
| 6 Full curriculum | **Foundation:** `education/curriculum.ts` gives the existing eleven modules stable IDs, versions, objectives, prerequisites, stages, skills and ruleset references. Existing factual exceptions are corrected. | Domains A–I are coverage targets; eleven introductory modules do not constitute the full advanced curriculum or interactive yaku reference. Phases3,8. |
| 7 Lesson engine | **Implemented:** existing real seeded scenes, wrong-answer retry and resume are preserved; `education/lesson-progress.ts` bounds/validates saved steps/actions and versions. | Sorting, matching, hand construction and every proposed interaction type still require actual content/renderer support and acceptance checks. Phases3,8. |
| 8 Practice/puzzles | **Foundation:** `education/practice.ts` defines thirteen curated exercises across eight categories, validates authored answers with the engine and supplies corrective feedback. | No Practice screen, generated-puzzle publication pipeline or complete difficulty ladder. Approved surface then real practice/resume workflow in phase 4. |
| 9 Post-game analysis | **Foundation:** `review.ts` reconstructs recorded actions once into frozen human decision views, hand/decision indexes and headless navigation. Current-v2 discard analysis uses the shared advisor/comparison; v1 remains display-only. History opens final standings. | No Review screen, visible decision-by-decision table controls, key markers, saved positions or review-to-practice UI. Phase 5. |
| 10 Analysis engine | **Foundation:** `coach/analysis-contract.ts` distinguishes exact facts, heuristic assessments, versions, player perspective and limitations. [Methodology](../analysis/methodology.md) documents the lightweight evaluator. | No calibrated win probability/EV, advanced rollouts, complete call/situation evaluation or mobile deep-analysis benchmark. Phase 6. |
| 11 Personalized training | **Foundation:** `education/practice-progress.ts` separates assisted attempts/retries from independent first answers, deduplicates evidence, suggests transparent review intervals and exposes local storage helpers. | UI integration, account synchronization, broader adaptive difficulty and learning dashboard remain phase 7. Data helpers are not an operational personalized learning product. |
| 12 Statistics/insights | Baseline personal match/hand counters and sample labels remain; [success measures](../product/success-metrics.md) defines future decision-quality metrics and compatible strata. | Placement distribution, call/ron/tsumo splits, versioned decision metrics and trends require implemented event capture and actual views. Phase 7. |
| 13 UX/design | Approved v6 composition/tokens are preserved. [UX audit](ux-accessibility-audit.md) records actual viewport/workflow evidence. Reliability work stays within existing surfaces. | Practice/Analyze composition, progressive-disclosure changes and new screen inventory need concrete rendering/QC review under design-rules§6/§10. |
| 14 Accessibility | **Implemented fixes:** keyboard tile activation, names for settings controls, dialog semantics/focus handling, scrollable text-region focus and reduced-motion treatment. | Actual browser checks must pass; automated axe and desktop keyboard checks do not certify screen-reader/mobile-device accessibility. |
| 15 Technical architecture | **Implemented foundations:** validated versioned replay envelopes, frozen legacy behavior and correctly emitted library artifacts. [Architecture audit](architecture-audit.md) records remaining ownership/performance risks. | `GameEvent` payload dictionaries, ordinary gameplay's full-match reconstruction per action and account-sync ordering remain explicit follow-ups. Single-pass headless review indexing is implemented separately. Phase 2. |
| 16 Variants | **Planned:** [variant proposal](../architecture/variants.md) separates reusable primitives, game-specific mechanics and American card rights. Named current riichi rules are explicit. | Only riichi runs. A second variant requires authoritative fixtures, distinct mechanics/content and compatibility tests; phase 11. |
| 17 Multiplayer/competition | **Planned:** [multiplayer proposal](../architecture/multiplayer.md) describes server authority, per-seat projection, idempotency, reconnection and four-player rating evaluation. | No real-time match coordinator, private rooms, matchmaking, ratings or tournaments. Phases9–10 after the learning loop. |
| 18 Content quality/rules | **Implemented corrections/foundation:** independently derived rule/scoring fixtures, ruleset metadata and engine-checked practice answers. [Education docs](../education/curriculum.md) and methodology define authoring/review boundaries. | Continued independent content review, broader original examples and validated alternatives remain required for every content expansion. |
| 19 Privacy/security/trust | **Implemented hardening:** browser-bound one-use OAuth state, signout CSRF/CORS, no-store responses, bounded uploads/JSON and safer numeric/record handling. [Security audit](security-performance-audit.md) retains unresolved risks. | Distributed abuse controls, durable offline synchronization, retention/restore policy and production database evidence remain open. Private browser records stay unrated/untrusted. |
| 20 Testing/QA | Baseline 603 tests / 23 files and typecheck verified separately. Added independent regressions and real-browser smoke/artifact checks address found defects; [testing strategy](../testing/strategy.md) defines the gates. | Exact final commands/results belong to each PR. Real Postgres, full new learner-to-review-to-practice path, native PWA install and mobile 60fps remain unverified. |
| 21 Production reliability | Railway inspected read-only: web/API/Postgres online with successful deployments, one production environment, no pending patch. [Deployment guide](../deployment.md) records operational recommendations. | No production changes. Staging, healthcheck rollout, CI-gated deploys, cost/retention decisions and restore rehearsal require their own concrete release work. |
| 22 Documentation/open source | **Implemented:** current product decisions, package inventory, contributor setup, architecture/education/testing guides and security policy distinguish reality from proposals. Historical approvals remain intact. | Keep docs synchronized with reviewed implementation; do not treat an old brief or a future design as current capability. |
| 23 Roadmap | [Roadmap](../product/roadmap.md) supplies dependency-ordered phases and observable exit criteria. | A phase closes on its working user experience and evidence, not the presence of a document or interface. |
| 24 PR strategy | Focused audit, server hardening, engine/AI/replay, education foundations and client reliability/build-check units are prepared separately. | Every PR reports scope, rationale, checks, compatibility, accessibility/security/performance and remaining gaps; incomplete acceptance stays draft. |
| 25 Acceptance criteria | [Testing strategy](../testing/strategy.md) and each audit finding provide functional/educational/accessibility/persistence/performance checks. | Broad mobile performance, cross-device conflict behavior and complete learner-loop acceptance are not claimed by model tests. |
| 26 Success measures | **Planned measurement:** [success metrics](../product/success-metrics.md) defines local-first numerators, denominators, assistance/version segmentation and guardrails. | No learner outcomes or improvement targets measured; collect a reproducible baseline and reviewed evidence before numerical product claims. |
| 27 Risks | Audit priorities cover false coaching certainty, incorrect content, replay incompatibility, hidden information, complexity, mobile cost and speculative infrastructure. | Mitigation needs repeated independent verification and operational evidence; a risk register alone does not resolve the risk. |
| 28 Required artifacts | README links the required product, architecture, education, analysis, testing and audit documents, including clear future-state labels. | New behavior must update the relevant current document in the same PR; maintain the historical brief and licensing notices. |
| 29 Finished product | Existing guest Learn/Play plus strengthened rules/security/persistence form the starting point. | Full review → targeted practice → evidence-based improvement → eventual competition is a target, not a completed feature claim. |
| 30 Execution instructions | Discovery/audit was followed by real corrections, reusable models and verification work rather than stopping at recommendations. | Continue through the dependency order after review. Owner retains merge/deploy control, and future UI changes use concrete approved renderings. |

## Review boundaries

The initial audit PR supplies evidence and the dependency plan. Subsequent PRs
implement corrections and foundations; their descriptions carry the observed test
results and changed behavior. This register must not be used to imply that all
eleven roadmap phases, full curriculum, multiplayer or variants were delivered by
the initial stack.

The exact new-screen gate comes from [design rules §6](../design-rules.md#6-screens):
“A new screen requires a brief amendment and an approved rendering,” and
[§10](../design-rules.md#10-process): “No UI change is built before its rendering
is QC-passed and approved by Michael.” Prepare concrete renderings and independent
QC before requesting that final design decision. This does not require pausing
already authorized rules, security, replay, education-model or existing-surface
accessibility corrections.

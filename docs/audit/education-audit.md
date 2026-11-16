# Education audit

Audit baseline: `989927ba57dde781a4a856eaa2bbb6a1d01afb4b` (`main`), 2026-11-16. Line references in the findings refer to that commit, so they remain reproducible after refactoring. This is an implementation audit, not a claim that completing the lessons establishes strategic mastery. Browser evidence and interaction accessibility are covered separately in `ux-accessibility-audit.md`.

## Existing lessons inspected

| Module | Actual activity | Assessment and missing instruction |
|---|---|---|
| TU-1 Tiles | Four target-selection drills plus text/strips | Real identification and corrective feedback. Bamboo explanation depends on green sticks although 1s is a bird. No separate character/dot/bamboo rank-reading assessment. |
| TU-2 Winning shape | Two multiple-choice questions and tile strips | Introduces standard, seven-pairs, and orphan shapes. Must qualify standard structure and distinct pairs; no construction exercise or yaku-versus-shape assessment. |
| TU-3 Draw/discard | Six legal discards in a seeded engine game | Genuine play. Demonstrates operation, not efficient discarding or independently justified decision quality. |
| TU-4 Calls | Engine-backed chi, pon, open kan; wrong pass retained | Legal demonstrations. False universal statements about openness/value; no declined-call strategy or concealed-kan exercise. |
| TU-5 Ready/winning | Seeded tsumo and ron | Legal engine outcomes and named waits. No independent wait-selection assessment, or furiten lesson. |
| TU-6 Riichi | Eligible discard then automatic hand continuation | Correct engine eligibility gate but incomplete explanatory restrictions and incorrect draw/stick claim. No riichi/dama comparison. |
| TU-7 Yaku | Six illustrated yaku, two recognition questions | Tests score examples against the same engine. Riichi explanation overstates legal wins; no dora-only counterexample, full reference, open reductions, or advanced yaku. |
| TU-8 Points/rounds | Real seeded tsumo, three numeric questions | Reads actual win event. Duplicate option risk at lower bounds; explanation conflates East-only with East/South. Does not teach fu arithmetic, payments, honba, settlement, or limits comprehensively. |
| TU-9 Defense | Discard a type in one riichi player's pond | Narrow genbutsu drill. Language overstates safety across opponents and equates furiten with inability to wait; folding is presented too categorically. |
| TU-10 American comparison | Five text panels and one question | Optional orientation only; no American rules engine or licensed annual-card content. Do not describe this as a second variant curriculum. |
| TU-11 First game | Real guided East-only game via App | App marks completion only on match finish (`app.ts:1251`, `2202`). Guided completion is exposure, not independent skill evidence. Leaving retains normal game progress; lesson-launch resume behavior requires separate UX follow-up. |

The controller (`tutorial.ts:911`) supports info, drill, choice, and seeded-scene steps, retry without advancing, and a serialized active lesson. TU-11 has no panel steps and is owned by App. It must not be marked complete solely because constructing its panel controller yields no steps.

## Findings ordered by impact

### EDU-01 — P1: rules explanations teach false absolutes

- **Area / impact:** calling, riichi, winning, and defense. Beginners can infer that an ankan opens a hand, that riichi removes furiten, or that a discard is safe against every opponent.
- **Expected:** scope openness to claimed discards; describe permitted riichi ankan; distinguish complete shape/yaku/legal ron; scope genbutsu to one opponent; carry sticks after a drawn hand.
- **Observed evidence:** `tutorial.ts:627` says every call opens a hand and always lowers score; `:720` assigns the stick to a winner even when the hand draws; `:721` permits only wins to change a riichi hand; `:742` says a closed ready hand can always win; `:846` calls tiles globally safe; `:881` says opponents cannot wait on their discards. Completion summaries at `:45–103` repeat several claims.
- **Reproduce:** open TU-4's final panel, TU-6's final panel, TU-7's riichi panel, or TU-9; compare the claim with concealed-kan/riichi/furiten outcomes in engine scenarios.
- **Cause:** beginner simplification omitted rule exceptions and opponents' identities.
- **Correction / proposed PR:** education correctness PR; update explanation and completion copy together, retain existing structure/style, and test facts against the selected ruleset.
- **Acceptance:** concealed kan remains closed; riichi kan restrictions explicit; furiten still prevents ron; draw carries sticks; no global safety or unconditional fold claim. Strategic recommendations are labeled/contextual.
- **Complexity / risk:** small copy and regression changes; moderate educational risk if left unfixed.

### EDU-02 — P1: malformed active progress reaches synchronous replay

- **Area / impact:** lesson resume/account settings. Corrupt local or account state can crash or consume excessive work when opening a lesson.
- **Expected:** finite integer bounds, known scene seeds, bounded well-formed actions, legal action/phase checking, recoverable failure.
- **Observed:** `tutorial.ts:133–150` validates only module name and JavaScript number type, casting arbitrary scene/counters/found; `:926–935` replays the trusted cast. Recorded call handling (`:294–301`) casts any decision to a call. Turn checking omits several call types. Unknown turn actions can fail to advance the original engine loop.
- **Reproduce:** use `parseProgress({active:{module:'tu3',step:1,scene:{seed:'om-tu3',decisions:[{type:'pon'}]},counters:{},found:[]}})` and construct its controller. Negative/nonfinite steps and oversized arrays are also admitted at baseline.
- **Cause:** persistence interface was treated as runtime validation.
- **Correction / proposed PR:** bounded lesson snapshot module; reject malformed metadata before replay; validate every recorded action against its context; restart only the unusable active lesson while preserving completed module IDs.
- **Acceptance:** invalid/oversized inputs rejected before simulation, wrong-phase actions throw promptly, invalid live action leaves prior scene intact, valid historical unversioned snapshots migrate, failed replay restarts gracefully.
- **Complexity / risk:** moderate; compatibility tests are required.

### EDU-03 — P2: progress merge can resume an already completed module

- **Expected:** union completion records and prefer an active module still incomplete in that union.
- **Observed:** `tutorial.ts:170–178` documents that policy but returns `a.active ?? b.active` unconditionally.
- **Reproduce:** local active TU-1; account has completed TU-1 and active TU-2. Merge resumes TU-1.
- **Impact / cause:** returning learners are sent back to finished material because the implementation diverged from the documented conflict rule.
- **Correction / proposed PR:** education state PR; incomplete-first, deterministic local-first tie resolution. Do not fabricate recency without timestamps.
- **Acceptance:** completions deduplicate; the example selects TU-2; either valid incomplete lesson can still be opened manually.
- **Complexity:** small; low migration risk.

### EDU-04 — P2: lesson facts and resume lack independently versioned metadata

- **Expected:** stable module IDs, content versions, objectives, advisory prerequisites, skills/domains, completion criteria, review eligibility, explicit ruleset compatibility.
- **Observed:** `tutorial.ts:34–109` stores only title/minutes/summary; `:111–122` snapshot has no content version; `:457` onward mixes curriculum text with controller callbacks. No practice/evidence taxonomy exists at baseline.
- **Impact / cause:** adding advanced curriculum grows a monolithic controller and risks resuming old actions under changed content/AI seeds.
- **Correction / proposed PR:** education foundation PR, extracting typed catalog and persistence validation. Preserve the current 11 lessons; describe missing domains honestly. Treat incompatible active scenes as restartable, not as proof of lost mastery.
- **Acceptance:** validated advisory DAG with no locked content; distinct content/ruleset/schema/analysis versions; existing imports and rendered layout still work; current seeds complete against current engine/AI.
- **Complexity:** moderate; callback-to-data rewrite is deferred until its value is demonstrated.

### EDU-05 — P2: numeric quizzes can offer duplicate answers

- **Expected:** exactly one correct selection, all rendered labels distinct, facts from an actual win event.
- **Observed:** `tutorial.ts:799–815` clamps lower distractors to 1 han/20 fu, producing duplicate correct labels at those boundaries. `:1009–1017` supplies fictional default han/fu if no win exists.
- **Reproduce:** evaluate a 1-han or 20-fu quiz; restore TU-8 at a numeric question with no valid win scene.
- **Impact / cause:** a correct-looking answer can be rejected; invalid resume can appear to teach fabricated values.
- **Correction / proposed PR:** education correctness/state PR; distinct distractor generation and fail-closed win-fact access/resume.
- **Acceptance:** 1-han and 20-fu options unique; numeric questions require a real recorded win and cannot silently invent values.
- **Complexity:** small; real seeded quiz regression required.

### EDU-06 — P2: the continuous learning loop remains incomplete

- **Expected:** game review links an evidenced weakness to independent practice, preserves assisted status, and produces transparent progress/review recommendations.
- **Observed:** baseline has 11 lessons and guided play, no dedicated practice area, no attempt schema, no skill-specific evidence or spaced review. All reviewed decisions and games cannot currently become exercises.
- **Impact / cause:** lesson completion is the only learning signal; it does not measure transfer or retention. This is missing product scope, not a defect cured by adding catalog fields.
- **Correction / proposed PRs:** exact practice model/curated validation first; then approved practice rendering, review integration, persistence/sync, and evidence UI. Keep server-authoritative competitive results a separate concern.
- **Acceptance:** incorrect answers retry; generated/curated answers verified; assisted/retry responses excluded from independent first-response accuracy; due reviews reflect actual evidence; browser pathway Learn→Play→Review→Practice→Play tested.
- **Complexity:** multiple focused PRs. Foundations alone do not meet this acceptance criterion.

### EDU-07 — P2: later chi calls lose their selected tile identities

- **Area / impact:** seeded lesson reconstruction. A later chi can be displayed using the fallback pair rather than the exact instances selected by the learner or CPU, potentially changing the visible shape or red-five treatment.
- **Expected:** every chi event receives the two tile IDs from its own decision; replaying the same scene preserves each mapping.
- **Observed evidence:** `tutorial.ts:270–274` scans the whole accumulated event log after every decision. On a later chi, the first historical chi consumes `lastChi` even when its existing hint is retained, so the new event never receives its hint.
- **Reproduce:** construct `LessonScene('om-tu4chi-5')`, call `auto()` until two chi events exist, then compare those event sequence numbers with `chiHints`. The added regression failed before the correction.
- **Cause:** event scanning retained the latest decision but no scan cursor.
- **Correction / proposed PR:** education replay correctness PR; consume each newly appended event once, retain exact tile IDs, and honor the engine's explicit call-stage marker.
- **Acceptance:** all chi events in a real multi-call scene have hints; restored hints match the uninterrupted scene; all existing lesson completion paths still pass.
- **Complexity:** small; no replay-format or display-layout change.

## Implemented correction and foundation scope

The implementation following this audit corrects EDU-01–05 and EDU-07, extracts the versioned catalog and bounded progress boundary, and adds the nonvisual practice/evidence foundation described in `docs/education/`. The wait-name helper now also excludes impossible fifth owned copies when declared melds consume the other copies. The 13 curated exercises are a starter corpus across eight response kinds, not the full curriculum or a published Practice area. EDU-06 remains an open product acceptance criterion until the approved browser experience and account/review integration ship.

## Domain coverage against the master brief

| Domain | Existing coverage | Remaining work |
|---|---|---|
| A Fundamentals | Tile families, basic structure, turns | Seat/round-wind exercises, construction/manipulation, interface reading assessment |
| B Calls | One chi, pon, open kan demonstration | Concealed/added kan, restrictions, value/flexibility and decline decisions |
| C Shanten/efficiency | Tenpai introduced | Shanten/ukeire/shape comparison, five-block, overlapping shapes, independent discard drills |
| D Yaku/value | Six examples/two questions | Full reference with counterexamples, open reductions, dora/ura, yakuman, planning |
| E Riichi/wins | Riichi/tsumo/ron actions | Furiten variants, wait quality, dama, wall/risk/context exercises |
| F Scoring | Three factual questions | Fu derivation, limit hands, dealer/nondealer payments, honba/sticks, settlement |
| G Defense | One-opponent genbutsu | Suji/kabe assumptions, multi-threat, open hands, push/fold/context |
| H Advanced | Absent | Validated EV/probability/context curriculum; no unsupported numerical optimality |
| I Full games | Guided East-only game | Independent assessment, draws/abortive outcomes, placement, full-game review |

## Rules references and content verification

The current OpenMahjong ruleset is the authority for this product's exercises. Read the engine descriptor and `docs/architecture/rulesets.md`; do not replace it with WRC or EMA defaults. The official [WRC rules page](https://www.worldriichi.org/wrc-rules) links the [2025 rulebook](https://www.worldriichi.org/s/WRC-Rules-2025-42fx.pdf). Its group/hand definitions distinguish concealed and melded groups and its furiten definition prohibits ron; this supports scoped terminology, not a claim that OpenMahjong implements WRC. WRC 2025 differs materially in red fives, riichi eligibility, abortive draws, and scoring options. Explanations/examples in this repository are original, not copied curriculum.

Before publishing content: identify selected ruleset; distinguish rule from heuristic; hand-derive the answer and exceptions; verify with engine fixtures using the actual winning tile/context; run wrong-answer/resume and current-seed completion checks; review language for false certainty; obtain browser evidence for layout/controls. Existing engine agreement alone is not independent expert review. A human rules/content review and beginner usability study remain useful open acceptance work.


## EDU-08 — Breakdown must display awarded han, not closed-hand defaults (P1, fixed)

**Evidence:** Baseline `packages/web/src/app.ts:2393` looks up fixed closed-hand
han then infers dora from the remainder. Open ittsu/honitsu therefore display
2/3han instead of1/2; missing newly supported yaku names can be counted as dora.
**Expected/impact:** A score explanation must agree with the rules engine;
wrong line items teach the wrong open-hand reductions even when total points
are correct. **Cause:** Lost per-yaku metadata between scoring and presentation.
**Correction:** Current win events retain awarded yaku han and dora; the model
forwards them and the renderer uses these facts. Old logs use recorded melds to
apply known open reductions. New yaku names and yakuman-multiple wording are
included. Actual ron tile IDs also survive kan-robbing events without a pond.
**Acceptance/reproduction:** Open123p within123456789p11133z, West seat/South
round, ron onWest: openittsu1+honitsu2+dora1=4han. The DOM shows those exact rows,
with the same legacy fallback; a nonred robbed five remains nonred in the model.
**Proposed PR:** Engine replay metadata plus client reliability presentation.
See `score-breakdown.test.ts` and the tile-instance model regression.

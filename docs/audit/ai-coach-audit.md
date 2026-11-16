# AI and coaching audit

Baseline: `989927ba57dde781a4a856eaa2bbb6a1d01afb4b`, inspected on
2026-11-16. Baseline line references below remain reproducible with
`git show 989927b:<path>`. **Corrected** means implemented in the proposed
changes, not deployed. The current opponent policy is revision 2; discard
analysis is `discard-analysis-2`, using engine 2 and `openmahjong-riichi@1`.

## Assessment and evidence

The opponent is a deterministic lightweight heuristic, suitable as a teaching
foundation after the concrete errors below are corrected. Neither the baseline
nor these changes establish expert strength or an optimal-discard oracle.
The coach shares the opponent's discard ranking and riichi heuristic; agreement
between them verifies consistency, not strategic quality. Exact structural
calculations and relative judgments are separated in the versioned analysis
contract and [methodology](../analysis/methodology.md).

Inspected all current AI/coach sources, their call sites, engine public views,
independent shanten/wait examples, seeded differential tests, legal-action
properties, hidden-information tests, the latency benchmark, and whole-match
soaks. Public counts were independently derived from physical tile locations;
defensive examples compare the assumptions of individual opponents rather than
merely comparing two functions which share the same mistake.

## Findings

### AI-01 — P1 — Called discards are counted twice

- **Area / impact:** Visible counts, ukeire and defense. Learners can be shown
  too few unseen copies or an invented fully visible neighboring type.
- **Expected:** A called physical tile appears in pond history but contributes
  one copy, at its current meld location.
- **Observed / cause:** Baseline `packages/ai/src/danger.ts:44` counts every
  historical discard and then every meld tile, including the same called tile.
- **Reproduce:** Put one white dragon in seat 1's called pond history and that
  same instance plus two other white dragons in seat 2's pon. Baseline counts
  four; exactly three are publicly exposed.
- **Correction / complexity:** Exclude called pond entries from physical
  counting while retaining all history for furiten. Small.
- **Acceptance / evidence:** The called-identity fixture in
  `packages/ai/test/evaluation-integrity.test.ts` yields three.
- **Proposed PR / state:** AI/analysis correctness; corrected.

### AI-02 — P1 — Candidate discards return to the unseen pool and omit furiten

- **Area / impact:** Discard advice, unseen acceptance and legal-ron teaching.
- **Expected:** A proposed discard leaves the hand and immediately joins the
  public pool and the player's own discard history.
- **Observed / cause:** Baseline `packages/ai/src/evaluate.ts:151` and
  `packages/coach/src/advice.ts:218` remove the hand tile but reuse the old
  visible vector. Coach furiten at `:225` examines only the old pond.
- **Reproduce:** Analyze a 1m discard from `11223344556677m`. One 1m remains
  held, one has just been discarded, and two are unseen. The proposed discard
  also makes a wait containing 1m discard-furiten.
- **Correction / complexity:** Construct a post-discard visibility vector and
  add the candidate type to the furiten history. Small.
- **Acceptance / evidence:** Wait and improving counts are two, furiten is true,
  and the reason code is present in `information-integrity.test.ts`.
- **Proposed PR / state:** AI/analysis correctness; corrected.

### AI-03 — P1 — Red-five tsumogiri can leave the coach without a candidate

- **Area / impact:** Guided play and riichi decisions; a valid position can
  throw instead of returning advice.
- **Expected:** A riichi player can discard the exact just-drawn instance,
  including a red five when a plain copy is already held.
- **Observed / cause:** Baseline `evaluate.ts:142` picks a plain representative;
  the coach subsequently filters that candidate by the drawn instance ID.
- **Reproduce:** Riichi hand `123055m345p678s99s`, with red 5m as the draw.
  The plain 5m representative fails the actual-draw filter.
- **Correction / complexity:** Preserve the exact drawn instance in riichi.
  Small; no rule changes.
- **Acceptance / evidence:** The coach offers only the red drawn tile and
  respects the engine's tsumo flag in `information-integrity.test.ts`.
- **Proposed PR / state:** AI/analysis correctness; corrected.

### AI-04 — P1 — Safety against one riichi is presented as universal safety

- **Area / impact:** Defensive education; a learner can be taught to discard
  into a second opponent while being told the tile is safe.
- **Expected:** Genbutsu identifies the particular opponent prevented from
  winning by ron. Multiple threats require independent checks.
- **Observed / cause:** Baseline coach unions all riichi ponds, assigns
  `genbutsu` at `advice.ts:231`, then prints an unqualified safety claim at
  `:279`, even when the maximum danger comes from another riichi.
- **Reproduce:** Seat 1 has discarded 5p, seat 2 has declared riichi without a
  5p discard. 5p is genbutsu against seat 1 only.
- **Correction / complexity:** Report `genbutsuAgainst` seats and reserve the
  aggregate flag for all current riichi threats; scope the explanation to ron.
  Small.
- **Acceptance / evidence:** The two-threat fixture reports `[1]`, a false
  aggregate flag, positive relative danger, and no aggregate genbutsu reason.
- **Proposed PR / state:** Coaching correctness; corrected. Defense against
  non-riichi hands remains unmodeled.

### AI-05 — P1 — High dora is mistaken for a valid dama hand

- **Area / impact:** Riichi strategy and yaku education. A closed no-yaku hand
  can decline its available riichi because bonus tiles look valuable.
- **Expected:** Dora contribute bonus han after a yaku exists; dora alone do
  not permit a ron. Repeated indicators and double wind triplets count fully.
- **Observed / cause:** Baseline `policy.ts:70` uses a rough value threshold
  without an independent yaku check. `evaluate.ts:37` collapses indicators to
  a set, and the value proxy gives a double-wind triplet only one han.
- **Reproduce:** `111m456p789s23s55z7z`, with two 9m indicators and a legal
  7z riichi discard, retains six dora but has no dama yaku. Separately, a
  triplet of seat-East in round-East supplies two han.
- **Correction / complexity:** Add dora multiplicities, double-wind counting
  and a known-yaku gate to the conservative high-value dama heuristic. Medium;
  this still does not calculate EV or all possible yaku.
- **Acceptance / evidence:** Shared-policy regressions retain both dora awards,
  count double East twice, and declare riichi in the no-yaku fixture.
- **Proposed PR / state:** AI/analysis correctness; corrected.

### AI-06 — P2 — Defensive and wait labels overstate their evidence

- **Area / impact:** Strategy explanations; weak estimates can be read as rules.
- **Expected:** Two wait types may be shanpon; a middle tile's two ryanmen
  sides require both suji partners; unseen copies have unknown locations.
- **Observed / cause:** Baseline `coach/advice.ts:245` equates two types with
  a two-sided sequence wait; `ai/danger.ts:87` assigns full suji discount from
  either partner of ranks 4–6; the coach calls unseen copies "live".
- **Reproduce:** `123m456p789s11z55z` has East/white-dragon shanpon. A discarded
  2p removes the 34p ryanmen possibility for 5p but leaves the 67p possibility.
- **Correction / complexity:** Use `two-wait-types`, distinguish partial suji,
  and document unseen counts versus live-wall draws. Small.
- **Acceptance / evidence:** Independent shanpon and partial/full-suji fixtures
  pin the distinctions; all suji danger estimates remain above zero.
- **Proposed PR / state:** Coaching correctness; corrected. Numerical danger
  is still relative and uncalibrated.

### AI-07 — P2 — Coach and opponent duplicate decision logic

- **Area / impact:** Maintenance and recommendation reliability.
- **Expected:** A shared evaluator supplies the strategy; explanations identify
  the facts and limitations used by it.
- **Observed / cause:** Baseline coach `advice.ts:134` duplicates push/fold,
  ranking and riichi handling from `ai/policy.ts:53` and `:146`.
- **Reproduce:** A late-hand single-unseen-copy wait can be described as a
  riichi opportunity even though the opponent's heuristic declines it.
- **Correction / complexity:** Share ranking and `shouldDeclareRiichi`, expose
  `RiichiAdvice.recommended`, and distinguish policy-preference reasons from
  actual maximum unseen acceptance. Medium.
- **Acceptance / evidence:** Real game captures agree on the recommended
  discard; late single-copy riichi is declined by both. Versioned analysis
  lists exact facts, heuristic assessments and explicit limitations.
- **Proposed PR / state:** Analysis architecture; corrected. Shared weaknesses
  remain possible and require independent strategic review.

### AI-08 — P2 — Canonical tile IDs omit legal human review choices

- **Area / impact:** Review of actual human discards, especially red fives.
- **Expected:** A legal different plain copy or a deliberate red-five discard
  remains analyzable without inventing a mistake or crashing a comparison.
- **Observed / cause:** Baseline `evaluate.ts:136` intentionally emits one
  physical representative per type; a comparison by another legal ID cannot
  find that choice. Red/plain copies also have different retained bonus value.
- **Reproduce:** Analyze `123055m345p678s99s`; select the second plain 5m or
  red 5m rather than the canonical first plain copy.
- **Correction / complexity:** Keep the opponent's canonical default, but let
  the coach request every physical alternative. Report exact `isRed`,
  `doraDiscarded` and comparison dora difference. Small, at most 14 candidates.
- **Acceptance / evidence:** Both duplicate plain IDs compare with zero
  structural/dora delta; red versus plain has zero structural delta and one
  additional bonus dora discarded. Real-position recommendation agreement
  remains passing.
- **Proposed PR / state:** Player-perspective review foundation; corrected.

### AI-09 — P2 — Calls and push/fold remain shallow strategic heuristics

- **Area / impact:** Opponent strength and future decision explanations.
- **Expected:** Any claim that a call improves speed/value should account for
  the mandatory following discard, yaku, replacement draw where relevant,
  threats and match position.
- **Observed / cause:** Current `policy.ts:161` evaluates pon after removing
  two hand tiles, before the required discard. The chi acceptance comparison at
  `:206` receives an effective 14-tile state, so its 13-tile ukeire branch does
  not execute. Push/fold uses shanten and a small value proxy; kan is usually
  taken whenever legal unless chasing seven pairs.
- **Reproduce:** Trace a chi/pon decision through these branches and compare
  its evaluated state with the engine's subsequent discard context.
- **Recommended correction / complexity:** Enumerate legal call-plus-discard
  continuations and compare them to pass using the same public snapshot;
  independently review strategy fixtures before claiming improvement. Medium.
- **Acceptance:** Known fixtures expose every continuation, preserve yaku and
  physical counts, quantify speed/value/risk assumptions, and beat or justify
  the baseline on held-out positions without illegal actions.
- **Proposed PR / state:** Advanced calling evaluator; planned. Current calls
  remain legal-action heuristics, not expert recommendations.

### AI-10 — P2 — No calibrated strength, mobile memory or probability evidence

- **Area / impact:** Product claims, future advanced coaching and performance.
- **Expected:** Severe mistake grades, probabilities and difficulty labels
  require independent strategic calibration; large caches need a mobile budget.
- **Observed / cause:** Current `analysis.ts:155` permits 250,000 entries in
  each of two segment caches and `:272` permits 50,000 ukeire entries. Existing
  tests cover correctness/host latency, not mobile heap use or expert strength.
- **Reproduce:** Run the benchmark and inspect its assertions: mean/p95 below
  50 ms on the actual host. It contains no held-out strategic gold set, mobile
  frame/heap capture, value-EV model, or calibration measurement.
- **Recommended correction / complexity:** Add representative mobile heap and
  guided-analysis budgets; independently reviewed held-out decisions; compare
  validated stronger policies. Add interruptible workers before deep analysis.
  Medium to large; numerical modeling needs separate research.
- **Acceptance:** Publish host/device, warm/cold sample sizes, tail latency,
  memory, evaluation set provenance and uncertainty. Do not silently promote
  legality/consistency metrics into strength evidence.
- **Proposed PR / state:** Analysis calibration/performance; planned. Current
  analysis contract discloses the limitation and has no numerical win grades.

## Verification record

- `npx vitest run packages/ai/test/analysis.test.ts packages/ai/test/evaluation-integrity.test.ts packages/ai/test/hidden-state.test.ts packages/ai/test/policy.test.ts packages/ai/test/property.test.ts packages/ai/test/benchmark.test.ts packages/coach/test --maxWorkers=2`: **63 tests / 8 files passed**, 22.77 s before the additive all-instance coach regression.
- `npx vitest run packages/coach/test packages/ai/test/evaluation-integrity.test.ts packages/ai/test/policy.test.ts packages/engine/test/game-regressions.test.ts --maxWorkers=2`: **49 tests / 5 files passed**, 6.67 s, including the new physical-instance review and independent riichi-ankan regression.
- `npx vitest run packages/ai/test/soak.test.ts --maxWorkers=2`: **33 tests / 1 file passed**, 171.88 s. This runs the default 120 complete seeded games plus wall/determinism samples. It does not claim a local 10,000-game run.
- `npm run typecheck --workspace=@openmahjong/ai`, then the corresponding
  `@openmahjong/coach` and `@openmahjong/engine` commands: **all passed**;
  evidence in `review-rules-ai-typecheck.log` in the execution workspace.
- Complete integrated verification is recorded in the PR and final repository
  evidence. The benchmark passed its host mean/p95 budget;
  no physical mobile benchmark or calibrated strength result is claimed.

The new rules corrections alter some seeded trajectories. Frozen v1 engine/AI
sources preserve historical replay and continuation; their old bugs are not
retroactively corrected in stored games. New reviews must retain revision
metadata and must not label historical positions as current-engine analysis.

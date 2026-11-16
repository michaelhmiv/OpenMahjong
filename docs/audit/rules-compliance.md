# Rules compliance audit

Audit baseline: `989927ba57dde781a4a856eaa2bbb6a1d01afb4b` (`main`, 2026-11-16). Findings describe that baseline; **corrected** means a change in the accompanying engine PR, not a production deployment. Current engine revision: `2`. Intended house-rule profile: `openmahjong-riichi@1` (`packages/engine/src/ruleset.ts`). Engine revision and ruleset version are separate: historical engine defects are not intended house rules.

## Evidence and method

Inspected every engine source file, the scoring/shanten vector corpora, scripted game scenarios, wall/RNG tests, game soak harness, AI consumers, and historical rules decisions in `docs/brief-v1.md`. Re-derived the scoring cases below from tile structure and the point formula instead of accepting the old corpus as an oracle. New game scenarios use explicit canonical physical walls, not searched seeds or engine-generated expected values.

The official [WRC rules page](https://www.worldriichi.org/wrc-rules) currently links [WRC Rules 2025, v20250526](https://www.worldriichi.org/s/WRC-Rules-2025-42fx.pdf), retrieved 2026-11-16. Relevant sections are 8.4 (last live tile), 8.7 (four-kan maximum, drawn-turn requirements), 8.9.1 (ankan after riichi), 8.11.2 (furiten), 8.13 (dead-wall replenishment), 11.3 (fu), and 11.5 (yaku). These support shared structural facts; this audit does **not** make WRC the default. The EMA website rejected the attempted read with HTTP 403; no claim of a fresh EMA text review is made.

A passing implementation-derived corpus does not establish independent correctness: the baseline corpus both expected honroutou to be a yakuman and included four impossible positions using five identical tiles. Those fixtures have been corrected and physical well-formedness is now independently asserted.

## Explicit default and differences

`DEFAULT_RULESET` identifies the existing house-rule choices, and `resolveRuleset` rejects unknown IDs/versions. `GameOptions.ruleset` accepts a reference; only this one profile is implemented. This descriptor is not a claim that arbitrary flags or other variants can be selected. `game-start` events include the selected reference.

| Choice | OpenMahjong riichi v1 | WRC 2025 comparison |
| --- | --- | --- |
| Red fives / open tanyao | Three red fives; open tanyao | No red fives; open tanyao |
| Riichi eligibility | At least 1,000 points and four live tiles | May declare below 1,000 and with fewer than four live tiles |
| Kiriage mangan | Off | On |
| Double ron | Nearest declarer in turn order (head bump) | Turn-order priority; tournament call procedure differs |
| Specific-wait doubles / big four winds | Enabled / double | No specific-wait double yakuman; big four winds single |
| Counted yakuman | 13+ han is kazoe yakuman | 13+ han is counted yonbaiman; do not import that label/value silently |
| Abortive draws / nagashi / tobi | Enabled / enabled / below zero ends match | None / none / no bust-out |
| Final dealer win | Dealer continues; no agari-yame | Tournament ending/continuation rules differ |
| Double-wind pair | Two fu total | Keep profile choice; do not infer other rulesets' fu |
| Riichi ankan | Drawn tile must complete quad; waits unchanged | WRC also requires every hand interpretation to remain unchanged, including impossible five-copy interpretations |
| Ankan robbery | Not offered, including kokushi | WRC also forbids it; some online rules allow kokushi |
| Kandora | Concealed before replacement draw; open immediately after replacement draw, before discard decision | WRC requires flip before discard; do not describe this engine as Tenhou's delayed open-kan implementation |
| Liability / immediate discard exchange (kuikae) | No liability settlement; kuikae not restricted | WRC has liability and forbids certain exchanges; these require an explicit house-rule decision |
| Temporary furiten | Ends at next draw, including a replacement draw | WRC also clears it at one's own call; current profile retains the original next-draw policy |

Preserved choices are documented rather than silently reclassified as defects. In particular, liability and kuikae merit owner/rules review before a competitive ruleset is advertised.

## Compliance matrix

Status applies only to the listed evidence. **Verified** means the specified behavior has explicit independently reasoned fixtures; it does not certify the entire ruleset. **Test gap** means code exists but the listed edge cases still lack independent coverage. **Partial**, **missing**, and **choice** distinguish absent behavior from house-rule differences.

| Area | Status after correction | Evidence and remaining boundary |
| --- | --- | --- |
| Tile type/copy identity, red fives | Verified | `tiles.test.ts`, `rng-wall.test.ts`; `validation.test.ts` now rejects malformed count vectors and noncanonical supplied walls. |
| Seeded wall and repeatability | Implemented; test gap | Seeded RNG/unit determinism and full-match same-seed tests exist. RNG is not a secure server wall generator; no cryptographic fairness claim. |
| Live/dead wall after kan | Verified for one/four kans | `game-regressions.test.ts`: 69 normal + 1 replacement draw; four same-player kans still total 70 post-deal draws; retired tail never drawn. |
| Dealing/turn order | Implemented; existing scripted coverage | 4-4-4-1, chi and pon turn jumps in `game-scenarios.test.ts`; independent comprehensive dealer-rotation deal vectors remain desirable. |
| Ron > pon/kan > chi; head bump | Verified for scripted cases | Existing head-bump and call fixtures; contexts now expose explicit `callStage` and stage-valid choices. No timing/race transport exists. |
| Open call restrictions | Corrected; verified | New fixtures deny open calls after riichi and all calls after final live discard; direct/additional kan require a drawn turn and replacement capacity. Kuikae remains a named unrestricted choice. |
| Riichi eligibility/deposit | Corrected; verified with gaps | Declaration discard that deals in pays no new stake; unchanged-wait drawn-tile ankan fixture; existing illegal-riichi case. Threshold boundary combinations need more independent fixtures. |
| Furiten | Corrected; verified with gaps | Existing discard/temporary/permanent cases plus yaku-less completing discard before another yaku-bearing wait. Replacement draws clear temporary furiten in code; a dedicated daiminkan-clear fixture remains useful. |
| Dora/ura/red count | Implemented; test gap | Indicator cycles in tests, `buildScoreInput` counts actual instances including red ron tile. Five-indicator/ura/red combinations need independent integration vectors. |
| Kan maximum / last live tile | Corrected; verified | No fifth kan offered after four by one player; no kan on final live draw. Four kans by multiple players abort after ron opportunity, before other meld calls. |
| Chankan / rinshan | Implemented; existing fixtures | Shouminkan robbery and replacement-draw win; ankan robbery deliberately disabled. Chiihou/tenhou are invalidated by calls in engine context. |
| Ippatsu | Corrected; verified for ankan | Any completed kan clears all ippatsu windows; new riichi-ankan/rinshan win excludes ippatsu. Existing immediate ron includes it. |
| Exhaustive draws | Implemented; existing coverage | 3,000-point exchange and dealer tenpai continuation; physical fifth-copy-only waits are now not tenpai. |
| Abortive draws | Implemented; test gaps | Four winds, four riichi, nine terminals/honors, four kans have scripted fixtures. Four-winds interruption guard fixed; more interrupting-call/ron permutations remain. |
| Nagashi mangan | Choice; test gaps | Existing single-winner fixture. Multiple qualifiers, honba, open-hand eligibility, stick allocation and continuation policy need explicit independent cases/rules review. |
| Honroutou / shousangen / daisangen / chinroutou | Corrected; verified | Re-derived fixtures in `scoring-vectors.ts`, including ordinary-yaku stacking and daisangen + all-honors double yakuman. |
| Chuuren and declared kan | Corrected; verified | A legal declared-kan one-suit hand scores chinitsu/menzen tsumo rather than chuuren. |
| Other standard yaku/fu/limits | Implemented; test gaps | Corpus includes pinfu, seven pairs, kokushi, wait attribution, limits, round-up, honba and yakuman stacking. Existing examples were not independently re-derived exhaustively in this pass; all-yaku IDs alone are insufficient proof. |
| Round/match end/settlement | Implemented; existing coverage | Scripted dealer/nondealer wins, exhaustive renchan, honba, tobi; clean/tied settlement and full-game conservation tests. Nagashi-ending permutations remain unverified. |
| Policy information boundary | Corrected; verified at API shape | Detached views/context copies; a policy cannot inject a legal kan option or mutate engine tile/discard state through its view. Hidden wall/other hands absent from `PlayerView`. Arbitrary hostile executable policies are not sandboxed. |
| Replay/serialization | Separate foundation | See `docs/architecture/replay.md`; corrected engine changes seeded trajectories. Legacy simulation must be selected explicitly for old records; no re-interpretation as v2. |
| Versioned selectable rulesets | Partial | Named default/reference validation exists. WRC/EMA/online presets and full config-driven branching do not. |
| Server-authoritative/rated results | Missing | Current game is client-local; seed/event log includes hidden information. Never use client uploads as official rated outcomes. |
| Other variants | Missing | Shared tile abstractions are useful foundations, not implemented rulesets. |

## Findings and corrections

Baseline paths/line numbers refer to commit `989927b`, so evidence remains inspectable after fixes. Proposed PR labels identify coherent review units; they do not imply an open PR already exists.

### RULE-01 — P1 — Honroutou overpayment and missing dragon/terminal yaku

- **Area / impact:** Scoring, all players and teaching. A seven-pairs terminal/honor hand was priced at 32,000 instead of 6,400; other legitimate yakuman were omitted.
- **Expected:** Honroutou two han, stacking with seven pairs or toitoi and applicable yaku; shousangen two han plus dragon triplets; daisangen/chinroutou yakuman.
- **Observed / cause:** `packages/engine/src/scoring.ts:524` and `:563` explicitly classified honroutou as yakuman; dragon/terminal checks absent from `evaluateStandard`/`countsYakuman`. `test/scoring-vectors.ts:1345` mirrored the error.
- **Reproduce:** Score `1199m1199p1199s11z`, ron East, nondealer, no dora/riichi. Compare 4 han 25 fu to baseline yakuman output.
- **Correction / complexity:** Add correct ordinary and yakuman checks; remove tentative-honroutou yakuman suppression. Medium: decomposition and stacking affect several cases.
- **Acceptance:** Exact 6,400 honroutou seven-pairs ron; 6-han/60-fu 12,000 open-toitoi/sanankou example; shousangen 8,000; open daisangen 32,000; daisangen + all honors 64,000; chinroutou 32,000.
- **Proposed PR / state:** Engine correctness; corrected with written arithmetic in corpus.

### RULE-02 — P1 — Kan shrinks the dead wall and permits impossible fifth kan

- **Area / impact:** Wall accounting and action legality; extra playable tiles, incorrect last-tile context, eventual undefined replacement draw.
- **Expected:** Fourteen tiles remain in the dead wall after every kan; at most four replacement draws, only when a live tile can replenish it.
- **Observed / cause:** `game.ts:438` subtracts only `livePtr`; `:897` and `:1089` draw replacement tiles without retiring a live tail tile; `:678`/`:756` do not enforce kan limits.
- **Reproduce:** Script one ankan followed by no wins/calls: baseline emits 70 normal + one replacement draw rather than 69 + one. Four kans by one player could leave another player's quad callable.
- **Correction / complexity:** Compute live remainder minus `rinshanUsed`, gate all kan types and final-tile calls. Medium: alters every downstream seeded decision after kan.
- **Acceptance:** One/four-kan fixtures conserve 70 post-deal draws; no retired tail drawn; no fifth kan; final live draw has no kan, final discard no meld calls.
- **Proposed PR / state:** Engine correctness, dependent on historical replay compatibility; corrected.

### RULE-03 — P1 — Riichi ankan always rejected and riichi hand may be opened

- **Area / impact:** Legal actions; players cannot make a permitted concealed kan and can be offered illegal open calls.
- **Expected:** Drawn-tile kan preserving the declared waits is permitted under the named default; riichi forbids chi/pon/open kan.
- **Observed / cause:** `game.ts:668` analyzes the 14-tile hand, wiping `player.waits`, then `:693` compares against that empty array. `:755` does not check riichi when making call choices.
- **Reproduce:** Declare riichi with `111m234p678s55p34s`, draw fourth 1m; original 2s/5s waits persist after ankan, but baseline rejects it. Another player's 1m can offer an open kan/pon.
- **Correction / complexity:** Reconstruct pre-draw waits, require drawn tile matches quad, gate open calls. Medium.
- **Acceptance:** Scripted legal ankan/rinshan win; no open-meld decision is offered to riichi player. Independent review also pins `234456m7778899p`: before drawing 7p the waits are 7p/8p/9p, and a 7p ankan would remove the 7p wait, so it is denied. The pre-draw ownership vector must exclude the new tile, including when that tile completes the hand. WRC's stricter all-interpretations test remains a separately documented choice.
- **Proposed PR / state:** Engine correctness; corrected.

### RULE-04 — P1 — Concealed/additional kan leaves ippatsu active

- **Area / impact:** Scoring and education; extra han awarded after an interrupting kan.
- **Expected:** A completed kan interrupts ippatsu for every riichi player.
- **Observed / cause:** `game.ts:891` sets `anyCall` but does not clear ippatsu; the cancellation exists only in `formCallMeld` at `:1060`.
- **Reproduce:** The RULE-03 riichi hand declares ankan on its next draw and wins on the replacement tile; baseline cannot reach this because of RULE-03, but incorrectly retains ippatsu in its kan routine.
- **Correction / complexity:** Cancel on completed ankan/shouminkan, retaining existing meld-call cancellation. Small.
- **Acceptance:** Legal riichi ankan + rinshan win includes double-riichi/rinshan and excludes ippatsu; existing immediate ippatsu fixture continues passing.
- **Proposed PR / state:** Engine correctness; corrected.

### RULE-05 — P1 — Riichi declaration deal-in pays an unestablished stick

- **Area / impact:** Settlement, every declaration deal-in; discarder loses an extra 1,000.
- **Expected:** Accept riichi and charge its stake only after the declaration discard survives ron. Pon/chi of that discard still accepts riichi.
- **Observed / cause:** `game.ts:613` debits and emits riichi before the discard/ron window at `:650`.
- **Reproduce:** Seat0 declares while discarding 6s; seat1 holds `345m345p345s678p6s` and rons the declaration tile.
- **Correction / complexity:** Commit declaration after ron resolution, before lower-priority calls. Small, but event order changes: accepted `riichi` follows its `discard` event in engine v2.
- **Acceptance:** No riichi event/new stick/debit when declaration discard deals in; winner receives only pre-existing pot; ordinary accepted riichi/ippatsu tests pass.
- **Proposed PR / state:** Engine correctness + versioned replay contract; corrected.

### RULE-06 — P1 — Passing a no-yaku completion does not impose temporary furiten

- **Area / impact:** Ron legality; player can win a later yaku-bearing wait within the same uninterrupted turn cycle.
- **Expected:** A passed completing tile imposes temporary furiten even without a yaku.
- **Observed / cause:** `game.ts:949` skips the entire pass/furiten branch when `canRon` is false because scoring has no yaku.
- **Reproduce:** `123m456p789s55m66z` waits on 5m/green dragon; pass 5m (no yaku), then see green before drawing. Ron must be blocked until next draw.
- **Correction / complexity:** Track passed structural completions independently from a legal ron prompt; clear on replacement draws as well as normal draws. Small.
- **Acceptance:** Scripted green-dragon discard before next draw cannot win; one after the draw can. Existing three furiten forms remain passing.
- **Proposed PR / state:** Engine correctness; corrected.

### RULE-07 — P1 — Invalid physical hands accepted by recursive analyzers/scorer

- **Area / impact:** Library and future replay/content ingestion; impossible scoring positions and malformed counts may reach recursive search.
- **Expected:** Exactly 34 integer counts in 0..4, legal meld/wind/tile domains; supplied walls contain the canonical 136 unique copies.
- **Observed / cause:** `hand.ts:120` validates only total tile count; `scoring.ts:630` validates vector length/total but not per-type counts. Four corpus hands used a fifth copy of an already-kan tile.
- **Reproduce:** Baseline `rinshan-tanyao-tsumo-2-40` has `2222s` plus `234s`; two sankantsu cases have `5555s` plus `345s`; honitsu-sankantsu has four 3p plus sequence 345p.
- **Correction / complexity:** Shared vector validation, visible-count conservation, scorer domain checks, wall identity validation and valid independently re-derived fixtures. Medium.
- **Acceptance:** Reject negative/fractional/nonfinite/fifth counts, malformed vectors/meld count, impossible visible counts, duplicate/noncanonical supplied walls. Every corpus hand obeys physical copy limits.
- **Proposed PR / state:** Engine correctness/input validation; corrected. This is not an untrusted-code sandbox.

### RULE-08 — P1 — Declared kan incorrectly qualifies for chuuren

- **Area / impact:** Scoring; a closed declared-kan hand may be overpaid as nine gates.
- **Expected:** Chuuren requires an undeclared fourteen-tile hand; ankan preserves menzen but does not preserve chuuren eligibility.
- **Observed / cause:** `scoring.ts:590` explicitly allows ankan and tests only minimum suit counts.
- **Reproduce:** Score `111123455678999m` with declared 1111m ankan, winning 5m by tsumo.
- **Correction / complexity:** Require no declared melds for chuuren. Small.
- **Acceptance:** This hand scores menzen tsumo + chinitsu, 7 han 70 fu, 3,000/6,000; ordinary/pure chuuren fixtures remain passing.
- **Proposed PR / state:** Engine correctness; corrected.

### RULE-09 — P2 — Decision views are live mutable engine references

- **Area / impact:** Analysis integrity, extensibility and policy trust boundary; retained views can gain future discards, and JavaScript can mutate engine tiles/options despite TypeScript readonly.
- **Expected:** Snapshot only authorized information at that decision; validate returned actions against engine-owned choices.
- **Observed / cause:** `game.ts:462` returns `me.melds`, player discards/meld arrays and tile objects by reference. Policies receive the same context object used for validation.
- **Reproduce:** Retain a first-turn view; later inspect its pond. Mutate a tile or push an ankan choice through JavaScript.
- **Correction / complexity:** Copy views, tiles, melds/discards and policy-facing contexts. Small, bounded by visible table size; benchmark remains required before server concurrency claims.
- **Acceptance:** Captured snapshots do not acquire later events; modifying a view cannot alter engine state; injected context option does not authorize illegal action. The snapshot regression also mutates a dora-indicator object's type: later turns retain the original indicator because its tile objects are copied as well as its array.
- **Proposed PR / state:** Engine correctness/public information boundary; corrected.

### RULE-10 — P2 — Implicit call priority phase requires stateful policy inference

- **Area / impact:** AI, coach and future replay drivers; duplicate call-stage inference is fragile.
- **Expected:** Each decision says which legal priority stage is being decided.
- **Observed / cause:** `game.ts:977` and `:1005` both use `phase: "call"`, advertising both chi and pon/kan in the shared context constructor.
- **Correction / complexity:** Add backward-compatible optional `callStage: "pon-kan" | "chi"`; current engine always supplies it and advertises only choices valid at that stage. Small; legacy contexts retain old behavior through compatibility drivers.
- **Acceptance:** Existing chi/pon scenarios and AI legality/hidden-state suites remain passing; no second-stage state is inferred for v2.
- **Proposed PR / state:** Engine/AI contract foundation; corrected with AI consumer changes.

## Verification record

Commands/results are maintained in the PR's test evidence. Engine-focused validation includes `game-regressions.test.ts`, `validation.test.ts`, updated scoring corpus, existing scoring/hand/tile/wall/scenario suites, and full-game soak. A full independent scoring differential against another maintained implementation, exhaustive interpretation-preserving riichi-kan proof, property-based call permutations, and physical-device performance remain future work; they are not implied by unit-test counts.

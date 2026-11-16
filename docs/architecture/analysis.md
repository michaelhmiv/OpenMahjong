# Analysis architecture

Implemented scope: exact structural facts, qualified heuristic discard ranking,
template explanations, and a headless comparison primitive. There is no
Monte Carlo engine, expert-play certification, learned opponent model, or
calibrated win probability.

| Layer | Current owner | Contract |
| --- | --- | --- |
| Rules and legal actions | `packages/engine` | Deterministic game, explicit house ruleset, scoring, own-seat `PlayerView`, engine-produced contexts |
| Structural position facts | `packages/ai/src/analysis.ts` | Fast cached shanten/ukeire/waits; count validation and optional own-meld counts for physically possible waits |
| Public accounting and defensive heuristics | `packages/ai/src/danger.ts` | Count physical exposed copies once; estimate danger against each riichi opponent |
| Candidate evaluation and policy ordering | `packages/ai/src/evaluate.ts` | Shared discard evaluation, weighted ranking, value proxy and riichi heuristic |
| Opponent actions | `packages/ai/src/policy.ts` | Uses shared discard evaluation; call strategy is still a separate lightweight heuristic |
| Explanation and comparison | `packages/coach/src/advice.ts`, `analysis-contract.ts` | Structured evidence, qualified copy, version metadata, chosen/alternative deltas |
| Presentation | Existing web guided hints and lessons | Render validated facts; no language model invents rules, numbers or actions |

`TurnAdvice.analysis` carries schema version 1, analysis revision
`discard-analysis-2`, engine revision 2, policy revision 2, and
`openmahjong-riichi@1`. It lists exact facts, heuristic assessments, and known
limitations. Serialization version, engine revision, policy revision, and rule
profile are separate concepts; one cannot substitute for another.

The historical engine and AI policy are frozen under `src/legacy/v1` solely
for old records and unfinished-game continuation. Fixes land in the current
implementation. New analysis must identify which interpretation produced the
position; callers must not pass a historical position and silently tag it as a
current-engine result.

## Boundary for post-game review

A review adapter must reconstruct the position immediately before the chosen
action and obtain a detached own-seat view and matching context. It must not
pass complete engine state, final hidden hands, or later events into the
evaluator. The current coach supports only player-perspective discard
analysis. Full-information replay must be a separate labeled inspection mode;
it must not produce claims about information available earlier.

The implemented `compareDiscards` primitive exposes structural and heuristic
differences and exact bonus-dora retention without assigning numerical grades
or outcome-based blame. The opponent keeps a lightweight canonical instance
per type; the coach analyzes all physical discard instances so a legal human
choice of a different plain copy or red five remains reviewable. A
future review UI can build navigation, key positions and practice links on
this contract after its rendering and accessibility review. No new display
surface is implied by the headless API.

## Performance and extension seams

The AI memoizes suited/honor segment decompositions and ukeire keyed by counts,
meld count and public visibility. Cache bounds are 250,000 entries per segment
cache and 50,000 ukeire results; bounds limit growth but are not a measured
mobile memory budget. Current guided analysis is synchronous. Heavy review
analysis belongs in a worker with cancellation, a time budget, and a versioned
cache key before it is exposed during play.

Next coherent units are: mandatory-discard-aware call evaluation, engine
exposure of the player's own temporary/pass-furiten flags, independently
reviewed strategy fixtures, then a player-perspective review UI and
review-to-practice integration. Advanced probabilistic methods require
separate validation and demonstrated educational benefit. See
[`../analysis/methodology.md`](../analysis/methodology.md) for exact field
semantics and the validation plan.

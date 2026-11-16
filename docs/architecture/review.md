# Decision review core

`packages/web/src/review.ts` is a headless foundation, not the completed
post-game Review screen. The existing history interface still opens final
standings; interactive review and practice collection controls remain work
for later reviewed UI changes.

`buildDecisionReview` first validates the saved replay envelope and its
action/count/size limits. It then consumes the recorded four-seat actions
through one instance of the matching engine. It never invokes an opponent
policy or invents an action after a partial log ends. Wrong action phases,
illegal actions, and unused actions following match completion are errors.

Only the human seat's decision positions are returned. Each contains its
index in the full action log, a zero-based hand serial (including dealer
repeats), the preceding event sequence, the exact action context, the chosen
action, and the `PlayerView` available at that instant. The view and context
are cloned and recursively frozen. Opponent hands, wall contents, the full
event log, and final match results are not part of the returned review.

`analyzeReviewDecision` evaluates one selected current-engine discard using
that saved public view and context. It shares the live coach's structured
facts and `compareDiscards` tradeoffs; it does not read later decisions or
grade a choice from the eventual outcome. Evaluation is requested per
position rather than running every discard evaluator during reconstruction.
Call strategy, expected value, win probability, and calibrated mistake grades
are not implemented. The coach's own methodology limitations still apply.

Version-1 replay positions use the frozen historical engine and are
display-only. They never receive analysis labeled as current engine version
2. A partial replay reports `complete: false`; this is a recorded prefix,
not evidence that the game ended at that point.

`ReviewNavigator` supports explicit position indices, previous/next without
wrapping, and navigation to the first recorded human decision in a hand.
Hands with no recorded human action have no navigable decision entry.

The current practice catalog is curated and independently validated. This
module does not convert a heuristic recommendation into a graded puzzle or
claim that a game-derived exercise has passed that validation pipeline.

Verification: `npx vitest run packages/web/test/review.test.ts` compares the
reconstruction with views captured in an independently played full game,
compares full and truncated-prefix analysis, checks the immutable information
boundary and legacy behavior, and rejects illegal/trailing records.

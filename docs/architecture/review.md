# Decision review core

The expanded #39 entry is now `board-review.ts` / `board-review-ui.ts`.
`reconstructReview` consumes a recorded game once and returns two separate
envelopes: immutable public decision snapshots for the coach, and full recorded
events/exact chi hints for the board. `buildDecisionReview` retains its original
public-only return contract. BoardTimeline indexes all hands (including repeats
and hands without human actions), significant events, and a TableModel checkpoint
every 16 events. Seeking clones a checkpoint and folds at most 15 more events.
No engine replay or AI policy executes while moving the slider. Full board data
is never added to ReviewDecision or accepted by coach evaluators.

History opens this reconstruction without assigning to the live runner, resetting
its model, or writing the resume slot. Saved-decision and Review-to-Practice paths
select the original decision on return. Historical v1 stays display-only. The
decision comparison is embedded in board review; drilled-in screens carry no
bottom navigation. The older focused-review component remains an analysis view.

`packages/web/src/review.ts` is the headless reconstruction and analysis
boundary. `packages/web/src/review-ui.ts` presents it through the approved
Review layout in [`docs/design/proposals`](../design/proposals/index.html).
The App opens Review from a finished game's standings and connects its
practice action to related validated exercises and saved decision references.

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
Hands with no recorded human action have no navigable decision entry. The
screen exposes these through native decision buttons and a labeled Hand
selector, retaining distinct entries for dealer repeats.

The Review screen shows the original own hand, live-wall count, riichi
threat count, and expandable public table details: scores, discard histories,
melds, and dora indicators. It does not expose opponent hands, wall contents,
or final results alongside a decision. This is a public-information review,
not a full-information or alternate-outcome simulation.

For current-engine discards, the screen compares the actual physical tile
discarded with the shared policy's suggested alternative. A labeled native
selector allows any legal physical discard, including distinct red and
plain fives other than the already displayed chosen tile. When the chosen
tile matches the recommendation, the comparison starts at a distinct legal
option. When only one discard is legal, the screen shows one row and explains
the restriction; it offers no fictitious alternative. It displays shanten, unseen improving copies, dora discarded,
shape-completing waits, and explicitly qualified defensive facts. No choice
is graded from the eventual result. The advice is computed on first opening
a position, then cached; changing its alternative only compares existing
structured facts. Call and special-action positions show the recorded action
and legal context without inventing a strategic grade. Historical version-1
positions have a prominent historical label and no current analysis.

`mountReview` accepts a reconstructed `DecisionReview`, a tile renderer,
Back and Practice callbacks, and an optional table-inspection callback. It
returns a controller with explicit decision selection, current-position
access, and cleanup. It uses DOM text nodes for external values, native
controls, focus restoration after re-rendering, and an accessible scrolling
main region. The approved layout has no new fonts or palette colors.

The current practice catalog is curated and independently validated. Review
passes the original position and relevant skill tags to the App. Discards
suggest ukeire, shanten, and wait-reading; calls offer the existing hand
construction foundation, labeled "Practice hand building". Dedicated calling
drills are not yet in the catalog. The App stores bounded decision references
so a learner can return to the same reviewed position. This does not convert
a heuristic recommendation into a graded puzzle or claim that a game-derived
exercise has passed that validation pipeline.

Verification: `npx vitest run packages/web/test/review.test.ts` compares the
reconstruction with views captured in an independently played full game,
compares full and truncated-prefix analysis, checks the immutable information
boundary and legacy behavior, and rejects illegal/trailing records.
`packages/web/test/review-ui.test.ts` checks the independent approved fixture's
42-versus-58 unseen-copy comparison, alternative and hand navigation, public
table snapshots, call and legacy limitations, practice callbacks, keyboard
focus preservation, empty records, and cleanup. Browser evidence covers the
separate App entry points and responsive rendering.

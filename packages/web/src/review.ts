/** Decision review from recorded actions. No UI, hidden-hand replay,
 * invented actions, outcome grading, or current analysis of legacy rules. */
import {
  Game, LegacyGame,
  type CallAction, type CallContext, type PlayerView, type Policy,
  type TurnAction, type TurnContext,
} from "@openmahjong/engine";
import { adviseDiscard, compareDiscards, type DiscardComparison, type TurnAdvice } from "@openmahjong/coach";
import { validateSavedGame } from "./replay.js";

interface DecisionPositionBase {
  /** Index in the complete four-seat decision log, not just human actions. */
  readonly decisionIndex: number;
  /** Zero-based hand serial; repeated dealer hands have distinct indices. */
  readonly handIndex: number;
  readonly eventSequence: number;
  readonly engineVersion: 1 | 2;
  readonly informationMode: "player-perspective";
  readonly view: PlayerView;
}
export type ReviewDecision = DecisionPositionBase & (
  | { readonly kind: "turn"; readonly context: TurnContext; readonly action: TurnAction }
  | { readonly kind: "call"; readonly context: CallContext; readonly action: CallAction }
);
export interface DecisionReview {
  readonly schemaVersion: 1;
  readonly engineVersion: 1 | 2;
  readonly complete: boolean;
  readonly consumedDecisions: number;
  readonly positions: readonly ReviewDecision[];
}
class EndOfRecordedPrefix {}
const TURN_TYPES = new Set(["discard", "ankan", "shouminkan", "tsumo", "kyuushu"]);

function immutableSnapshot<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

/** One simulation pass. Exhausting a partial log suspends before the
 * next action, even if it belongs to an AI seat. No AI policy is run. */
export function buildDecisionReview(input: unknown): DecisionReview {
  const saved = validateSavedGame(input);
  const engineVersion = saved.v === 1 ? 1 : 2;
  const positions: ReviewDecision[] = [];
  let cursor = 0;
  let scanned = 0;
  let handIndex = -1;
  let game: Game | LegacyGame;
  const take = () => {
    if (cursor === saved.decisions.length) throw new EndOfRecordedPrefix();
    for (; scanned < game.events.length; scanned++) {
      if (game.events[scanned]!.type === "hand-start") handIndex++;
    }
    return saved.decisions[cursor++]!;
  };
  const capture = (position: Omit<DecisionPositionBase, "informationMode" | "engineVersion" | "decisionIndex" | "handIndex" | "eventSequence"> &
    ({ kind: "turn"; context: TurnContext; action: TurnAction } | { kind: "call"; context: CallContext; action: CallAction })) => {
    if (position.view.seat !== saved.humanSeat) return;
    positions.push(immutableSnapshot({ ...position, decisionIndex: cursor - 1, handIndex,
      eventSequence: game.events.length - 1, engineVersion, informationMode: "player-perspective" }));
  };
  const policy: Policy = {
    turn(view, context) {
      const action = take();
      if (!TURN_TYPES.has(action.type)) throw new Error(`Decision log desync at ${cursor - 1}: expected turn action`);
      capture({ kind: "turn", view, context, action: action as TurnAction });
      return action as TurnAction;
    },
    call(view, context) {
      const action = take();
      if (TURN_TYPES.has(action.type)) throw new Error(`Decision log desync at ${cursor - 1}: expected call action`);
      capture({ kind: "call", view, context, action: action as CallAction });
      return action as CallAction;
    },
  };
  const Engine = saved.v === 1 ? LegacyGame : Game;
  game = new Engine({ seed: saved.seed, length: saved.length, policies: [policy, policy, policy, policy] });
  let complete = false;
  try {
    game.run();
    complete = true;
    if (cursor !== saved.decisions.length) throw new Error("Decision log desync: unused decisions after game end");
  } catch (error) {
    if (!(error instanceof EndOfRecordedPrefix)) throw error;
  }
  return Object.freeze({ schemaVersion: 1, engineVersion, complete, consumedDecisions: cursor,
    positions: Object.freeze(positions) });
}

export type ReviewAnalysis =
  | { readonly available: true; readonly advice: TurnAdvice; readonly comparison: DiscardComparison }
  | { readonly available: false; readonly reason: "legacy-rules" | "not-a-discard" };

/** Analysis is requested per position so reconstructing a review never
 * runs every discard evaluator on the UI thread. Its only position input
 * is the immutable player view and legal context from that instant. */
export function analyzeReviewDecision(position: ReviewDecision, alternativeTileId?: number): ReviewAnalysis {
  if (position.engineVersion === 1) return { available: false, reason: "legacy-rules" };
  if (position.kind !== "turn" || position.action.type !== "discard") return { available: false, reason: "not-a-discard" };
  const advice = adviseDiscard(position.view, position.context);
  return { available: true, advice, comparison: compareDiscards(advice, position.action.tileId, alternativeTileId) };
}

/** Navigation is independent of presentation and never wraps silently. */
export class ReviewNavigator {
  private index = 0;
  constructor(readonly review: DecisionReview) {}
  get current(): ReviewDecision | null { return this.review.positions[this.index] ?? null; }
  get positionIndex(): number { return this.index; }
  goTo(index: number): ReviewDecision {
    if (!Number.isInteger(index) || index < 0 || index >= this.review.positions.length) throw new RangeError("Review position out of range");
    this.index = index;
    return this.current!;
  }
  next(): ReviewDecision | null {
    return this.index + 1 < this.review.positions.length ? this.goTo(this.index + 1) : null;
  }
  previous(): ReviewDecision | null { return this.index > 0 ? this.goTo(this.index - 1) : null; }
  goToHand(handIndex: number): ReviewDecision {
    const index = this.review.positions.findIndex((position) => position.handIndex === handIndex);
    if (index < 0) throw new RangeError("Hand has no recorded player decision");
    return this.goTo(index);
  }
}

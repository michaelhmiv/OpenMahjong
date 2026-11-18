/** Decision review from recorded actions. No UI, hidden-hand replay,
 * invented actions, outcome grading, or current analysis of legacy rules. */
import {
  Game, LegacyGame, VariantGame, type VariantId,
  type CallAction, type CallContext, type PlayerView, type Policy,
  type TurnAction, type TurnContext, type GameEvent, type GameResult,
} from "@openmahjong/engine";
import {
  adviseCall, adviseDiscard, adviseKan, adviseRiichi, adviseWin, compareDiscards,
  type CallAdvice, type DiscardComparison, type KanAdvice, type RiichiGrade, type TurnAdvice, type WinAdvice,
} from "@openmahjong/coach";
import { validateSavedGame, type MomentRecord } from "./replay.js";
import type { ChiHint } from "./model.js";

interface DecisionPositionBase {
  readonly controller?: "human" | "clock" | "bot";
  /** Index in the complete four-seat decision log, not just human actions. */
  readonly decisionIndex: number;
  /** Zero-based hand serial; repeated dealer hands have distinct indices. */
  readonly handIndex: number;
  readonly eventSequence: number;
  readonly engineVersion: 1 | 2 | 3;
  readonly variant?: VariantId;
  readonly informationMode: "player-perspective";
  readonly view: PlayerView;
}
export type ReviewDecision = DecisionPositionBase & (
  | { readonly kind: "turn"; readonly context: TurnContext; readonly action: TurnAction }
  | { readonly kind: "call"; readonly context: CallContext; readonly action: CallAction }
);
export interface DecisionReview {
  readonly schemaVersion: 1;
  readonly engineVersion: 1 | 2 | 3;
  readonly variant?: VariantId;
  readonly complete: boolean;
  readonly consumedDecisions: number;
  readonly positions: readonly ReviewDecision[];
  /** Validated moment records from the saved game (empty when the
   * game predates moment capture or is a legacy replay). */
  readonly moments: readonly MomentRecord[];
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
  return reconstructReview(input).review;
}

/** Full replay material is deliberately separate from DecisionReview and
 * ReviewDecision: none of this envelope is accepted by a coach evaluator. */
export interface ReconstructedReview {
  readonly review: DecisionReview;
  readonly events: readonly GameEvent[];
  readonly chiHints: ReadonlyMap<number, ChiHint>;
  readonly result: GameResult | null;
  readonly humanSeat: number;
}
export function reconstructReview(input: unknown): ReconstructedReview {
  const saved = validateSavedGame(input);
  const engineVersion = saved.v === 1 ? 1 : saved.v === 3 ? 3 : 2;
  const positions: ReviewDecision[] = [];
  let cursor = 0;
  let scanned = 0;
  let handIndex = -1;
  let lastChi: readonly [number, number] | undefined;
  const chiHints = new Map<number, ChiHint>();
  let game: Game | LegacyGame | VariantGame;
  const scan = () => {
    for (; scanned < game.events.length; scanned++) {
      const event = game.events[scanned]!;
      if (event.type === "hand-start") handIndex++;
      if (event.type === "call" && event["kind"] === "chi" && lastChi) {
        chiHints.set(event.seq, { tileIds: lastChi });
        lastChi = undefined;
      }
    }
  };
  const take = () => {
    scan();
    if (cursor === saved.decisions.length) throw new EndOfRecordedPrefix();
    return saved.decisions[cursor++]!;
  };
  const capture = (position: Omit<DecisionPositionBase, "informationMode" | "engineVersion" | "decisionIndex" | "handIndex" | "eventSequence"> &
    ({ kind: "turn"; context: TurnContext; action: TurnAction } | { kind: "call"; context: CallContext; action: CallAction })) => {
    if (position.view.seat !== saved.humanSeat) return;
    positions.push(immutableSnapshot({ ...position, decisionIndex: cursor - 1, handIndex,
      eventSequence: game.events.length - 1, engineVersion, ...(saved.v === 3 ? { variant: saved.variant } : {}), informationMode: "player-perspective" }));
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
      if (action.type === "chi") lastChi = action.tileIds;
      capture({ kind: "call", view, context, action: action as CallAction });
      return action as CallAction;
    },
  };
  const Engine = saved.v === 1 ? LegacyGame : Game;
  game = saved.v === 3 ? new VariantGame({ seed: saved.seed, variant: saved.variant, length: saved.length, policies: [policy, policy, policy, policy] }) : new Engine({ seed: saved.seed, length: saved.length, policies: [policy, policy, policy, policy] });
  let complete = false;
  let result: GameResult | null = null;
  try {
    result = game.run();
    complete = true;
    if (cursor !== saved.decisions.length) throw new Error("Decision log desync: unused decisions after game end");
  } catch (error) {
    if (!(error instanceof EndOfRecordedPrefix)) throw error;
  }
  scan();
  const review: DecisionReview = Object.freeze({ schemaVersion: 1, engineVersion, ...(saved.v === 3 ? { variant: saved.variant } : {}), complete, consumedDecisions: cursor,
    positions: Object.freeze(positions),
    moments: Object.freeze(saved.v === 2 && saved.moments ? [...saved.moments] : []) });
  return { review, events: immutableSnapshot(game.events), chiHints, result, humanSeat: saved.humanSeat };
}

export type ReviewAnalysis =
  | { readonly available: true; readonly advice: TurnAdvice; readonly comparison: DiscardComparison }
  | { readonly available: false; readonly reason: "legacy-rules" | "not-a-discard" | "variant-evaluator" };

/** Analysis is requested per position so reconstructing a review never
 * runs every discard evaluator on the UI thread. Its only position input
 * is the immutable player view and legal context from that instant. */
export function analyzeReviewDecision(position: ReviewDecision, alternativeTileId?: number): ReviewAnalysis {
  if (position.engineVersion === 1) return { available: false, reason: "legacy-rules" };
  if (position.engineVersion === 3) return { available: false, reason: "variant-evaluator" };
  if (position.kind !== "turn" || position.action.type !== "discard") return { available: false, reason: "not-a-discard" };
  const advice = adviseDiscard(position.view, position.context);
  return { available: true, advice, comparison: compareDiscards(advice, position.action.tileId, alternativeTileId) };
}

// ---------------------------------------------------------------------------
// Coaching moments (G1–G4): call / kan / riichi / win grades
// ---------------------------------------------------------------------------

export type MomentGrade =
  | { readonly kind: "call"; readonly advice: CallAdvice }
  | { readonly kind: "kan"; readonly advice: KanAdvice }
  | { readonly kind: "riichi"; readonly advice: RiichiGrade }
  | { readonly kind: "win"; readonly advice: WinAdvice };

export type ReviewMomentAnalysis =
  | { readonly available: true; readonly grades: readonly MomentGrade[] }
  /** legacy-rules: engine v1 replay. not-recorded: the window held a
   * graded offer but the game predates moment capture. unverified:
   * a record exists but its offers do not match the reconstructed
   * position — never grade from an unverified record. no-moment:
   * the window held no graded offer. */
  | { readonly available: false; readonly reason: "legacy-rules" | "not-recorded" | "unverified" | "no-moment" };

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function recordMatchesPosition(record: MomentRecord, position: ReviewDecision): boolean {
  if (record.kind !== position.kind) return false;
  if (JSON.stringify(record.choice) !== JSON.stringify(position.action)) return false;
  if (position.kind === "call") {
    const ctx = position.context;
    return (
      record.phase === ctx.phase &&
      record.tileType === ctx.tile.type &&
      record.fromSeat === ctx.fromSeat &&
      record.canRon === ctx.canRon &&
      record.canPon === ctx.canPon &&
      record.canKan === ctx.canKan &&
      JSON.stringify(record.chiOptions ?? []) === JSON.stringify(ctx.chiOptions)
    );
  }
  const ctx = position.context;
  return (
    record.canTsumo === ctx.canTsumo &&
    record.drawnTileType === (ctx.drawnTile?.type ?? null) &&
    sameIds(record.ankanOptions ?? [], ctx.ankanOptions) &&
    sameIds(record.shouminkanOptions ?? [], ctx.shouminkanOptions) &&
    sameIds(record.riichiDiscardIds ?? [], ctx.riichiDiscardIds)
  );
}

function positionHasOffer(position: ReviewDecision): boolean {
  if (position.kind === "call") {
    const ctx = position.context;
    return ctx.canRon || ctx.canPon || ctx.canKan || ctx.chiOptions.length > 0;
  }
  const ctx = position.context;
  return ctx.canTsumo || ctx.ankanOptions.length > 0 || ctx.shouminkanOptions.length > 0 || ctx.riichiDiscardIds.length > 0;
}

/** Grade the coaching moments at one position from its recorded
 * moment. The record is verified against the reconstructed position
 * first (offers and choice must match exactly); a game recorded
 * before moment capture grades discards only — moments are never
 * fabricated for it. Grades are outcome-blind: the evaluators see
 * only the view and context of the moment itself. */
export function analyzeReviewMoments(review: DecisionReview, position: ReviewDecision): ReviewMomentAnalysis {
  if (position.engineVersion === 1) return { available: false, reason: "legacy-rules" };
  if (position.engineVersion === 3) return { available: false, reason: "no-moment" };
  // Hand-built reviews (older fixtures) may omit the moments field;
  // treat that as a game with no recorded moments.
  const record = (review.moments ?? []).find((m) => m.decisionIndex === position.decisionIndex);
  if (!record) {
    return { available: false, reason: positionHasOffer(position) ? "not-recorded" : "no-moment" };
  }
  if (!recordMatchesPosition(record, position)) return { available: false, reason: "unverified" };
  const grades: MomentGrade[] = [];
  if (position.kind === "call") {
    grades.push({ kind: "call", advice: adviseCall(position.view, position.context) });
  } else {
    const ctx = position.context;
    if (ctx.canTsumo && (position.action.type === "tsumo" || position.action.type === "discard")) {
      const win = adviseWin(position.view, ctx);
      if (win) grades.push({ kind: "win", advice: win });
    }
    if (ctx.ankanOptions.length > 0 || ctx.shouminkanOptions.length > 0) {
      const kan = adviseKan(position.view, ctx);
      if (kan) grades.push({ kind: "kan", advice: kan });
    }
    if (ctx.riichiDiscardIds.length > 0 && position.action.type === "discard") {
      const riichi = adviseRiichi(position.view, ctx);
      if (riichi) grades.push({ kind: "riichi", advice: riichi });
    }
  }
  return grades.length > 0 ? { available: true, grades } : { available: false, reason: "no-moment" };
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

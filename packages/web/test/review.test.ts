import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_RULESET, ENGINE_VERSION, Game,
  type PlayerView, type Policy, type TurnContext,
} from "@openmahjong/engine";
import { AI_POLICY_VERSION, createAiPolicy } from "@openmahjong/ai";
import { adviseDiscard, compareDiscards } from "@openmahjong/coach";
import { analyzeReviewDecision, buildDecisionReview, ReviewNavigator, type DecisionReview } from "../src/review.js";
import type { CurrentSavedGame } from "../src/replay.js";
import type { Decision } from "../src/runner.js";

let saved: CurrentSavedGame;
let review: DecisionReview;
const originalViews: PlayerView[] = [];
let firstContext: TurnContext;

beforeAll(() => {
  const decisions: Decision[] = [];
  const ai = createAiPolicy();
  const policy: Policy = {
    turn(view, context) {
      if (view.seat === 0) {
        originalViews.push(structuredClone(view));
        if (!firstContext) firstContext = structuredClone(context);
      }
      const action = ai.turn(view, context);
      decisions.push(action);
      return action;
    },
    call(view, context) {
      if (view.seat === 0) originalViews.push(structuredClone(view));
      const action = ai.call(view, context);
      decisions.push(action);
      return action;
    },
  };
  const game = new Game({ seed: "review-core", length: "east", policies: [policy, policy, policy, policy] });
  game.run();
  saved = { v: 2, seed: "review-core", length: "east", humanSeat: 0, decisions,
    engineVersion: ENGINE_VERSION, ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version }, aiVersion: AI_POLICY_VERSION };
  review = buildDecisionReview(saved);
}, 60_000);

describe("decision review public-information boundary", () => {
  it("reconstructs the exact original human views in one complete recorded pass", () => {
    expect(review.complete).toBe(true);
    expect(review.consumedDecisions).toBe(saved.decisions.length);
    expect(review.positions.map((position) => position.view)).toEqual(originalViews);
    expect(review.positions.length).toBeGreaterThan(10);
    expect(review.positions[0]!.context).toEqual(firstContext);
    for (const position of review.positions) {
      expect(position.action).toEqual(saved.decisions[position.decisionIndex]);
      expect(position.informationMode).toBe("player-perspective");
      expect(position.view).not.toHaveProperty("wall");
      expect(position.view).not.toHaveProperty("seed");
      for (const player of position.view.players) {
        expect(player).not.toHaveProperty("hand");
        expect(player).not.toHaveProperty("tiles");
      }
    }
    expect(review).not.toHaveProperty("scores");
    expect(review).not.toHaveProperty("events");
  });

  it("stops at a recorded prefix without generating a future action", () => {
    const partial = buildDecisionReview({ ...saved, decisions: saved.decisions.slice(0, 1) });
    expect(partial.complete).toBe(false);
    expect(partial.consumedDecisions).toBe(1);
    expect(partial.positions).toHaveLength(1);
    expect(partial.positions[0]).toEqual(review.positions[0]);
    expect(analyzeReviewDecision(partial.positions[0]!)).toEqual(analyzeReviewDecision(review.positions[0]!));
    const empty = buildDecisionReview({ ...saved, decisions: [] });
    expect(empty.positions).toEqual([]);
    expect(empty.complete).toBe(false);
  });

  it("earlier views and contexts cannot be changed by later play or callers", () => {
    const first = review.positions[0]!;
    expect(Object.isFrozen(first.view.hand[0])).toBe(true);
    expect(Object.isFrozen(first.context)).toBe(true);
    expect(() => { (first.view.hand[0] as { id: number }).id = 135; }).toThrow();
    expect(() => { (first.view.players[1]!.discards as unknown[]).push({}); }).toThrow();
    expect(() => { (first.context as { canTsumo: boolean }).canTsumo = true; }).toThrow();
    expect(first.view.players.every((player) => player.discards.length === 0)).toBe(true);
    expect(review.positions.some((position) => position.view.players.some((player) => player.discards.length > 0))).toBe(true);
  });

  it("compares a recorded discard using only its original public position", () => {
    const position = review.positions.find((position) => position.kind === "turn" && position.action.type === "discard")!;
    if (position.kind !== "turn" || position.action.type !== "discard") throw new Error("missing fixture discard");
    const result = analyzeReviewDecision(position);
    expect(result.available).toBe(true);
    if (!result.available) throw new Error("missing analysis");
    const advice = adviseDiscard(position.view, position.context);
    expect(result.advice).toEqual(advice);
    expect(result.comparison).toEqual(compareDiscards(advice, position.action.tileId));
    expect(result.advice.analysis.informationMode).toBe("player-perspective");
    expect(result.comparison).not.toHaveProperty("mistake");
    expect(result.comparison).not.toHaveProperty("winProbability");
  });

  it("analyzes an actual red-five discard separately from a same-type plain copy", () => {
    const target = review.positions.find((position) => position.kind === "turn" &&
      !position.view.players[0]!.riichi && position.view.hand.some((tile) => tile.red &&
        position.view.hand.some((other) => other.type === tile.type && !other.red)));
    expect(target, "fixture must contain a legal red/plain discard comparison").toBeDefined();
    const red = target!.view.hand.find((tile) => tile.red && target!.view.hand.some((other) => other.type === tile.type && !other.red))!;
    const plain = target!.view.hand.find((tile) => tile.type === red.type && !tile.red)!;
    const prefix = [...saved.decisions.slice(0, target!.decisionIndex), { type: "discard" as const, tileId: red.id }];
    const actual = buildDecisionReview({ ...saved, decisions: prefix }).positions.at(-1)!;
    expect(actual.action).toEqual({ type: "discard", tileId: red.id });
    const analysis = analyzeReviewDecision(actual, plain.id);
    expect(analysis.available).toBe(true);
    if (!analysis.available) throw new Error("legal red discard must be analyzed");
    expect(analysis.comparison.chosenTileId).toBe(red.id);
    expect(analysis.comparison.alternativeTileId).toBe(plain.id);
    expect(analysis.comparison.shantenDifference).toBe(0);
    expect(analysis.comparison.unseenImprovingDifference).toBe(0);
    expect(analysis.comparison.doraDiscardedDifference).toBe(1);
  });

  it("keeps historical engine-v1 positions display-only", () => {
    const legacy = JSON.parse(readFileSync(new URL("./fixtures/legacy-v1.json", import.meta.url), "utf8")) as { saved: unknown };
    const old = buildDecisionReview(legacy.saved);
    expect(old.complete).toBe(true);
    expect(old.engineVersion).toBe(1);
    expect(old.positions.length).toBeGreaterThan(10);
    expect(analyzeReviewDecision(old.positions[0]!)).toEqual({ available: false, reason: "legacy-rules" });
  });

  it("rejects malformed, illegal and trailing records rather than inventing a line", () => {
    expect(() => buildDecisionReview({ ...saved, decisions: [{ type: "pass" }] })).toThrow(/desync/);
    const absent = Array.from({ length: 136 }, (_, id) => id)
      .find((id) => !originalViews[0]!.hand.some((tile) => tile.id === id))!;
    expect(() => buildDecisionReview({ ...saved, decisions: [{ type: "discard", tileId: absent }] })).toThrow();
    expect(() => buildDecisionReview({ ...saved, decisions: [...saved.decisions, { type: "pass" }] })).toThrow(/unused/);
    expect(() => buildDecisionReview({ ...saved, engineVersion: 99 })).toThrow(/engine version/);
    expect(() => buildDecisionReview({ ...saved, decisions: [{ type: "discard", tileId: -1 }] })).toThrow(/tile id/);
  });
});

describe("headless decision navigation", () => {
  it("steps without wrapping and selects repeated hands by unique hand serial", () => {
    const navigator = new ReviewNavigator(review);
    expect(navigator.current).toBe(review.positions[0]);
    expect(navigator.previous()).toBeNull();
    expect(navigator.next()).toBe(review.positions[1]);
    const later = review.positions.find((position) => position.handIndex > 0)!;
    expect(later).toBeDefined();
    expect(navigator.goToHand(later.handIndex)).toBe(later);
    expect(navigator.goTo(review.positions.length - 1)).toBe(review.positions.at(-1));
    expect(navigator.next()).toBeNull();
    expect(() => navigator.goTo(-1)).toThrow(RangeError);
    expect(() => navigator.goTo(0.5)).toThrow(RangeError);
    expect(() => navigator.goToHand(999)).toThrow(RangeError);
    const empty = new ReviewNavigator(buildDecisionReview({ ...saved, decisions: [] }));
    expect(empty.current).toBeNull();
    expect(empty.next()).toBeNull();
    expect(empty.previous()).toBeNull();
  });
});

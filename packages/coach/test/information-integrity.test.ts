import { describe, expect, it } from "vitest";
import { AI_POLICY_VERSION, createAiPolicy, doraInTiles, doraWeightsOf, valueProxy } from "@openmahjong/ai";
import { ANALYSIS_VERSION, adviseDiscard, compareDiscards } from "../src/index.js";
import { makeTurnCtx, makeView } from "./view-helpers.js";

describe("coaching facts at decision time", () => {
  it("keeps the exact drawn red-five instance when already in riichi", () => {
    // The original 13 tiles have a 5m/9s shanpon wait. The drawn red
    // five completes the hand, and cannot be exchanged for a plain 5m.
    const view = makeView({ hand: "123055m345p678s99s", riichi: [true], doraIndicators: [31] });
    const drawn = view.hand.find((t) => t.red)!;
    const advice = adviseDiscard(view, makeTurnCtx({ drawnTile: drawn, canTsumo: true }));
    expect(advice.options.map((o) => o.tileId)).toEqual([drawn.id]);
    expect(advice.headline).toContain("declare tsumo");
  });

  it("counts a candidate discard as visible and as its own furiten history", () => {
    const view = makeView({ hand: "11223344556677m", doraIndicators: [31] });
    const advice = adviseDiscard(view, makeTurnCtx());
    const oneM = advice.options.find((o) => o.tileType === 0)!;
    // Two 1m originally held: one retained, one discarded, two unseen.
    expect(oneM.waits.find((w) => w.type === 0)?.live).toBe(2);
    expect(oneM.improving.find((w) => w.type === 0)?.live).toBe(2);
    expect(oneM.furiten).toBe(true);
    expect(oneM.reasons).toContain("furiten-wait");
  });

  it("does not call shanpon a two-sided sequence wait", () => {
    const view = makeView({ hand: "123m456p789s11z55z7z", doraIndicators: [30] });
    const advice = adviseDiscard(view, makeTurnCtx());
    const red = advice.options.find((o) => o.tileType === 33)!;
    expect(red.waits.map((w) => w.type)).toEqual([27, 31]);
    expect(red.reasons).toContain("two-wait-types");
    expect(red.reasons).not.toContain("two-sided-wait");
  });

  it("scopes proven genbutsu to each opponent, including multiple riichi", () => {
    const view = makeView({
      hand: "23489m5689p235s55z", riichi: [false, true, true],
      discards: [undefined, "5p", "9p"],
    });
    const advice = adviseDiscard(view, makeTurnCtx());
    const fiveP = advice.options.find((o) => o.tileType === 13)!;
    expect(fiveP.genbutsuAgainst).toEqual([1]);
    expect(fiveP.genbutsu).toBe(false);
    expect(fiveP.danger).toBeGreaterThan(0);
    expect(fiveP.reasons).not.toContain("genbutsu");
  });

  it("does not recommend a riichi the shared policy declines", () => {
    const view = makeView({
      hand: "234m456p678s234s15z", wallRemaining: 10,
      discards: [undefined, "11z"], doraIndicators: [30],
    });
    const drawn = view.hand.find((t) => t.type === 31)!;
    const ctx = makeTurnCtx({ drawnTile: drawn, riichiDiscardIds: [drawn.id] });
    const advice = adviseDiscard(view, ctx);
    expect(advice.riichi?.liveTotal).toBe(1);
    expect(advice.riichi?.recommended).toBe(false);
    expect(advice.headline).not.toContain("declare riichi");
    const action = createAiPolicy().turn(view, ctx);
    expect(action.type === "discard" && action.riichi).toBeFalsy();
  });
});

describe("value assumptions", () => {
  it("counts repeated indicators separately and double seat/round yakuhai twice", () => {
    const view = makeView({ hand: "111z234m456p678s55z", doraIndicators: [8, 8] });
    const weights = doraWeightsOf(view);
    expect(weights.get(0)).toBe(2); // both 9m indicators award 1m
    expect(doraInTiles(view.hand, weights)).toBe(0);
    // No 1m, only double-East triplet: exactly two han of value.
    const counts = new Array<number>(34).fill(0);
    for (const tile of view.hand) counts[tile.type]!++;
    expect(valueProxy(view, counts, weights)).toBe(2);
  });

  it("does not mistake dora alone for a yaku and decline riichi", () => {
    // Terminal triplet prevents pinfu/tanyao; a dragon pair is not
    // yakuhai. Six dora from the 111m triplet do not permit dama ron.
    const view = makeView({ hand: "111m456p789s23s55z7z", doraIndicators: [8, 8] });
    const drawn = view.hand.find((t) => t.type === 33)!;
    const weights = doraWeightsOf(view);
    expect(doraInTiles(view.hand, weights)).toBe(6);
    const action = createAiPolicy().turn(view, makeTurnCtx({ drawnTile: drawn, riichiDiscardIds: [drawn.id] }));
    expect(action).toEqual({ type: "discard", tileId: drawn.id, riichi: true });
  });
});

describe("versioned analysis and review comparison", () => {
  it("compares actual plain duplicate and red-five discards without inventing an unavailable action", () => {
    const view = makeView({ hand: "123055m345p678s99s", doraIndicators: [31] });
    const advice = adviseDiscard(view, makeTurnCtx());
    const plain = view.hand.filter((tile) => tile.type === 4 && !tile.red);
    const red = view.hand.find((tile) => tile.type === 4 && tile.red)!;
    expect(plain).toHaveLength(2);
    expect(advice.options).toHaveLength(view.hand.length);
    expect(compareDiscards(advice, plain[1]!.id, plain[0]!.id)).toMatchObject({
      shantenDifference: 0, unseenImprovingDifference: 0,
      heuristicDangerDifference: 0, doraDiscardedDifference: 0,
    });
    expect(compareDiscards(advice, red.id, plain[0]!.id)).toMatchObject({
      shantenDifference: 0, unseenImprovingDifference: 0,
      heuristicDangerDifference: 0, doraDiscardedDifference: 1,
    });
    expect(advice.options.find((option) => option.tileId === red.id)).toMatchObject({ isRed: true, doraDiscarded: 1 });
    const action = createAiPolicy().turn(view, makeTurnCtx());
    expect(action.type).toBe("discard");
    if (action.type === "discard") expect(advice.recommendation.tileId).toBe(action.tileId);
  });

  it("reports exact efficiency differences independently of outcomes and qualifies the ranking", () => {
    const view = makeView({ hand: "2345m345p678s23s99s" });
    const advice = adviseDiscard(view, makeTurnCtx());
    const five = advice.options.find((o) => o.tileType === 4)!;
    const worse = advice.options.find((o) => o.shantenAfter > five.shantenAfter)!;
    const comparison = compareDiscards(advice, worse.tileId, five.tileId);
    expect(comparison.observation).toBe("higher-shanten");
    expect(comparison.shantenDifference).toBe(worse.shantenAfter - five.shantenAfter);
    expect(comparison.analysis).toMatchObject({
      informationMode: "player-perspective", analysisVersion: ANALYSIS_VERSION, policyVersion: AI_POLICY_VERSION,
      ruleset: { id: "openmahjong-riichi", version: 1 },
    });
    expect(comparison.analysis.heuristicAssessments).toContain("discard-ranking");
    expect(comparison.analysis.limitations.join(" ")).toContain("not an optimal-play oracle");
    expect(() => compareDiscards(advice, 10000)).toThrow("legal options");
    expect(compareDiscards(advice, five.tileId).observation).toBe("same-option");
  });
});

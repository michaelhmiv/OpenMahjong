import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, ENGINE_VERSION, Game, createWall, parseCounts, resolveRuleset, shanten, scoreHand, settle, ukeire } from "../src/index.js";
import { tsumogiriPolicy } from "./game-helpers.js";

const scoreInput = () => ({
  handCounts: parseCounts("345m678m234p234s55z"), melds: [], winningTileType: 31,
  winType: "ron" as const, seatWind: 28, roundWind: 27, riichi: true,
  dora: 0, honba: 0, riichiSticks: 0,
});

describe("physical hand validation", () => {
  it.each([-1, 0.5, Number.NaN, Infinity, 5])("rejects malformed count %s before recursive analysis", (invalid) => {
    const counts = parseCounts("345m678m234p234s5z");
    counts[0] = invalid;
    expect(() => shanten(counts)).toThrow(/integer from 0 to 4/);
    expect(() => scoreHand({ ...scoreInput(), handCounts: counts })).toThrow(/integer from 0 to 4/);
  });

  it("rejects short count vectors and invalid meld counts", () => {
    expect(() => shanten([1, 2, 3])).toThrow(/34 entries/);
    expect(() => shanten(parseCounts("345m678m234p234s5z"), 0.5)).toThrow(/melds/);
    expect(() => shanten(parseCounts("345m678m234p234s5z"), -1)).toThrow(/melds/);
  });

  it("rejects impossible visible copy accounting in ukeire", () => {
    const hand = parseCounts("345m678m234p234s5z");
    const visible = new Array<number>(34).fill(0);
    visible[2] = 4; // the hand already holds one 3m
    expect(() => ukeire(hand, visible)).toThrow(/exceed 4/);
    visible[2] = -1;
    expect(() => ukeire(hand, visible)).toThrow(/visible/);
  });

  it("rejects unknown tile, wind and win-type values at the scoring boundary", () => {
    expect(() => scoreHand({ ...scoreInput(), winningTileType: 34 })).toThrow(/winningTileType/);
    expect(() => scoreHand({ ...scoreInput(), winningTileType: Number.NaN })).toThrow(/winningTileType/);
    expect(() => scoreHand({ ...scoreInput(), seatWind: 31 })).toThrow(/wind tile types/);
    expect(() => scoreHand({ ...scoreInput(), roundWind: 27.5 })).toThrow(/wind tile types/);
    expect(() => scoreHand({ ...scoreInput(), winType: "other" as "ron" })).toThrow(/winType/);
  });
});

describe("explicit ruleset identity", () => {
  it("names existing house-rule choices separately from the engine revision", () => {
    expect(ENGINE_VERSION).toBe(2);
    expect(resolveRuleset()).toBe(DEFAULT_RULESET);
    expect(DEFAULT_RULESET).toMatchObject({ id: "openmahjong-riichi", version: 1, redFives: true, kiriageMangan: false });
    expect(Object.isFrozen(DEFAULT_RULESET)).toBe(true);
    expect(Object.isFrozen(DEFAULT_RULESET.uma)).toBe(true);
  });

  it("rejects an unsupported profile before starting a game", () => {
    expect(() => resolveRuleset({ id: "wrc", version: 2025 })).toThrow(/Unsupported ruleset/);
    expect(() => new Game({ seed: 1, policies: tsumogiriPolicy(), ruleset: { id: DEFAULT_RULESET.id, version: 2 } })).toThrow(/Unsupported ruleset/);
  });
});

describe("game construction and physical walls", () => {
  it("rejects invalid seats, match lengths and scores before play", () => {
    const options = { seed: 1, policies: tsumogiriPolicy() };
    expect(() => new Game({ ...options, initialDealer: 4 })).toThrow(/initialDealer/);
    expect(() => new Game({ ...options, length: "other" as "east" })).toThrow(/length/);
    expect(() => new Game({ ...options, initialScores: [25000, 25000, NaN, 25000] })).toThrow(/finite integer/);
    expect(() => settle([25000, 25000, 25000])).toThrow(/4 finite integer/);
    expect(() => settle([25000, 25000, Infinity, 25000])).toThrow(/4 finite integer/);
  });

  it("rejects duplicate, missing and inconsistent physical wall tiles", () => {
    const wall = createWall("validation");
    const live = [...wall.liveWall];
    live[1] = live[0]!;
    expect(() => new Game({ seed: 1, policies: tsumogiriPolicy(), walls: [{ ...wall, liveWall: live }] })).toThrow(/exactly once/);
    expect(() => new Game({ seed: 1, policies: tsumogiriPolicy(), walls: [{ ...wall, liveWall: wall.liveWall.slice(1) }] })).toThrow(/122 live/);
    const wrong = wall.liveWall.map((tile, i) => i === 0 ? { ...tile, type: (tile.type + 1) % 34 } : tile);
    expect(() => new Game({ seed: 1, policies: tsumogiriPolicy(), walls: [{ ...wall, liveWall: wrong }] })).toThrow(/inconsistent/);
  });

  it("keeps legality checks private when a JavaScript policy mutates its context", () => {
    const game = new Game({ seed: "context-mutation", policies: {
      turn(_view, ctx) {
        const absent = Array.from({ length: 34 }, (_, t) => t).find((t) => !ctx.ankanOptions.includes(t))!;
        (ctx.ankanOptions as number[]).push(absent);
        return { type: "ankan", tileType: absent };
      },
      call() { return { type: "pass" }; },
    } });
    expect(() => game.run()).toThrow(/ankan.*not legal/);
  });
});

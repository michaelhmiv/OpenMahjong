/**
 * scoreHand API and validation tests: the corpus covers scoring correctness;
 * this file covers the contract — input validation, error cases, and the
 * shape of ScoreResult (dora reporting, honba, riichi sticks).
 */
import { describe, expect, it } from "vitest";
import { parseCounts, type TileType } from "../src/tiles.js";
import { scoreHand, type Meld, type ScoreInput } from "../src/scoring.js";

const E = 27;

function expand(notation: string): TileType[] {
  const counts = parseCounts(notation);
  const tiles: TileType[] = [];
  counts.forEach((n, t) => {
    for (let i = 0; i < n; i++) tiles.push(t);
  });
  return tiles;
}

function input(partial: Partial<ScoreInput> & Pick<ScoreInput, "handCounts" | "winningTileType" | "winType">): ScoreInput {
  return {
    melds: [],
    seatWind: 28,
    roundWind: 27,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    haitei: false,
    houtei: false,
    rinshan: false,
    chankan: false,
    firstDrawTsumo: false,
    dora: 0,
    honba: 0,
    riichiSticks: 0,
    ...partial,
  };
}

/** Riichi-only closed hand used across several tests: 345m 678m 234p 234s 55z, win 5z. */
function riichiHand(partial: Partial<ScoreInput> = {}): ScoreInput {
  return input({
    handCounts: parseCounts("345m678m234p234s55z"),
    winningTileType: expand("5z")[0]!,
    winType: "ron",
    riichi: true,
    ...partial,
  });
}

describe("scoreHand validation", () => {
  it("rejects a hand with no yaku", () => {
    // Open tanyao shape but with a terminal pair — no yaku at all.
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678p234s345s99s"),
          melds: [
            { kind: "chi", tiles: expand("345m") },
            { kind: "chi", tiles: expand("678p") },
          ] as Meld[],
          winningTileType: expand("5s")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/no yaku/i);
  });

  it("rejects an incomplete hand (shanten is not -1)", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s56z"),
          winningTileType: expand("5z")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/not a complete winning hand/i);
  });

  it("rejects riichi with an open hand", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s55z"),
          melds: [{ kind: "chi", tiles: expand("345m") }] as Meld[],
          winningTileType: expand("5z")[0]!,
          winType: "ron",
          riichi: true,
        }),
      ),
    ).toThrow(/riichi requires a closed hand/i);
  });

  it("rejects chankan on a tsumo win and rinshan on a ron win", () => {
    expect(() => scoreHand(riichiHand({ winType: "tsumo", chankan: true }))).toThrow(/ron-only/i);
    expect(() => scoreHand(riichiHand({ rinshan: true }))).toThrow(/tsumo-only/i);
  });

  it("rejects ippatsu without riichi and double riichi without riichi", () => {
    expect(() => scoreHand(riichiHand({ riichi: false, ippatsu: true }))).toThrow(/ippatsu requires riichi/i);
    expect(() => scoreHand(riichiHand({ riichi: false, doubleRiichi: true }))).toThrow(/double riichi requires riichi/i);
  });

  it("rejects meld tiles that are not in the hand", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s55z"),
          melds: [{ kind: "pon", tiles: expand("777z") }] as Meld[],
          winningTileType: expand("5z")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/not present in handCounts/i);
  });

  it("rejects a wrong total tile count", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s5z"),
          winningTileType: expand("5z")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/14 \+ kans tiles/i);
  });

  it("rejects a winning tile outside the closed portion", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s55z"),
          melds: [{ kind: "chi", tiles: expand("345m") }] as Meld[],
          winningTileType: expand("3m")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/not part of the closed portion/i);
  });

  it("rejects malformed melds", () => {
    expect(() =>
      scoreHand(
        input({
          handCounts: parseCounts("345m678m234p234s55z"),
          melds: [{ kind: "pon", tiles: expand("55z") }] as Meld[],
          winningTileType: expand("5z")[0]!,
          winType: "ron",
        }),
      ),
    ).toThrow(/must have 3 tiles/i);
  });
});

describe("scoreHand result shape", () => {
  it("reports dora separately from yaku han and never as a yaku", () => {
    const r = scoreHand(riichiHand({ dora: 3 }));
    expect(r.dora).toBe(3);
    expect(r.han).toBe(4); // riichi 1 + 3 dora
    expect(r.yaku.map((y) => y.id)).toEqual(["riichi"]);
    expect(r.yaku.reduce((a, y) => a + y.han, 0)).toBe(1);
  });

  it("reports yakuman hands with fu 0 and dora 0 even when dora is passed", () => {
    const r = scoreHand(
      input({
        handCounts: parseCounts("119m19p19s1234567z"),
        winningTileType: expand("9m")[0]!,
        winType: "ron",
        dora: 5,
      }),
    );
    expect(r.yakumanMultiple).toBe(1);
    expect(r.fu).toBe(0);
    expect(r.dora).toBe(0);
    expect(r.ronPoints).toBe(32000);
  });

  it("exposes exactly one payment channel per win type", () => {
    const ron = scoreHand(riichiHand());
    expect(ron.ronPoints).toBe(1300);
    expect(ron.tsumoPoints).toBeNull();
    const tsumo = scoreHand(riichiHand({ winType: "tsumo" }));
    expect(tsumo.ronPoints).toBeNull();
    // Riichi + menzen tsumo, 30 fu (20 + 2 tsumo + 2 haku pair + 2 tanki, rounded).
    expect(tsumo.tsumoPoints).toEqual({ nonDealer: 500, dealer: 1000 });
  });

  it("counts riichi sticks separately from the hand payment", () => {
    const r = scoreHand(riichiHand({ riichiSticks: 2 }));
    expect(r.stickPoints).toBe(2000);
    expect(r.ronPoints).toBe(1300);
  });

  it("is deterministic: identical inputs give identical results", () => {
    const a = scoreHand(riichiHand({ dora: 2, honba: 1 }));
    const b = scoreHand(riichiHand({ dora: 2, honba: 1 }));
    expect(a).toEqual(b);
  });

  it("scores a dealer win with dealer payment amounts", () => {
    const r = scoreHand(riichiHand({ seatWind: E }));
    expect(r.ronPoints).toBe(2000); // dealer 1 han 40 fu
  });
});

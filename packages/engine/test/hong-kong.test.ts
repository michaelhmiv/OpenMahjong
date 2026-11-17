import { describe, expect, it } from "vitest";
import { parseCounts, type Tile } from "../src/tiles.js";
import {
  HONG_KONG,
  HK_HALF_SPICY,
  hongKongPayments,
  scoreHongKong,
} from "../src/variants/hong-kong.js";
import { VariantGame, assertVariantAction } from "../src/variants/game.js";
import { standardDistance, standardShapes } from "../src/variants/shapes.js";
import type { VariantScoreInput } from "../src/variants/types.js";
import type { Policy } from "../src/game.js";
const input = (
  notation: string,
  extra: Partial<VariantScoreInput> = {},
): VariantScoreInput => ({
  counts: parseCounts(notation),
  melds: [],
  winningTile: 0,
  selfDraw: false,
  seatWind: 27,
  roundWind: 27,
  flowers: [],
  replacement: false,
  robbingQuad: false,
  lastWall: false,
  initial: false,
  lastCopy: false,
  ...extra,
});
const legal: Policy = {
  turn(v, c) {
    return c.canTsumo
      ? { type: "tsumo" }
      : { type: "discard", tileId: c.drawnTile?.id ?? v.hand[0]!.id };
  },
  call(_v, c) {
    return c.canRon ? { type: "ron" } : { type: "pass" };
  },
};
describe("Hong Kong Clear Chapter independently derived rules", () => {
  it("applies the sourced conversion and clear-chapter payer splits", () => {
    expect(HK_HALF_SPICY).toEqual([1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128]);
    expect(
      hongKongPayments(3, { winner: 0, payer: 2, selfDraw: false }),
    ).toEqual([
      { seat: 1, amount: 8 },
      { seat: 2, amount: 16 },
      { seat: 3, amount: 8 },
    ]);
    expect(
      hongKongPayments(5, { winner: 2, payer: 0, selfDraw: true }),
    ).toEqual([
      { seat: 0, amount: 48 },
      { seat: 1, amount: 48 },
      { seat: 3, amount: 48 },
    ]);
    expect(
      hongKongPayments(18, { winner: 0, payer: 1, selfDraw: false }).map(
        (p) => p.amount,
      ),
    ).toEqual([256, 128, 128]);
    expect(() =>
      hongKongPayments(2, { winner: 0, payer: 1, selfDraw: false }),
    ).toThrow(/minimum/);
  });
  it("rejects a two-fan shape and recognizes the self-draw that supplies the third fan", () => {
    const ron = scoreHongKong(input("123456m123p789s11z", { winningTile: 27 }));
    expect(ron.units).toBe(2);
    expect(ron.eligible).toBe(false);
    const tsumo = scoreHongKong(
      input("123456m123p789s11z", { winningTile: 27, selfDraw: true }),
    );
    expect(tsumo.units).toBe(3);
    expect(tsumo.eligible).toBe(true);
  });
  it("derives all triplets, double winds, flushes and dragon exclusions", () => {
    const winds = scoreHongKong(input("111m222p333s111z55z"));
    expect(winds.units).toBe(6); // All triplets 3 + East seat 1 + East round 1 + no flowers 1.
    const dragons = scoreHongKong(input("111m555666777z22p"));
    expect(
      dragons.patterns.find((p) => p.id === "big-three-dragons")!.units,
    ).toBe(8);
    expect(dragons.patterns.some((p) => p.id.startsWith("dragon-"))).toBe(
      false,
    );
    expect(
      scoreHongKong(input("11122233344455m")).patterns.some(
        (p) => p.id === "full-flush",
      ),
    ).toBe(true);
    expect(
      scoreHongKong(input("11123456789995m", { winningTile: 4 })).patterns.some(
        (p) => p.id === "nine-gates",
      ),
    ).toBe(true);
  });
  it("keeps seat flowers and complete quartets explicit, with all eight replacing other flower awards", () => {
    const score = scoreHongKong(
      input("123456m123p789s11z", {
        winningTile: 27,
        flowers: [34, 35, 36, 37],
      }),
    );
    expect(
      score.patterns
        .filter(
          (p) => p.id.startsWith("flower-") || p.id.startsWith("quartet-"),
        )
        .reduce((n, p) => n + p.units, 0),
    ).toBe(3);
    const all = scoreHongKong(
      input("123456m123p789s11z", {
        winningTile: 27,
        flowers: [34, 35, 36, 37, 38, 39, 40, 41],
      }),
    );
    expect(all.units).toBe(9);
    expect(all.patterns.some((p) => p.id.startsWith("flower-"))).toBe(false);
    expect(() =>
      scoreHongKong(input("123456m123p789s11z", { flowers: [34, 34] })),
    ).toThrow(/flower/);
  });
  it("supports orphans, rejects optional seven pairs, and validates quad tile counts", () => {
    expect(scoreHongKong(input("119m19p19s1234567z")).units).toBe(13);
    expect(scoreHongKong(input("1122m3344p5566s77z")).eligible).toBe(false);
    const quad = input("1111m222p333s111z55z", {
      winningTile: 31,
      melds: [{ kind: "ankan", tiles: [0, 0, 0, 0] }],
    });
    expect(scoreHongKong(quad).eligible).toBe(true);
    expect(() =>
      scoreHongKong({ ...quad, counts: parseCounts("111m222p333s111z55z") }),
    ).toThrow(/Declared tiles missing/);
  });
  it("uses a genuine five-set analyzer without treating a fourteen-tile shape as Taiwanese", () => {
    const five = parseCounts("123456m123p789s111z55z");
    expect(standardShapes(five, [], 5)).toHaveLength(1);
    expect(standardDistance(five, 0, 5)).toBe(-1);
    expect(() =>
      standardShapes(parseCounts("123456m123p789s11z"), [], 5),
    ).toThrow(/17/);
  });
});
describe("variant coordinator", () => {
  it("runs deterministic legal East sessions with all public boundaries and point conservation", () => {
    const play = () => {
      const game = new VariantGame({
        variant: "hong-kong",
        seed: "hk-legality",
        length: "east",
        policies: [legal, legal, legal, legal],
      });
      return game.run();
    };
    const a = play(),
      b = play();
    expect(a.events).toEqual(b.events);
    expect(a.scores.reduce((n, s) => n + s, 0)).toBe(4000);
    expect(
      a.events.filter((e) => e.type === "hand-start").length,
    ).toBeGreaterThanOrEqual(4);
    expect(a.events.filter((e) => e.type === "flower").length).toBeGreaterThan(
      0,
    );
    expect(
      a.events.some((e) => e.type === "indicator" || e.type === "riichi"),
    ).toBe(false);
  });
  it("offers the correct hand from a full physical wall, denies illegal actions and pays a ten-fan initial Heavenly Hand", () => {
    const inventory = HONG_KONG.inventory(),
      used = new Set<number>();
    const own: Tile[] = [];
    parseCounts("111m222p333s555z66z").forEach((n, type) => {
      for (let i = 0; i < n; i++) {
        const tile = inventory.find((t) => t.type === type && !used.has(t.id))!;
        used.add(tile.id);
        own.push(tile);
      }
    });
    const winning = own.pop()!,
      wall: (Tile | undefined)[] = new Array(144);
    const slots = [0, 1, 2, 3, 16, 17, 18, 19, 32, 33, 34, 35, 48];
    slots.forEach((slot, i) => (wall[slot] = own[i]));
    wall[52] = winning;
    const rest = inventory.filter((t) => !used.has(t.id));
    for (let i = 0; i < wall.length; i++) if (!wall[i]) wall[i] = rest.shift()!;
    const game = new VariantGame({
      variant: "hong-kong",
      seed: "known-six-fan",
      length: "east",
      wallFactory: () => wall as Tile[],
    });
    const iterator = game.play(),
      first = iterator.next();
    expect(first.done).toBe(false);
    if (first.done) throw new Error("missing decision");
    expect(first.value.kind).toBe("turn");
    if (first.value.kind !== "turn") throw new Error("Expected turn");
    expect(first.value.context.canTsumo).toBe(true);
    expect(first.value.view.hand).toHaveLength(14);
    for (const p of first.value.view.players)
      expect(p).not.toHaveProperty("tiles");
    expect(() =>
      assertVariantAction(first.value, { type: "discard", tileId: 999 }),
    ).toThrow(/Illegal/);
    iterator.next({ type: "tsumo" });
    const win = game.events.find((e) => e.type === "win")!;
    expect(win["han"]).toBe(10);
    expect(win["payments"]).toEqual([
      { seat: 1, amount: 256 },
      { seat: 2, amount: 256 },
      { seat: 3, amount: 256 },
    ]);
    expect(game.events.find((e) => e.type === "hand-end")!["renchan"]).toBe(
      true,
    );
  });
});

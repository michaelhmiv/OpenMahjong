import { describe, it, expect } from "vitest";
import {
  parseCounts,
  scoreMcr,
  mcrPayments,
  mcrPatterns,
  mcrDistance,
  VariantGame,
  type VariantScoreInput,
} from "../src/index.js";
function score(hand: string, options: Partial<VariantScoreInput> = {}) {
  return scoreMcr({
    counts: parseCounts(hand),
    melds: [],
    winningTile: 27,
    selfDraw: false,
    seatWind: 28,
    roundWind: 29,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...options,
  });
}
describe("MCR WMO 2006", () => {
  it("pins all 81 values, including the edition-specific eight-point Two Concealed Kongs", () => {
    const p = mcrPatterns();
    expect(p.map((p) => p.units)).toEqual([
      ...Array(7).fill(88),
      ...Array(6).fill(64),
      ...Array(2).fill(48),
      ...Array(3).fill(32),
      ...Array(9).fill(24),
      ...Array(6).fill(16),
      ...Array(5).fill(12),
      ...Array(9).fill(8),
      6,
      6,
      6,
      6,
      6,
      8,
      6,
      ...Array(4).fill(4),
      ...Array(10).fill(2),
      ...Array(13).fill(1),
    ]);
    expect(p).toHaveLength(81);
    expect(new Set(p.map((p) => p.id)).size).toBe(81);
    expect(p.filter((p) => p.units === 88)).toHaveLength(7);
    expect(p.find((p) => p.name === "Two Concealed Kongs")?.units).toBe(8);
    expect(p.some((p) => p.name === "Concealed Kong and Melded Kong")).toBe(
      false,
    );
  });
  it("scores special structures, exclusions and four-of-a-kind as two pairs", () => {
    const a = score("111222333m444p11z");
    expect(a.units).toBeGreaterThanOrEqual(24);
    expect(a.patterns.map((p) => p.name)).toContain("Pure Shifted Pungs");
    const b = score("11223344556677m", { winningTile: 6 });
    expect(b.patterns.map((p) => p.name)).toContain("Seven Shifted Pairs");
    expect(
      b.patterns.some(
        (p) =>
          p.name === "Seven Pairs" ||
          p.name === "Concealed Hand" ||
          p.name === "Full Flush",
      ),
    ).toBe(false);
    const c = score("111122m3344p5566s", { winningTile: 23 });
    expect(c.patterns.map((p) => p.name)).toContain("Seven Pairs");
  });
  it("awards the 2006 six-point mixed-kong combination without inventing an 82nd catalog pattern", () => {
    // Rulebook fan 57 explicitly gives one concealed + one melded kong 6.
    // Add Short Straight (1), terminal pung (1) and No Honors (1) = 9.
    // Individual quad awards must not be counted again. With only their
    // individual 1+2 values this hand would incorrectly fail the minimum.
    const result = score("1111m222277p345678s", {
      winningTile: 23,
      melds: [
        { kind: "daiminkan", tiles: [0, 0, 0, 0] },
        { kind: "ankan", tiles: [10, 10, 10, 10] },
      ],
    });
    expect(result.units).toBe(9);
    expect(result.qualifyingUnits).toBe(9);
    expect(result.eligible).toBe(true);
    expect(result.patterns).toContainEqual({
      id: "mcr-mixed-kong-combination",
      name: "One concealed and one melded kong",
      units: 6,
    });
    expect(
      result.patterns.some((p) =>
        ["Melded Kong", "Concealed Kong", "Two Melded Kongs"].includes(p.name),
      ),
    ).toBe(false);
    expect(mcrPatterns()).toHaveLength(81);
    expect(mcrPayments(9, { winner: 1, payer: 0, selfDraw: false }, 0)).toEqual(
      [
        { seat: 0, amount: 17 },
        { seat: 2, amount: 8 },
        { seat: 3, amount: 8 },
      ],
    );
  });
  it("excludes flowers from eligibility and pays eight base points from every loser", () => {
    const a = score("123456m234p567s11z", {
      flowers: [34, 35, 36, 37, 38, 39, 40, 41],
    });
    expect(a.qualifyingUnits).toBeLessThan(8);
    expect(a.units).toBe(a.qualifyingUnits + 8);
    expect(a.eligible).toBe(false);
    expect(mcrPayments(8, { winner: 0, payer: 2, selfDraw: false }, 2)).toEqual(
      [
        { seat: 1, amount: 8 },
        { seat: 2, amount: 18 },
        { seat: 3, amount: 8 },
      ],
    );
    expect(
      mcrPayments(8, { winner: 0, payer: 0, selfDraw: true }, 2).map(
        (p) => p.amount,
      ),
    ).toEqual([18, 18, 18]);
  });
  it("analyzes honors-and-knitted, knitted-straight, seven pairs and standard shapes", () => {
    expect(mcrDistance(parseCounts("1122334455667m"))).toBe(0);
    expect(mcrDistance(parseCounts("11223344556677m"))).toBe(-1);
    expect(mcrDistance(parseCounts("147m258p369s1234z"))).toBe(0);
    expect(mcrDistance(parseCounts("147m258p369s12345z"))).toBe(-1);
  });
  it("refuses malformed inventories and illegal turns before engine mutation", () => {
    expect(() => score("123m123p123s111z22z", { winningTile: 2.2 })).toThrow();
    expect(() => score("123m123p123s111z22z", { replacement: true })).toThrow();
    const game = new VariantGame({
        variant: "mcr",
        seed: "mcr-legal",
        length: "east",
      }),
      it = game.play();
    const first = it.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({
      view: {
        variant: "mcr",
        profile: { id: "openmahjong-mcr-2006", version: 1 },
      },
    });
    expect(() => it.next({ type: "discard", tileId: 999 })).toThrow(/Illegal/);
  });
});

describe("MCR lifecycle and public evidence", () => {
  it("rotates the dealer for sixteen hands, conserves points and reproduces every event", () => {
    const policy = {
      turn: (v: any, c: any) =>
        c.canTsumo
          ? { type: "tsumo" as const }
          : {
              type: "discard" as const,
              tileId: c.drawnTile?.id ?? v.hand[0].id,
            },
      call: (_v: any, c: any) =>
        c.canRon ? { type: "ron" as const } : { type: "pass" as const },
    };
    const run = () =>
      new VariantGame({
        variant: "mcr",
        seed: "mcr-16-rotation",
        length: "full",
        policies: [policy, policy, policy, policy],
      }).run();
    const a = run(),
      b = run();
    expect(a.events).toEqual(b.events);
    expect(a.handsPlayed).toBe(16);
    expect(
      a.events
        .filter((e) => e.type === "hand-start")
        .map((e) => [e["roundWind"], e["dealer"], e["honba"]]),
    ).toEqual(
      Array.from({ length: 16 }, (_, i) => [27 + Math.floor(i / 4), i % 4, 0]),
    );
    expect(a.scores.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("masks opponents concealed-quad faces and physical IDs while retaining the owner view", () => {
    const game = new VariantGame({ variant: "mcr", seed: "masked-quad" });
    game.play().next();
    game.players[1]!.melds = [
      {
        kind: "ankan",
        tiles: [0, 1, 2, 3].map((id) => ({ id, type: 0, red: false })),
      },
    ];
    const publicQuad = game.adapter.publicView(game, 0).players[1]!.melds[0]!;
    expect(publicQuad.tiles).toEqual(
      Array.from({ length: 4 }, () => ({ id: -1, type: -1, red: false })),
    );
    expect(
      game.adapter.publicView(game, 1).melds[0]!.tiles.map((t) => t.type),
    ).toEqual([0, 0, 0, 0]);
  });
  it("does not add implied awards or fake unique waits, and rejects conflicting contexts", () => {
    const full = score("123345678m22255m", { winningTile: 4 });
    expect(full.patterns.some((p) => p.name === "Full Flush")).toBe(true);
    expect(
      full.patterns.some(
        (p) => p.name === "No Honors" || p.name === "One Voided Suit",
      ),
    ).toBe(false);
    const dragon = score("555666777z123m11p", { winningTile: 9 });
    expect(dragon.patterns.some((p) => p.name === "Big Three Dragons")).toBe(
      true,
    );
    expect(
      dragon.patterns.some(
        (p) => p.name === "Dragon Pung" || p.name === "Two Dragons Pungs",
      ),
    ).toBe(false);
    const wait = score("123m456p789s222m55z", { winningTile: 26 });
    expect(wait.patterns.some((p) => p.name.startsWith("Unique Wait"))).toBe(
      false,
    );
    expect(() =>
      score("123m456p789s222m55z", { selfDraw: true, robbingQuad: true }),
    ).toThrow(/circumstance/);
  });
});

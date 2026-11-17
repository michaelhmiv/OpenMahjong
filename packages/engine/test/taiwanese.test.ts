import { describe, it, expect } from "vitest";
import {
  parseCounts,
  scoreTaiwanese,
  taiwanesePayments,
  createTaiwaneseAdapter,
  TaiwaneseRestrictions,
  VariantGame,
  assertVariantAction,
  type VariantScoreInput,
  type Tile,
  type VariantPublicState,
} from "../src/index.js";
const input = (
  notation: string,
  extra: Partial<VariantScoreInput> = {},
): VariantScoreInput => ({
  counts: parseCounts(notation),
  melds: [],
  winningTile: 27,
  selfDraw: false,
  seatWind: 28,
  roundWind: 27,
  flowers: [],
  replacement: false,
  robbingQuad: false,
  lastWall: false,
  initial: false,
  lastCopy: false,
  ...extra,
});
function tiles(notation: string): Tile[] {
  return parseCounts(notation).flatMap((n, type) =>
    Array.from({ length: n }, (_, copy) => ({
      id: 4 * type + copy,
      type,
      red: false,
    })),
  );
}
function state(): VariantPublicState {
  return {
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      tiles: tiles("123456m123p789s111z5z"),
      melds: [],
      flowers: [],
      discards: [],
      score: 1000,
      draws: 1,
    })),
    dealer: 0,
    roundWind: 27,
    kyoku: 1,
    dealerRepeats: 0,
    wallRemaining: 40,
    currentTurn: 0,
  };
}
describe("Taiwanese Every-flower profile", () => {
  it("requires seventeen structural tiles and five sets, counts extra quad tiles and rejects 14-tile special shapes", () => {
    expect(
      scoreTaiwanese(input("123456m123p789s111z55z", { winningTile: 31 }))
        .eligible,
    ).toBe(true);
    expect(() => scoreTaiwanese(input("123456m123p789s11z"))).toThrow(/17/);
    expect(() =>
      scoreTaiwanese(input("11223344556677m", { winningTile: 6 })),
    ).toThrow(/17/);
    const quad = input("1111m456m123p789s111z55z", {
      winningTile: 31,
      melds: [{ kind: "ankan", tiles: [0, 0, 0, 0] }],
    });
    expect(scoreTaiwanese(quad).patterns).toContainEqual({
      id: "tw-quad-0",
      name: "Concealed quad",
      units: 2,
    });
  });
  it("applies concealed self-draw replacement, the concealed-pung ladder and honor exclusions", () => {
    const closed = scoreTaiwanese(
      input("123456m123p789s111z55z", { winningTile: 31, selfDraw: true }),
    );
    expect(
      closed.patterns.some(
        (p) => p.id === "tw-concealed-self" && p.units === 3,
      ),
    ).toBe(true);
    expect(
      closed.patterns.some(
        (p) => p.id === "tw-self-draw" || p.id === "tw-concealed",
      ),
    ).toBe(false);
    const five = scoreTaiwanese(
      input("111m222p333s111222z55z", { winningTile: 31, selfDraw: true }),
    );
    expect(five.patterns).toContainEqual({
      id: "tw-concealed-pungs",
      name: "5 concealed triplets",
      units: 8,
    });
    expect(five.patterns.find((p) => p.id === "tw-all-pungs")?.units).toBe(4);
    const four = scoreTaiwanese(
      input("111m222p333s111222z55z", { winningTile: 28 }),
    );
    expect(
      four.patterns.find((p) => p.id === "tw-concealed-pungs")?.units,
    ).toBe(5);
    const dragons = scoreTaiwanese(
      input("555666777z123m789p11s", { winningTile: 18 }),
    );
    expect(
      dragons.patterns.find((p) => p.id === "tw-big-three-dragons")?.units,
    ).toBe(8);
    expect(dragons.patterns.some((p) => p.id.startsWith("tw-dragon-"))).toBe(
      false,
    );
  });
  it("counts every flower and quartet, and requires a completed hand for the sourced eight-flower bonus", () => {
    const a = scoreTaiwanese(
      input("123456m123p789s111z55z", {
        winningTile: 31,
        flowers: [34, 35, 36, 37],
      }),
    );
    expect(
      a.patterns
        .filter((p) => p.id.startsWith("tw-flower"))
        .reduce((n, p) => n + p.units, 0),
    ).toBe(6);
    const b = scoreTaiwanese(
      input("123456m123p789s111z55z", {
        winningTile: 31,
        flowers: [34, 35, 36, 37, 38, 39, 40, 41],
      }),
    );
    expect(b.patterns.find((p) => p.id === "tw-eight-flowers")?.units).toBe(8);
    expect(b.patterns.some((p) => p.id.startsWith("tw-flower-"))).toBe(false);
    const noShape = scoreTaiwanese(
      input("1234567m1234p1234s12z", {
        winningTile: 27,
        flowers: [34, 35, 36, 37, 38, 39, 40, 41],
      }),
    );
    expect(noShape.eligible).toBe(false);
  });
  it("uses no minimum, verified two-sided all-sequence requirements and no-honors/flowers as a separate profile award", () => {
    const zero = scoreTaiwanese(
      input("123456m234p567789s11z", {
        winningTile: 26,
        melds: [{ kind: "chi", tiles: [0, 1, 2] }],
      }),
    );
    expect(zero.eligible).toBe(true);
    expect(zero.units).toBe(0);
    const chows = scoreTaiwanese(
      input("123456m234p567789s22p", { winningTile: 26 }),
    );
    expect(chows.patterns.some((p) => p.id === "tw-all-chows")).toBe(true);
    expect(chows.patterns.some((p) => p.id === "tw-no-honors-flowers")).toBe(
      true,
    );
    expect(
      scoreTaiwanese(
        input("123456m234p567789s22p", { winningTile: 26, selfDraw: true }),
      ).patterns.some((p) => p.id === "tw-all-chows"),
    ).toBe(false);
  });
  it("charges base plus linear tai with dealer bonuses only on payments involving the dealer", () => {
    expect(
      taiwanesePayments(3, {
        winner: 1,
        payer: 2,
        selfDraw: false,
        dealer: 0,
        dealerRepeats: 2,
      }),
    ).toEqual([{ seat: 2, amount: 60 }]);
    expect(
      taiwanesePayments(3, {
        winner: 1,
        payer: 0,
        selfDraw: false,
        dealer: 0,
        dealerRepeats: 2,
      }),
    ).toEqual([{ seat: 0, amount: 110 }]);
    expect(
      taiwanesePayments(3, {
        winner: 1,
        payer: 1,
        selfDraw: true,
        dealer: 0,
        dealerRepeats: 2,
      }),
    ).toEqual([
      { seat: 0, amount: 110 },
      { seat: 2, amount: 60 },
      { seat: 3, amount: 60 },
    ]);
    expect(
      taiwanesePayments(0, {
        winner: 0,
        payer: 1,
        selfDraw: false,
        dealer: 0,
        dealerRepeats: 0,
      }),
    ).toEqual([{ seat: 1, amount: 40 }]);
  });
  it("repeats after dealer wins and draws, passes after nondealer wins or the named ten-repeat cap", () => {
    const a = createTaiwaneseAdapter();
    expect(a.progression(null, 0, 2)).toEqual({ repeat: true, repeats: 3 });
    expect(a.progression(0, 0, 2)).toEqual({ repeat: true, repeats: 3 });
    expect(a.progression(1, 0, 2)).toEqual({ repeat: false, repeats: 0 });
    expect(a.progression(0, 0, 10)).toEqual({ repeat: false, repeats: 0 });
  });
  it("restores passed-win eligibility by a non-winning discard or concealed/added quad, never merely by drawing", () => {
    const s = state(),
      a = createTaiwaneseAdapter(),
      r = new TaiwaneseRestrictions(),
      tile = { id: 125, type: 31, red: false },
      context = { ...a.callContext(s, 0, 1, tile, "ron", true) };
    r.callTaken(s, 0, context, { type: "pass" });
    expect(r.canWin(0, false)).toBe(false);
    expect(r.canWin(0, true)).toBe(false);
    r.beforeDraw(s, 0, false);
    expect(r.canWin(0, true)).toBe(false);
    r.discarded(s, 0, { id: 124, type: 31, red: false });
    expect(r.canWin(0, true)).toBe(false);
    r.discarded(s, 0, { id: 0, type: 0, red: false });
    expect(r.canWin(0, true)).toBe(true);
    r.callTaken(s, 0, context, { type: "pass" });
    r.turnTaken(
      s,
      0,
      {
        canTsumo: false,
        drawnTile: null,
        rinshan: false,
        ankanOptions: [0],
        shouminkanOptions: [],
        riichiDiscardIds: [],
        canKyuushu: false,
      },
      { type: "ankan", tileType: 0 },
    );
    expect(r.canWin(0, true)).toBe(true);
  });
  it("masks concealed quads, forbids swap discards, passed pungs, late claims and exposed-quad replacement wins", () => {
    const s = state(),
      r = new TaiwaneseRestrictions(),
      a = createTaiwaneseAdapter(),
      tile = { id: 2, type: 0, red: false };
    s.players[0]!.melds = [
      {
        kind: "chi",
        tiles: [
          tile,
          { id: 4, type: 1, red: false },
          { id: 8, type: 2, red: false },
        ],
      },
    ];
    r.claimed(s, 0, 3, tile, { type: "chi", tileIds: [4, 8] });
    expect(
      r.legalIds(s, 0).some((id) => [0, 3].includes(Math.floor(id / 4))),
    ).toBe(false);
    s.players[0]!.melds = [];
    const pair = {
      ...a.callContext(
        s,
        0,
        1,
        { id: 110, type: 27, red: false },
        "pon-kan",
        false,
      ),
      canPon: true,
    };
    r.callTaken(s, 0, pair, { type: "pass" });
    expect(r.calls(s, 0, 2, pair.tile, "pon-kan", false).canPon).toBe(false);
    r.beforeDraw(s, 0, false);
    expect(r.calls(s, 0, 2, pair.tile, "pon-kan", false).canPon).toBe(true);
    expect(
      r.calls({ ...s, wallRemaining: 3 }, 0, 2, pair.tile, "pon-kan", false)
        .canPon,
    ).toBe(false);
    r.claimed(s, 0, 1, pair.tile, { type: "daiminkan" });
    expect(r.canWin(0, true)).toBe(false);
    expect(r.canWin(0, false)).toBe(true);
    s.players[1]!.melds = [
      {
        kind: "ankan",
        tiles: [0, 1, 2, 3].map((id) => ({ id, type: 0, red: false })),
      },
    ];
    expect(
      a
        .publicView(s, 0)
        .players[1]!.melds[0]!.tiles.every((t) => t.id === -1 && t.type === -1),
    ).toBe(true);
  });
  it("deals all sixteen standing tiles, exposes flowers and rejects forged forbidden discards before state mutation", () => {
    const game = new VariantGame({
        variant: "taiwanese",
        seed: "taiwanese-deal",
        length: "east",
      }),
      it = game.play(),
      first = it.next();
    if (first.done || first.value.kind !== "turn")
      throw new Error("Missing first turn");
    expect(first.value.view.hand).toHaveLength(17);
    expect(game.players.slice(1).every((p) => p.tiles.length === 16)).toBe(
      true,
    );
    expect(first.value.view.winningSets).toBe(5);
    expect(game.players.flatMap((p) => p.tiles).some((t) => t.type >= 34)).toBe(
      false,
    );
    const forged = {
      ...first.value,
      view: { ...first.value.view, legalDiscardIds: [] },
    };
    expect(() =>
      assertVariantAction(forged, {
        type: "discard",
        tileId: first.value.view.hand[0]!.id,
      }),
    ).toThrow(/Illegal/);
  });
});

it("deals the dealer extra tile before initial flowers and defers a replacement flower to the next pass", () => {
  const adapter = createTaiwaneseAdapter(),
    inventory = adapter.inventory(),
    wall: (Tile | undefined)[] = Array(144),
    used = new Set<number>();
  for (const [slot, id] of [
    [0, 136],
    [4, 137],
    [64, 138],
    [143, 139],
  ] as const) {
    wall[slot] = inventory[id]!;
    used.add(id);
  }
  const rest = inventory.filter((t) => !used.has(t.id));
  for (let i = 0; i < 144; i++) if (!wall[i]) wall[i] = rest.shift()!;
  const game = new VariantGame({
    variant: "taiwanese",
    seed: "initial-flower-passes",
    length: "east",
    wallFactory: () => wall as Tile[],
  });
  const request = game.play().next();
  expect(request.done).toBe(false);
  const door = game.events.findIndex(
      (e) => e.type === "draw" && e["tile"] === 138,
    ),
    first = game.events.findIndex((e) => e.type === "flower"),
    south = game.events.findIndex(
      (e) => e.type === "flower" && e["tile"] === 137,
    ),
    deferred = game.events.findIndex(
      (e) => e.type === "flower" && e["tile"] === 139,
    );
  expect(door).toBeLessThan(first);
  expect(south).toBeGreaterThan(first);
  expect(deferred).toBeGreaterThan(south);
  expect(game.players[0]!.tiles).toHaveLength(17);
  expect(game.players.slice(1).every((p) => p.tiles.length === 16)).toBe(true);
});

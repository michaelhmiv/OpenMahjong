/**
 * Policy behaviour tests (brief §6): the three layers, exercised on
 * fabricated positions — efficiency, value judgment (riichi/damaten,
 * calls), and defense against riichi.
 */

import { describe, expect, it } from "vitest";
import type { Tile, TurnAction } from "@openmahjong/engine";
import { createAiPolicy } from "../src/index.js";
import {
  makeCallCtx,
  makeTurnCtx,
  makeView,
  meldOf,
  resetPool,
  tilesOf,
} from "./view-helpers.js";

const ai = createAiPolicy();

function discardOf(action: TurnAction): { tileId: number; riichi?: boolean } {
  if (action.type !== "discard") throw new Error(`expected discard, got ${action.type}`);
  return action;
}

function tileByType(hand: readonly Tile[], type: number): Tile {
  const t = hand.find((x) => x.type === type);
  if (!t) throw new Error(`type ${type} not in hand`);
  return t;
}

describe("efficiency core", () => {
  it("discards the isolated tile that keeps the best ukeire", () => {
    // 234m 345p 678s 23s EE + drawn 9m: throwing 9m leaves 1-shanten
    // with a wide acceptance; anything else breaks a group or the pair.
    const view = makeView({ hand: "234m345p678s23s9m11z" });
    const drawn = tileByType(view.hand, 8); // 9m
    const action = ai.turn(view, makeTurnCtx({ drawnTile: drawn }));
    const d = discardOf(action);
    expect(view.hand.find((t) => t.id === d.tileId)?.type).toBe(8);
  });

  it("takes tsumo whenever the engine offers it", () => {
    const view = makeView({ hand: "234m345p678s234s11z" });
    const drawn = tileByType(view.hand, 27);
    expect(ai.turn(view, makeTurnCtx({ drawnTile: drawn, canTsumo: true }))).toEqual({
      type: "tsumo",
    });
  });

  it("declares ankan when offered (and not chasing chiitoitsu)", () => {
    const view = makeView({ hand: "234m345p678s2s7777z" });
    const drawn = tileByType(view.hand, 33);
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, ankanOptions: [33] }),
    );
    expect(action).toEqual({ type: "ankan", tileType: 33 });
  });

  it("takes kyuushu kyuuhai on a hopeless non-kokushi hand", () => {
    // Nine distinct terminals/honors plus a broken suited run: standard
    // shanten 5, kokushi 4 — going nowhere.
    const view = makeView({ hand: "12345m9m19p6p19s123z" });
    const drawn = tileByType(view.hand, 29); // West
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, canKyuushu: true }),
    );
    expect(action).toEqual({ type: "kyuushu" });
  });

  it("plays on when the hand is a real kokushi chase", () => {
    // All thirteen orphans with a pair: kokushi complete/tenpai
    // territory — never kyuushu.
    const view = makeView({ hand: "19m19p19s1234567z9s" });
    const drawn = tileByType(view.hand, 26); // 9s
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, canKyuushu: true }),
    );
    expect(action.type).toBe("discard");
  });

  it("a riichi player discards the drawn tile", () => {
    const view = makeView({
      hand: "234m345p678s234s11z",
      riichi: [true],
    });
    const drawn = tileByType(view.hand, 27);
    const action = ai.turn(view, makeTurnCtx({ drawnTile: drawn }));
    expect(action).toEqual({ type: "discard", tileId: drawn.id });
  });
});

describe("hand-value judgment: riichi", () => {
  // Tenpai after throwing the drawn White dragon: tanki on East with
  // three copies live. Closed, cheap hand — riichi is the value.
  const tenpaiSpec = { hand: "234m456p678s234s15z" };

  it("declares riichi on a tenpai hand with a live wait", () => {
    const view = makeView({ ...tenpaiSpec, wallRemaining: 40 });
    const drawn = tileByType(view.hand, 31); // White dragon
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, riichiDiscardIds: [drawn.id] }),
    );
    const d = discardOf(action);
    expect(d.tileId).toBe(drawn.id);
    expect(d.riichi).toBe(true);
  });

  it("does not declare a one-copy wait late in the hand", () => {
    // Two Easts are already in the discard pools: the tanki wait has a
    // single live copy, and only ten tiles remain in the wall.
    const view = makeView({
      ...tenpaiSpec,
      wallRemaining: 10,
      discards: [undefined, "11z", undefined, undefined],
    });
    const drawn = tileByType(view.hand, 31);
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, riichiDiscardIds: [drawn.id] }),
    );
    const d = discardOf(action);
    expect(d.tileId).toBe(drawn.id);
    expect(d.riichi).toBeFalsy();
  });

  it("may declare the same one-copy wait early", () => {
    const view = makeView({
      ...tenpaiSpec,
      wallRemaining: 40,
      discards: [undefined, "11z", undefined, undefined],
    });
    const drawn = tileByType(view.hand, 31);
    const action = ai.turn(
      view,
      makeTurnCtx({ drawnTile: drawn, riichiDiscardIds: [drawn.id] }),
    );
    expect(discardOf(action).riichi).toBe(true);
  });
});

describe("defense against riichi", () => {
  // 3-shanten hand holding an isolated 5p:
  // 234m + kanchan 68p + kanchan 35s + WhWh, singles 8m 9m 9p 2s 3s 5p.
  const foldSpec = {
    hand: "23489m5689p235s55z",
    riichi: [false, true, false, false],
  };

  it("folds with genbutsu even when it is not the efficiency pick", () => {
    const view = makeView({
      ...foldSpec,
      discards: [undefined, "05p2z", undefined, undefined],
    });
    const drawn = tileByType(view.hand, 13); // 5p
    const action = ai.turn(view, makeTurnCtx({ drawnTile: drawn }));
    const d = discardOf(action);
    expect(view.hand.find((t) => t.id === d.tileId)?.type).toBe(13); // 5p, genbutsu
  });

  it("falls back to a suji tile when no genbutsu is held", () => {
    // Riichi player has discarded 2p and 8p: both ryanmen sides of 5p
    // are covered by suji (other wait shapes remain), and safer
    // than every honor/terminal/simple we hold.
    const view = makeView({
      ...foldSpec,
      hand: "23489m5699p235s55z", // no held 8p genbutsu; still a fold-worthy 2-shanten hand
      discards: [undefined, "28p3z", undefined, undefined],
    });
    const drawn = tileByType(view.hand, 17); // 9p
    const action = ai.turn(view, makeTurnCtx({ drawnTile: drawn }));
    const d = discardOf(action);
    expect(view.hand.find((t) => t.id === d.tileId)?.type).toBe(13); // 5p, suji
  });

  it("does not open the hand to chase against riichi", () => {
    // 2-shanten against a riichi: even a shanten-reducing chi is refused.
    const view = makeView({
      hand: "1234m67p34s55z9m9p2s",
      riichi: [false, true, false, false],
      discards: [undefined, "2p3z", undefined, undefined],
    });
    const fiveP = tilesOf("5p")[0]!;
    const sixP = tileByType(view.hand, 14);
    const sevenP = tileByType(view.hand, 15);
    const action = ai.call(
      view,
      makeCallCtx({
        tile: fiveP,
        fromSeat: 3,
        chiOptions: [[sixP.id, sevenP.id]],
      }),
    );
    expect(action).toEqual({ type: "pass" });
  });
});

describe("call decisions", () => {
  it("always takes ron and chankan when legal", () => {
    const view = makeView({ hand: "234m345p678s234s1z" });
    const tile = tilesOf("1z")[0]!;
    expect(
      ai.call(view, makeCallCtx({ phase: "ron", tile, canRon: true })),
    ).toEqual({ type: "ron" });
    expect(
      ai.call(view, makeCallCtx({ phase: "chankan", tile, canRon: true })),
    ).toEqual({ type: "ron" });
    expect(
      ai.call(view, makeCallCtx({ phase: "ron", tile, canRon: false })),
    ).toEqual({ type: "pass" });
  });

  it("pons a yakuhai pair to reach tenpai", () => {
    // 234m 345p 678s 23s + White pair: pon the White → tenpai.
    const view = makeView({ hand: "234m345p678s23s55z" });
    const tile = tilesOf("5z")[0]!;
    const action = ai.call(
      view,
      makeCallCtx({ tile, fromSeat: 2, canPon: true }),
    );
    expect(action).toEqual({ type: "pon" });
  });

  it("passes a pon that does not advance the hand", () => {
    // Four sequences + a floating 4p whose pair is part of a sequence:
    // ponning the 4p leaves the same shanten. No free lunch, no pon.
    const view = makeView({ hand: "234m3445p678s234s" });
    const tile = tilesOf("4p")[0]!;
    const action = ai.call(
      view,
      makeCallCtx({ tile, fromSeat: 2, canPon: true }),
    );
    expect(action).toEqual({ type: "pass" });
  });

  it("chis a sequence that completes the hand's shape", () => {
    // 234m 345p 678s 24s EE: chi the 3s → tenpai.
    const view = makeView({ hand: "234m345p678s24s11z" });
    const twoS = tileByType(view.hand, 19);
    const fourS = tileByType(view.hand, 21);
    const tile = tilesOf("3s")[0]!;
    const action = ai.call(
      view,
      makeCallCtx({
        tile,
        fromSeat: 3,
        chiOptions: [[twoS.id, fourS.id]],
      }),
    );
    expect(action).toEqual({ type: "chi", tileIds: [twoS.id, fourS.id] });
  });

  it("handles the engine's two-pass call window: no chi in the pon pass, chi in the chi pass", () => {
    // Regression: the engine asks about a discard in a pon/kan pass
    // (chi there throws) and then a chi pass, with identical contexts.
    // This hand can pon the 3s (it holds a pair) AND chi it (24s in
    // hand); the pon does not advance the hand, so the first ask must
    // pass — and the repeat ask, which can only be the chi pass, may
    // chi.
    const policy = createAiPolicy();
    const view = makeView({ hand: "234m345p678s234s3s" });
    const twoS = tileByType(view.hand, 19);
    const fourS = tileByType(view.hand, 21);
    const tile = tilesOf("3s")[0]!;
    const ctx = makeCallCtx({
      tile,
      fromSeat: 3,
      canPon: true,
      chiOptions: [[twoS.id, fourS.id]],
    });
    expect(policy.call(view, ctx)).toEqual({ type: "pass" });
    expect(policy.call(view, ctx)).toEqual({
      type: "chi",
      tileIds: [twoS.id, fourS.id],
    });
  });

  it("a riichi player passes everything but ron", () => {
    const view = makeView({
      hand: "234m345p678s23s55z",
      riichi: [true],
    });
    const tile = tilesOf("5z")[0]!;
    expect(
      ai.call(view, makeCallCtx({ tile, fromSeat: 2, canPon: true })),
    ).toEqual({ type: "pass" });
  });

  it("uses explicit call stages independently of previous asks", () => {
    const policy = createAiPolicy();
    const view = makeView({ hand: "234m345p678s234s3s" });
    const twoS = tileByType(view.hand, 19);
    const fourS = tileByType(view.hand, 21);
    const tile = tilesOf("3s")[0]!;
    const chi = { ...makeCallCtx({ tile, fromSeat: 3, chiOptions: [[twoS.id, fourS.id]] }), callStage: "chi" as const };
    // A review can analyze the chi position directly, without having
    // observed the earlier pon/kan pass or mutating policy history.
    const expected = { type: "chi", tileIds: [twoS.id, fourS.id] };
    expect(policy.call(view, chi)).toEqual(expected);
    expect(policy.call(view, chi)).toEqual(expected);
    const pon = { ...makeCallCtx({ tile, fromSeat: 3, canPon: true }), callStage: "pon-kan" as const };
    expect(policy.call(view, pon)).toEqual({ type: "pass" });
    expect(policy.call(view, pon)).toEqual({ type: "pass" });
  });

  it("plays from an open hand: discard evaluation accounts for melds", () => {
    resetPool();
    const pon = meldOf("pon", "555z", 1);
    const view = makeView({
      hand: "234m678s234s59m",
      melds: [pon],
    });
    const drawn = tileByType(view.hand, 8);
    const action = ai.turn(view, makeTurnCtx({ drawnTile: drawn }));
    const d = discardOf(action);
    expect(view.hand.find((t) => t.id === d.tileId)?.type).toBe(8);
  });
});

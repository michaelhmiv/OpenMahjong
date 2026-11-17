// @vitest-environment node
/**
 * Coach moment tests (coaching remainder brief, G1–G4 + acceptance
 * A1/A3/A4/A5 at the coach level): seeded fabricated positions per
 * moment type — the recommendation is the shared policy's own choice,
 * the facts match the position, the furiten consequence of a passed
 * ron is stated for riichi and non-riichi players, kan grading names
 * the dora consequence in both directions, and riichi grading
 * separates the four archetype contexts.
 */
import { describe, expect, it } from "vitest";
import {
  Game,
  type CallContext,
  type PlayerView,
  type Policy,
  type Tile,
  type TurnContext,
} from "@openmahjong/engine";
import { createAiPolicy } from "@openmahjong/ai";
import {
  adviseCall,
  adviseKan,
  adviseRiichi,
  adviseWin,
} from "../src/index.js";
import { makeCallCtx, makeTurnCtx, makeView, meldOf, tilesOf } from "./view-helpers.js";

function callCtx(
  spec: Parameters<typeof makeCallCtx>[0] & { callStage?: "pon-kan" | "chi" },
): CallContext {
  const { callStage, ...rest } = spec;
  return { ...makeCallCtx(rest), ...(callStage ? { callStage } : {}) };
}

// ---------------------------------------------------------------------------
// G1 — call windows
// ---------------------------------------------------------------------------

describe("adviseCall: pon / chi / pass", () => {
  it("names the open-hand trap: a pon that leaves no yaku path", () => {
    // Seven-pairs tenpai (tanki on the 9 of bamboo). Ponning the 7
    // of bamboo breaks the only shapes this hand can win with —
    // seven pairs and riichi both need a closed hand — and the open
    // remainder has no yakuhai, no all-simples, no one-suit path.
    const view = makeView({ hand: "2233m4455p6677s9s" });
    const tile = tilesOf("7s")[0]!;
    const advice = adviseCall(view, callCtx({ tile, canPon: true, callStage: "pon-kan", fromSeat: 3 }));
    const pon = advice.options.find((o) => o.action === "pon")!;
    expect(pon.noYakuPath).toBe(true);
    expect(pon.yakuPaths).toEqual([]);
    expect(pon.opensHand).toBe(true);
    expect(advice.recommendation.action).toBe("pass");
    expect(advice.headline).toContain("no yaku path");
  });

  it("still names the trap when the shared policy takes the pon", () => {
    // Shanpon tenpai on two terminal pairs. Ponning reaches a ready
    // shape that can never win: open, terminal triplet, no yakuhai.
    // The slice-1 policy takes this pon (it grades shanten, not
    // winnability); the coach follows the policy's recommendation
    // and names the cost in the same breath — that naming is G1's
    // job, and changing the policy is out of this brief's scope.
    const view = makeView({ hand: "234m345p678s11s99s" });
    const tile = tilesOf("1s")[0]!;
    const advice = adviseCall(view, callCtx({ tile, canPon: true, callStage: "pon-kan", fromSeat: 1 }));
    const pon = advice.options.find((o) => o.action === "pon")!;
    expect(pon.noYakuPath).toBe(true);
    expect(pon.shantenAfter).toBe(0);
    expect(advice.headline).toContain("no yaku path");
  });

  it("recommends the yakuhai pon that reaches tenpai", () => {
    const view = makeView({ hand: "234m345p678s55z99s" });
    const tile = tilesOf("5z")[0]!;
    const advice = adviseCall(view, callCtx({ tile, canPon: true, callStage: "pon-kan", fromSeat: 2 }));
    const pon = advice.options.find((o) => o.action === "pon")!;
    expect(pon.shantenAfter).toBe(0);
    expect(pon.yakuPaths.some((p) => p.includes("already a yaku"))).toBe(true);
    expect(pon.noYakuPath).toBe(false);
    expect(advice.recommendation.action).toBe("pon");
    expect(advice.headline).toContain("your hand is ready");
  });

  it("grades each chi option with its resulting shanten and ukeire", () => {
    // One step away with two incomplete runs; chi-ing the 3 of
    // bamboo with the 4 and 5 reaches tenpai, and every tile is a
    // simple, so the all-simples path survives opening the hand.
    const view = makeView({ hand: "345m678p678s45s23p" });
    const fourS = view.hand.find((t) => t.type === 21)!;
    const fiveS = view.hand.find((t) => t.type === 22)!;
    const tile = tilesOf("3s")[0]!;
    const advice = adviseCall(
      view,
      callCtx({ tile, chiOptions: [[fourS.id, fiveS.id]], callStage: "chi", fromSeat: 3 }),
    );
    expect(advice.shantenBefore).toBe(1);
    const chi = advice.options.find((o) => o.action === "chi")!;
    expect(chi.shantenAfter).toBe(0);
    // After the forced discard the hand waits on a single tile type
    // (the 2 or the 3 of dots), three unseen copies.
    expect(chi.improvingTotal).toBe(3);
    expect(chi.yakuPaths.some((p) => p.includes("all simples"))).toBe(true);
    expect(chi.noYakuPath).toBe(false);
    expect(advice.recommendation.action).toBe("chi");
    expect(advice.recommendation.chiTileIds).toEqual([fourS.id, fiveS.id]);
  });

  it("passes against riichi when the hand is far from ready", () => {
    const view = makeView({
      hand: "234m345p11s5z9m3s7p2z",
      riichi: [false, false, true, false],
      discards: [undefined, undefined, "9p", undefined],
    });
    const tile = tilesOf("1s")[0]!;
    const advice = adviseCall(view, callCtx({ tile, canPon: true, callStage: "pon-kan", fromSeat: 1 }));
    expect(advice.shantenBefore).toBe(3);
    expect(advice.riichiThreat).toBe(true);
    expect(advice.recommendation.action).toBe("pass");
    expect(advice.headline).toContain("against riichi");
    const pon = advice.options.find((o) => o.action === "pon")!;
    expect(pon.shantenAfter).toBe(2);
  });

  it("offers only pass when nothing is legal", () => {
    const view = makeView({ hand: "234m345p678s11s99s" });
    const tile = tilesOf("9m")[0]!;
    const advice = adviseCall(view, callCtx({ tile, fromSeat: 1 }));
    expect(advice.options.map((o) => o.action)).toEqual(["pass"]);
    expect(advice.recommendation.action).toBe("pass");
  });
});

describe("adviseCall: ron and the ron-pass (A3)", () => {
  const tenpai = "234m345p678s55z99s"; // shanpon: white dragon and 9 of bamboo

  it("values the ron and states the temporary furiten of passing it", () => {
    // Indicator 9 of characters: the dora is the 1 of characters,
    // which this hand does not hold, so the ron is a bare yakuhai.
    const view = makeView({ hand: tenpai, doraIndicators: [8] });
    const tile = tilesOf("5z")[0]!;
    const advice = adviseCall(view, callCtx({ phase: "ron", tile, canRon: true, fromSeat: 1 }));
    const ron = advice.options.find((o) => o.action === "ron")!;
    expect(ron.win).not.toBeNull();
    expect(ron.win!.han).toBe(1);
    expect(ron.win!.yaku).toContain("Yakuhai (Haku)");
    expect(ron.win!.points).toBeGreaterThanOrEqual(1500);
    expect(advice.recommendation.action).toBe("ron");
    expect(advice.headline).toContain("Ron");
    expect(advice.ronPass).not.toBeNull();
    expect(advice.ronPass!.temporaryFuriten).toBe(true);
    expect(advice.ronPass!.permanentFuriten).toBe(false);
    expect(advice.ronPass!.ownPondWaits).toEqual([]);
  });

  it("states permanent furiten for a riichi player who passes a ron", () => {
    const view = makeView({
      hand: tenpai,
      riichi: [true, false, false, false],
      discards: ["9s", undefined, undefined, undefined],
    });
    const tile = tilesOf("5z")[0]!;
    const advice = adviseCall(view, callCtx({ phase: "ron", tile, canRon: true, fromSeat: 1 }));
    expect(advice.ronPass!.temporaryFuriten).toBe(true);
    expect(advice.ronPass!.permanentFuriten).toBe(true);
    // The 9 of bamboo wait sits in the player's own pond: discard
    // furiten already barred ron on it before this pass.
    expect(advice.ronPass!.ownPondWaits.map((w) => w.type)).toEqual([26]);
  });
});

// ---------------------------------------------------------------------------
// G2 — kan declarations
// ---------------------------------------------------------------------------

describe("adviseKan", () => {
  it("recommends the ankan the policy declares, with its dora counted", () => {
    const view = makeView({ hand: "1111m234p345s678s9s", doraIndicators: [8] });
    const drawn = view.hand.find((t) => t.type === 26)!;
    const advice = adviseKan(view, makeTurnCtx({ drawnTile: drawn, ankanOptions: [0] }))!;
    expect(advice).not.toBeNull();
    const kan = advice.options.find((o) => o.kind === "ankan")!;
    expect(kan.tileType).toBe(0);
    // The indicator is the 9 of characters, so every 1 of characters
    // in the kan is a dora.
    expect(kan.doraInKan).toBe(4);
    expect(advice.handDora).toBe(4);
    expect(advice.recommended?.tileType).toBe(0);
    expect(advice.headline).toContain("Declare the kan");
  });

  it("holds an ankan that would break a seven-pairs shape", () => {
    const view = makeView({ hand: "1111m2233p4455s66z", doraIndicators: [8] });
    const drawn = view.hand.find((t) => t.type === 0)!;
    const advice = adviseKan(view, makeTurnCtx({ drawnTile: drawn, ankanOptions: [0] }))!;
    const kan = advice.options[0]!;
    expect(kan.breaksChiitoi).toBe(true);
    expect(advice.recommended).toBeNull();
    expect(advice.headline).toContain("seven-pairs");
  });

  it("names the dora consequence in both directions (A4)", () => {
    // A riichi opponent is waiting: a new indicator can feed them.
    // The player's own tiles are thick with types one indicator away
    // from dora: the same flip can pay the player instead.
    const view = makeView({
      hand: "3333p234m345s678s9m",
      riichi: [false, false, true, false],
      discards: [undefined, undefined, "9p", undefined],
    });
    const drawn = view.hand.find((t) => t.type === 8)!;
    const advice = adviseKan(view, makeTurnCtx({ drawnTile: drawn, ankanOptions: [11] }))!;
    expect(advice.riichiThreat).toBe(true);
    expect(advice.potentialNewDora).toBe(13);
    const kan = advice.options[0]!;
    expect(kan.doraInKan).toBe(0);
  });

  it("holds a shouminkan into a riichi threat while the hand is not ready, declares it otherwise", () => {
    const melds = [meldOf("pon", "555p")];
    const threatened = makeView({
      hand: "234m678s11z9m3s5p",
      melds,
      riichi: [false, false, true, false],
      discards: [undefined, undefined, "9p", undefined],
    });
    const drawnA = threatened.hand.find((t) => t.type === 8)!;
    const held = adviseKan(threatened, makeTurnCtx({ drawnTile: drawnA, shouminkanOptions: [13] }))!;
    expect(held.recommended).toBeNull();
    expect(held.headline).toContain("against riichi");

    const open = makeView({ hand: "234m345s678s55p", melds: [meldOf("pon", "555p")] });
    const drawnB = open.hand.find((t) => t.type === 13)!;
    const declared = adviseKan(open, makeTurnCtx({ drawnTile: drawnB, shouminkanOptions: [13] }))!;
    expect(declared.recommended?.kind).toBe("shouminkan");
  });

  it("is null when no kan is on offer", () => {
    const view = makeView({ hand: "234m345p678s23s99s" });
    expect(adviseKan(view, makeTurnCtx())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G3 — riichi vs dama (A5 archetypes)
// ---------------------------------------------------------------------------

describe("adviseRiichi", () => {
  const goodWaitHand = "234m345p678s23s99s5m"; // discard 5m: ryanmen 1s/4s, pinfu

  it("declares on a good wait with a cheap silent hand", () => {
    // Indicator 9 of characters keeps dora out of the hand, so the
    // silent ron is a bare pinfu: 1,500 from the dealer seat.
    const view = makeView({ hand: goodWaitHand, doraIndicators: [8] });
    const five = view.hand.find((t) => t.type === 4)!;
    const grade = adviseRiichi(view, makeTurnCtx({ drawnTile: five, riichiDiscardIds: [five.id] }))!;
    expect(grade.liveTotal).toBe(8);
    expect(grade.twoSided).toBe(true);
    expect(grade.damaRon).not.toBeNull();
    expect(grade.damaRon!.yaku).toContain("Pinfu");
    expect(grade.damaRon!.points).toBe(1500);
    expect(grade.verdict).toBe("declare");
    expect(grade.reasons).toContain("good-wait");
    expect(grade.reasons).toContain("two-sided-wait");
    expect(grade.reasons).toContain("cheap-dama");
  });

  it("stays silent on a bad wait when the hand already scores", () => {
    const view = makeView({
      hand: "234m345p678s555z99m",
      doraIndicators: [33], // red dragon indicator: white dragons are dora
      discards: [undefined, "9m", undefined, undefined],
    });
    const nine = view.hand.find((t) => t.type === 8)!;
    const grade = adviseRiichi(view, makeTurnCtx({ drawnTile: nine, riichiDiscardIds: [nine.id] }))!;
    expect(grade.liveTotal).toBe(1);
    expect(grade.tanki).toBe(true);
    expect(grade.damaRon).not.toBeNull();
    expect(grade.damaRon!.han).toBe(4); // yakuhai + three dora
    expect(grade.verdict).toBe("dama");
    expect(grade.reasons).toContain("bad-wait");
    expect(grade.reasons).toContain("valuable-dama");
  });

  it("protects a late lead instead of declaring", () => {
    const view = makeView({
      hand: "234m345p678s555z9s5m",
      scores: [45000, 25000, 20000, 10000],
      roundWind: 28,
      kyoku: 4,
    });
    const five = view.hand.find((t) => t.type === 4)!;
    const grade = adviseRiichi(view, makeTurnCtx({ drawnTile: five, riichiDiscardIds: [five.id] }))!;
    expect(grade.placement).toBe(1);
    expect(grade.leadOverSecond).toBe(20000);
    expect(grade.lateGame).toBe(true);
    expect(grade.verdict).toBe("dama");
    expect(grade.reasons).toContain("leader-late");
  });

  it("declares when chasing late with a good wait", () => {
    const view = makeView({
      hand: goodWaitHand,
      scores: [8000, 40000, 30000, 22000],
      roundWind: 28,
      kyoku: 3,
    });
    const five = view.hand.find((t) => t.type === 4)!;
    const grade = adviseRiichi(view, makeTurnCtx({ drawnTile: five, riichiDiscardIds: [five.id] }))!;
    expect(grade.placement).toBe(4);
    expect(grade.behindLeader).toBe(32000);
    expect(grade.verdict).toBe("declare");
    expect(grade.reasons).toContain("chaser-late");
  });

  it("is null when riichi is not on offer", () => {
    const view = makeView({ hand: "234m345p678s23s99s" });
    expect(adviseRiichi(view, makeTurnCtx())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G4 — take the win or decline it
// ---------------------------------------------------------------------------

describe("adviseWin", () => {
  it("affirms taking an ordinary tsumo and prices the decline", () => {
    const view = makeView({ hand: "234m345p678s555z99s" });
    const drawn = view.hand.find((t) => t.type === 26)!;
    const advice = adviseWin(view, makeTurnCtx({ drawnTile: drawn, canTsumo: true }))!;
    expect(advice.value.han).toBeGreaterThanOrEqual(2);
    expect(advice.value.yaku.length).toBeGreaterThanOrEqual(2);
    expect(advice.value.points).toBeGreaterThan(0);
    expect(advice.ceiling).not.toBeNull();
    expect(advice.verdict).toBe("take");
    expect(advice.reasons).toContain("certain-value");
    expect(advice.headline).toContain("Take the win");
  });

  it("names the rare decline: a yakuman wait against a haneman in hand", () => {
    // Two dragon triplets and the third dragon pair: the drawn 9 of
    // dots completes a haneman (all triplets, three concealed
    // triplets, two yakuhai, tsumo), but passing it up keeps a
    // shanpon whose red-dragon side completes daisangen (big three
    // dragons), a yakuman.
    const view = makeView({ hand: "345m999p555z666z77z", dealer: 1 });
    const drawn = view.hand.find((t) => t.type === 17)!;
    const advice = adviseWin(view, makeTurnCtx({ drawnTile: drawn, canTsumo: true }))!;
    expect(advice.value.han).toBe(7);
    expect(advice.ceiling).not.toBeNull();
    expect(advice.ceiling!.yakuman).toBe(true);
    expect(advice.ceiling!.points).toBe(32000);
    // The kept shanpon: one live 9 of dots (the drawn copy was the
    // discard) and two live red dragons.
    expect(advice.declineLive).toBe(3);
    expect(advice.verdict).toBe("decline-defensible");
    expect(advice.reasons).toContain("higher-ceiling");
    expect(advice.reasons).toContain("wide-wait-after-decline");
  });

  it("is null when no tsumo is on offer", () => {
    const view = makeView({ hand: "234m345p678s23s99s" });
    expect(adviseWin(view, makeTurnCtx())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agreement with the shared policy on real game positions
// ---------------------------------------------------------------------------

describe("moment evaluators on real game positions", () => {
  interface CallCapture { view: PlayerView; ctx: CallContext; action: string; chiIds?: readonly number[] }
  interface TurnCapture { view: PlayerView; ctx: TurnContext; action: string; tileType?: number }

  function capture(seed: string): { calls: CallCapture[]; turns: TurnCapture[] } {
    const calls: CallCapture[] = [];
    const turns: TurnCapture[] = [];
    const snap = (view: PlayerView): PlayerView => ({
      ...view,
      hand: [...view.hand],
      melds: [...view.melds],
      players: view.players.map((p) => ({ ...p, discards: [...p.discards], melds: [...p.melds] })),
      doraIndicators: [...view.doraIndicators],
    });
    // One recorder per seat (each with its own oracle instance, as
    // in production), all capturing into the same arrays: kan offers
    // are rare enough that seat 0 alone may never see one.
    const mkRecorder = (): Policy => {
      const oracle = createAiPolicy();
      return {
        turn: (view, ctx) => {
          const action = oracle.turn(view, ctx);
          if (turns.length < 400) {
            turns.push({
              view: snap(view),
              ctx: {
                ...ctx,
                ankanOptions: [...ctx.ankanOptions],
                shouminkanOptions: [...ctx.shouminkanOptions],
                riichiDiscardIds: [...ctx.riichiDiscardIds],
              },
              action: action.type,
              ...(action.type === "ankan" || action.type === "shouminkan"
                ? { tileType: action.tileType }
                : {}),
            });
          }
          return action;
        },
        call: (view, ctx) => {
          const action = oracle.call(view, ctx);
          if (view.seat === 0 && calls.length < 400) {
            calls.push({
              view: snap(view),
              ctx: { ...ctx, tile: { ...ctx.tile }, chiOptions: ctx.chiOptions.map(([a, b]) => [a, b] as const) },
              action: action.type,
              ...(action.type === "chi" ? { chiIds: action.tileIds } : {}),
            });
          }
          return action;
        },
      };
    };
    new Game({
      seed,
      length: "east",
      policies: [mkRecorder(), mkRecorder(), mkRecorder(), mkRecorder()],
    }).run();
    return { calls, turns };
  }

  it("the call recommendation is the policy's own action", { timeout: 60_000 }, () => {
    const { calls } = capture("coach-moments-1");
    expect(calls.length).toBeGreaterThan(10);
    for (const { view, ctx, action, chiIds } of calls) {
      const advice = adviseCall(view, ctx);
      expect(advice.recommendation.action).toBe(action);
      if (action === "chi") {
        expect([...advice.recommendation.chiTileIds!].sort()).toEqual([...chiIds!].sort());
      }
      expect(advice.headline.length).toBeGreaterThan(0);
    }
  });

  it("moment evaluation stays inside the per-decision latency budget", { timeout: 120_000 }, () => {
    // The brief's budget is the CPU opponent's own: mean decision
    // time under 50 ms (packages/ai benchmark). Grade every captured
    // call window and every captured turn's applicable moments and
    // hold the coach to the same mean.
    const { calls, turns } = capture("coach-moments-1");
    const durations: number[] = [];
    const time = (fn: () => void) => {
      const start = performance.now();
      fn();
      durations.push(performance.now() - start);
    };
    for (const { view, ctx } of calls) time(() => adviseCall(view, ctx));
    for (const { view, ctx } of turns) {
      if (ctx.ankanOptions.length > 0 || ctx.shouminkanOptions.length > 0) {
        time(() => adviseKan(view, ctx));
      }
      if (ctx.riichiDiscardIds.length > 0) time(() => adviseRiichi(view, ctx));
      if (ctx.canTsumo) time(() => adviseWin(view, ctx));
    }
    expect(durations.length).toBeGreaterThan(10);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    expect(mean).toBeLessThan(50);
  });

  it("the kan recommendation matches the policy's turn action", { timeout: 120_000 }, () => {
    // Kan offers are rare in any one game, so capture turns from
    // every seat across several seeded games.
    const turns: TurnCapture[] = [];
    for (const seed of ["coach-moments-2", "coach-moments-3", "coach-moments-4"]) {
      turns.push(...capture(seed).turns);
      if (turns.some((t) => t.ctx.ankanOptions.length > 0 || t.ctx.shouminkanOptions.length > 0)) break;
    }
    const withKan = turns.filter(
      (t) => t.ctx.ankanOptions.length > 0 || t.ctx.shouminkanOptions.length > 0,
    );
    expect(withKan.length).toBeGreaterThan(0);
    for (const { view, ctx, action, tileType } of withKan) {
      const advice = adviseKan(view, ctx)!;
      if (action === "ankan" || action === "shouminkan") {
        expect(advice.recommended?.kind).toBe(action);
        expect(advice.recommended?.tileType).toBe(tileType);
      } else {
        expect(advice.recommended).toBeNull();
      }
    }
  });
});

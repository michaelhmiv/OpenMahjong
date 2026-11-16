// @vitest-environment node
/**
 * Coach-core tests (brief §9 / COACH ARCHITECTURE): the advice must be
 * legal (each physical discard in hand), must agree
 * with the CPU policy's own pick — the coach is the policy opened up,
 * not a second opinion — must carry facts that match the evaluation
 * (waits, genbutsu, danger), and must be deterministic.
 */
import { describe, expect, it } from "vitest";
import { Game, type PlayerView, type Policy, type TurnAction, type TurnContext } from "@openmahjong/engine";
import { createAiPolicy } from "@openmahjong/ai";
import { adviseDiscard, tileName } from "../src/index.js";
import { makeTurnCtx, makeView } from "./view-helpers.js";

describe("tileName", () => {
  it("names suits and honors in the client's words", () => {
    expect(tileName(0)).toBe("1 of characters");
    expect(tileName(8)).toBe("9 of characters");
    expect(tileName(17)).toBe("9 of dots");
    expect(tileName(26)).toBe("9 of bamboo");
    expect(tileName(27)).toBe("East wind");
    expect(tileName(30)).toBe("North wind");
    expect(tileName(31)).toBe("White dragon");
    expect(tileName(33)).toBe("Red dragon");
  });
});

describe("adviseDiscard on fabricated positions", () => {
  it("recommends the unique tenpai discard with its waits", () => {
    // 234m 345p 678s 23s 99s + a drawn 5m: only discarding the 5m
    // leaves the two-sided 1s/4s wait.
    const view = makeView({ hand: "2345m345p678s23s99s" });
    const advice = adviseDiscard(view, makeTurnCtx());
    const rec = advice.recommendation;
    expect(rec.tileName).toBe("5 of characters");
    expect(rec.shantenAfter).toBe(0);
    expect(rec.waits.map((w) => w.type)).toEqual([18, 21]);
    expect(rec.reasons).toContain("ready");
    expect(rec.reasons).toContain("two-wait-types");
    expect(advice.headline).toBe(
      "Discard the 5 of characters — you are ready, waiting on the 1 of bamboo and the 4 of bamboo.",
    );
    // Include equivalent plain copies and distinct red-five value.
    expect(advice.options.map((o) => o.tileId).sort((a, b) => a - b)).toEqual(view.hand.map((t) => t.id).sort((a, b) => a - b));
    for (const o of advice.options) {
      expect(view.hand.some((t) => t.id === o.tileId)).toBe(true);
    }
  });

  it("surfaces the riichi option with live wait counts", () => {
    const view = makeView({ hand: "2345m345p678s23s99s" });
    const five = view.hand.find((t) => t.type === 4)!;
    const advice = adviseDiscard(
      view,
      makeTurnCtx({ riichiDiscardIds: [five.id] }),
    );
    expect(advice.riichi).not.toBeNull();
    expect(advice.riichi!.tileId).toBe(five.id);
    expect(advice.riichi!.waits.map((w) => w.type)).toEqual([18, 21]);
    expect(advice.riichi!.liveTotal).toBe(8);
    expect(advice.recommendation.tileId).toBe(five.id);
    expect(advice.headline).toContain("declare riichi");
  });

  it("marks genbutsu and danger against a riichi threat", () => {
    const view = makeView({
      hand: "234m555p678s234s9s1z",
      riichi: [false, false, true, false],
      discards: [undefined, undefined, "5p9m1z", undefined],
    });
    const advice = adviseDiscard(view, makeTurnCtx());
    const fiveP = advice.options.find((o) => o.tileType === 13)!;
    expect(fiveP.genbutsu).toBe(true);
    expect(fiveP.danger).toBe(0);
    expect(fiveP.reasons).toContain("genbutsu");
    // The pond also holds East (1z), so East is genbutsu too; the 9 of
    // bamboo is in no pond and must not be marked safe.
    const east = advice.options.find((o) => o.tileType === 27)!;
    expect(east.genbutsu).toBe(true);
    const nineS = advice.options.find((o) => o.tileType === 26)!;
    expect(nineS.genbutsu).toBe(false);
  });

  it("restricts a riichi player to the drawn tile (tsumogiri)", () => {
    const view = makeView({
      hand: "234m345p678s23s99s5m",
      riichi: [true, false, false, false],
    });
    const drawn = view.hand.find((t) => t.type === 4)!;
    const advice = adviseDiscard(view, makeTurnCtx({ drawnTile: drawn }));
    expect(advice.options.length).toBe(1);
    expect(advice.options[0]!.tileId).toBe(drawn.id);
  });

  it("is deterministic", () => {
    const view = makeView({ hand: "2345m345p678s23s99s" });
    const a = adviseDiscard(view, makeTurnCtx());
    const b = adviseDiscard(view, makeTurnCtx());
    expect(b).toEqual(a);
  });
});

describe("adviseDiscard on real game positions", () => {
  interface Capture {
    view: PlayerView;
    ctx: TurnContext;
    action: TurnAction;
  }

  function capture(seed: string, maxCaptures: number): Capture[] {
    const out: Capture[] = [];
    const oracle = createAiPolicy();
    const shared = createAiPolicy();
    const recorder: Policy = {
      turn: (view, ctx) => {
        const action = oracle.turn(view, ctx);
        if (out.length < maxCaptures) {
          // Snapshot: the engine reuses the view's arrays as the game
          // advances, so a stored reference would rot.
          out.push({
            view: {
              ...view,
              hand: [...view.hand],
              melds: [...view.melds],
              players: view.players.map((p) => ({
                ...p,
                discards: [...p.discards],
                melds: [...p.melds],
              })),
              doraIndicators: [...view.doraIndicators],
            },
            ctx: {
              ...ctx,
              ankanOptions: [...ctx.ankanOptions],
              shouminkanOptions: [...ctx.shouminkanOptions],
              riichiDiscardIds: [...ctx.riichiDiscardIds],
            },
            action,
          });
        }
        return action;
      },
      call: (view, ctx) => oracle.call(view, ctx),
    };
    new Game({
      seed,
      length: "east",
      policies: [recorder, shared, shared, shared],
    }).run();
    return out;
  }

  it("agrees with the policy's own discard and stays legal", { timeout: 60_000 }, () => {
    const captures = [
      ...capture("coach-agree-1", 30),
      ...capture("coach-agree-2", 30),
    ];
    expect(captures.length).toBeGreaterThan(20);
    let discards = 0;
    for (const { view, ctx, action } of captures) {
      const advice = adviseDiscard(view, ctx);
      // Legal: options are exactly the physical instances in hand (or the
      // single tsumogiri option in riichi).
      const selfRiichi = view.players[view.seat]!.riichi;
      if (selfRiichi && ctx.drawnTile) {
        expect(advice.options.length).toBe(1);
      } else {
        expect(advice.options.length).toBe(
          view.hand.length,
        );
      }
      for (const o of advice.options) {
        expect(view.hand.some((t) => t.id === o.tileId)).toBe(true);
        expect(o.shantenAfter).toBeGreaterThanOrEqual(0);
      }
      if (action.type === "discard") {
        discards++;
        expect(advice.recommendation.tileId).toBe(action.tileId);
        if (action.riichi) {
          expect(advice.riichi).not.toBeNull();
          expect(ctx.riichiDiscardIds).toContain(advice.recommendation.tileId);
        }
      }
      if (action.type === "tsumo") {
        expect(advice.canTsumo).toBe(true);
      }
      // Deterministic on the same position.
      expect(adviseDiscard(view, ctx)).toEqual(advice);
    }
    expect(discards).toBeGreaterThan(10);
  });

  it("never advises a tile the player does not hold (fuzz over seeds)", { timeout: 60_000 }, () => {
    for (const seed of ["coach-fuzz-1", "coach-fuzz-2", "coach-fuzz-3"]) {
      for (const { view, ctx } of capture(seed, 25)) {
        const advice = adviseDiscard(view, ctx);
        expect(advice.headline.length).toBeGreaterThan(0);
        expect(advice.recommendation).toBe(advice.options[0]);
      }
    }
  });
});


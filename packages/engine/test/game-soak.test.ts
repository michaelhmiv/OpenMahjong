/**
 * A3 soak + A5 determinism (brief §13), settlement math, and view
 * information-hiding.
 *
 * The soak drives complete games with a simple legal-move policy:
 * tsumogiri discards, riichi whenever discarding the drawn tile keeps
 * tenpai, tsumo whenever legal, kyuushu whenever offered, and no calls.
 * The full 10,000-game run with the real AI lives in packages/ai
 * (its soak test plus the sharded `soak` CI job).
 *
 * Chunk tests yield between games (`await tick()`): a vitest worker
 * running back-to-back synchronous tests never services its progress
 * RPC, and after ~60 s the run fails with an "onTaskUpdate" timeout
 * even though every test passed (this file's ~59 s CI run sat on that
 * edge and tipped over it on the PR #3 merge run).
 */

import { describe, expect, it } from "vitest";
import {
  Game,
  settle,
  type GameEvent,
  type Policy,
} from "../src/index.js";

const soakPolicy: Policy = {
  turn(view, ctx) {
    if (ctx.canTsumo) return { type: "tsumo" };
    if (ctx.canKyuushu) return { type: "kyuushu" };
    const tile = ctx.drawnTile ?? view.hand[0]!;
    if (ctx.drawnTile && ctx.riichiDiscardIds.includes(ctx.drawnTile.id)) {
      return { type: "discard", tileId: ctx.drawnTile.id, riichi: true };
    }
    return { type: "discard", tileId: tile.id };
  },
  call() {
    return { type: "pass" };
  },
};

const SOAK_GAMES = 500;
const SOAK_CHUNK = 50;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("A3 soak", () => {
  // Chunked so no single test blocks the worker for long.
  it.each(
    Array.from({ length: SOAK_GAMES / SOAK_CHUNK }, (_, i) => i * SOAK_CHUNK),
  )(
    `games starting at seed %i (chunk of ${SOAK_CHUNK}): no illegal states, exact wall accounting, scores sum to 100,000`,
    async (startSeed) => {
      for (let seed = startSeed; seed < startSeed + SOAK_CHUNK; seed++) {
        const result = new Game({ seed: `soak-${seed}`, length: "east", policies: soakPolicy }).run();

        // Final scores sum to exactly 100,000 (leftover sticks go to 1st).
        expect(result.scores.reduce((a, b) => a + b, 0)).toBe(100000);
        // Settlement is zero-sum.
        expect(result.settlement.reduce((a, s) => a + s.points, 0)).toBeCloseTo(0, 6);
        expect(result.handsPlayed).toBeGreaterThanOrEqual(4);

        // Per-hand wall accounting from the event log: 4 deals per hand;
        // live-wall draws never exceed 70; an exhaustive hand uses all 70.
        let hands = 0;
        let liveDraws = 0;
        let deals = 0;
        const checkHand = (drawnKind: string | null) => {
          expect(deals).toBe(4);
          expect(liveDraws).toBeLessThanOrEqual(70);
          if (drawnKind === "exhaustive") expect(liveDraws).toBe(70);
        };
        let pendingDrawn: string | null = null;
        for (const e of result.events) {
          if (e.type === "hand-start") {
            if (hands > 0) checkHand(pendingDrawn);
            hands++;
            liveDraws = 0;
            deals = 0;
            pendingDrawn = null;
          } else if (e.type === "deal") {
            deals++;
          } else if (e.type === "draw" && e.rinshan === false) {
            liveDraws++;
          } else if (e.type === "drawn-hand") {
            pendingDrawn = e.kind as string;
          }
        }
        checkHand(pendingDrawn);
        expect(hands).toBe(result.handsPlayed);
        await tick();
      }
    },
    900_000,
  );
});

describe("A5 determinism", () => {
  it("same seed + same policies → identical event log and scores", async () => {
    const a = new Game({ seed: "a5-seed", length: "south", policies: soakPolicy }).run();
    await tick();
    const b = new Game({ seed: "a5-seed", length: "south", policies: soakPolicy }).run();
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(b.scores).toEqual(a.scores);
    expect(b.handsPlayed).toBe(a.handsPlayed);

    const c = new Game({ seed: "a5-other", length: "south", policies: soakPolicy }).run();
    expect(JSON.stringify(c.events)).not.toBe(JSON.stringify(a.events));
  });
});

describe("settlement", () => {
  it("uma + oka for a clean ranking", () => {
    const s = settle([40000, 30000, 20000, 10000]);
    expect(s.map((e) => e.points)).toEqual([45, 5, -15, -35]);
    expect(s.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("a four-way tie splits everything to zero", () => {
    const s = settle([25000, 25000, 25000, 25000]);
    expect(s.map((e) => e.points)).toEqual([0, 0, 0, 0]);
  });

  it("a tie for first splits uma and oka", () => {
    const s = settle([35000, 35000, 20000, 10000]);
    expect(s.map((e) => e.points)).toEqual([25, 25, -15, -35]);
    expect(s.map((e) => e.rank)).toEqual([1, 1, 3, 4]);
  });
});

describe("player views hide hidden information", () => {
  it("a view exposes only the viewer's tiles and public state", () => {
    let captured: unknown = null;
    const spy: Policy = {
      turn(view, ctx) {
        if (captured === null && view.seat === 1) captured = view;
        return soakPolicy.turn(view, ctx);
      },
      call(view, ctx) {
        return soakPolicy.call(view, ctx);
      },
    };
    const policies: Policy[] = [soakPolicy, spy, soakPolicy, soakPolicy];
    const result = new Game({ seed: "views", length: "east", policies }).run();

    const view = captured as {
      seat: number;
      hand: { id: number }[];
      players: Record<string, unknown>[];
      wallRemaining: number;
      doraIndicators: unknown[];
    };
    expect(view.seat).toBe(1);
    // The view is captured at seat 1's first turn, after their first draw:
    // their 13 dealt tiles plus the drawn tile, nothing else.
    const deal = result.events.find((e) => e.type === "deal" && e.seat === 1)!;
    expect(view.hand).toHaveLength(14);
    for (const id of deal.tiles as number[]) {
      expect(view.hand.map((t) => t.id)).toContain(id);
    }
    // Other players expose counts and public state only — no tile lists.
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
      expect(p).not.toHaveProperty("tiles");
      expect(typeof p.handCount).toBe("number");
    }
    expect(view.players[0]!.handCount).toBe(13);
    // The wall is a count, never contents; one dora indicator is public.
    expect(typeof view.wallRemaining).toBe("number");
    expect(view.doraIndicators).toHaveLength(1);
    expect(view).not.toHaveProperty("wall");
    expect(view).not.toHaveProperty("liveWall");
    expect(view).not.toHaveProperty("deadWall");
  });
});

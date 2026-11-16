/**
 * A3 completion (brief §13): the full soak with the real AI.
 *
 * Four AI seats drive complete games through the real state machine.
 * The engine throws on any illegal action, so a finished game is proof
 * of legality; on top of that we assert exact score accounting (final
 * scores sum to 100,000 — leftover riichi sticks go to first place),
 * zero-sum settlement, and per-hand wall accounting on a sample.
 *
 * The count is parameterised so CI can split the brief's 10,000 games
 * across a matrix of shards while the fast gate runs a smaller count:
 *
 *   AI_SOAK_GAMES       games in this run        (default 120)
 *   AI_SOAK_SEED_OFFSET first seed of this run   (default 0)
 *
 * The dedicated `soak` CI job runs 8 shards × 1,250 games = 10,000.
 */

import { describe, expect, it } from "vitest";
import { Game, type Policy } from "@openmahjong/engine";
import { createAiPolicy } from "../src/index.js";

const SOAK_GAMES = Number(process.env.AI_SOAK_GAMES ?? 120);
const SEED_OFFSET = Number(process.env.AI_SOAK_SEED_OFFSET ?? 0);
// Small chunks: one test is one synchronous CPU stretch, and a stretch
// past ~60 s starves the vitest worker's progress RPC (observed on a
// throttled VM: all tests pass, then an "onTaskUpdate" timeout error
// fails the run). Five games ≈ seconds, even on slow hardware.
const CHUNK = 5;

describe("A3 soak: AI vs AI", () => {
  it.each(
    Array.from({ length: Math.ceil(SOAK_GAMES / CHUNK) }, (_, i) => i * CHUNK),
  )(
    `games %i.. (chunk of ${CHUNK}): legal, terminating, scores sum to 100,000`,
    (chunkStart) => {
      const ai = createAiPolicy();
      const end = Math.min(chunkStart + CHUNK, SOAK_GAMES);
      for (let i = chunkStart; i < end; i++) {
        const seed = SEED_OFFSET + i;
        const result = new Game({
          seed: `ai-soak-${seed}`,
          length: "east",
          policies: ai,
        }).run();
        expect(result.scores.reduce((a, b) => a + b, 0)).toBe(100000);
        expect(result.settlement.reduce((a, s) => a + s.points, 0)).toBeCloseTo(0, 6);
        // An east game normally runs ≥4 hands, but tobi (a player
        // busted below zero) ends it early — with real AI scoring that
        // happens, so the floor is a completed game, not a hand count.
        expect(result.handsPlayed).toBeGreaterThanOrEqual(1);
        expect(result.events.at(-1)?.type).toBe("game-end");
      }
    },
    900_000,
  );

  it("wall accounting holds on a sample of games", () => {
    const ai = createAiPolicy();
    for (let seed = 0; seed < 5; seed++) {
      const result = new Game({
        seed: `ai-soak-wall-${seed}`,
        length: "east",
        policies: ai,
      }).run();
      let hands = 0;
      let liveDraws = 0;
      let deals = 0;
      let pendingDrawn: string | null = null;
      const checkHand = () => {
        expect(deals).toBe(4);
        expect(liveDraws).toBeLessThanOrEqual(70);
        if (pendingDrawn === "exhaustive") expect(liveDraws).toBe(70);
      };
      for (const e of result.events) {
        if (e.type === "hand-start") {
          if (hands > 0) checkHand();
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
      checkHand();
      expect(hands).toBe(result.handsPlayed);
    }
  }, 300_000);

  it("is deterministic: same seed, identical event log", () => {
    const a = new Game({
      seed: "ai-determinism",
      length: "south",
      policies: createAiPolicy(),
    }).run();
    const b = new Game({
      seed: "ai-determinism",
      length: "south",
      policies: createAiPolicy(),
    }).run();
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(b.scores).toEqual(a.scores);
  }, 300_000);
});

/** The engine soak's tsumogiri policy, as a sparring partner. */
const tsumogiriPolicy: Policy = {
  turn(view, ctx) {
    if (ctx.canTsumo) return { type: "tsumo" };
    if (ctx.canKyuushu) return { type: "kyuushu" };
    const tile = ctx.drawnTile ?? view.hand[0]!;
    if (ctx.drawnTile && ctx.riichiDiscardIds.includes(ctx.drawnTile.id)) {
      return { type: "discard", tileId: ctx.drawnTile.id, riichi: true };
    }
    return { type: "discard", tileId: tile.id };
  },
  call(_view, ctx) {
    if (ctx.canRon) return { type: "ron" };
    return { type: "pass" };
  },
};

describe("strength sanity", () => {
  // Chunked like the soak (see CHUNK above): totals accumulate across
  // the chunk tests, and the verdict test runs last in the file.
  const GAMES = 60;
  const MATCH_CHUNK = 10;
  let aiPoints = 0;
  let baselinePoints = 0;

  it.each(
    Array.from({ length: GAMES / MATCH_CHUNK }, (_, i) => i * MATCH_CHUNK),
  )(
    "match games %i..: accumulate settlement points",
    (start) => {
      const ai = createAiPolicy();
      const policies: Policy[] = [ai, tsumogiriPolicy, ai, tsumogiriPolicy];
      for (let g = start; g < start + MATCH_CHUNK; g++) {
        const result = new Game({
          seed: `ai-vs-tsumogiri-${g}`,
          length: "east",
          policies,
        }).run();
        for (const entry of result.settlement) {
          if (entry.seat % 2 === 0) aiPoints += entry.points;
          else baselinePoints += entry.points;
        }
      }
    },
    900_000,
  );

  it("AI seats outscore tsumogiri seats over the match", () => {
    console.log(
      `AI vs tsumogiri over ${GAMES} games: AI ${aiPoints.toFixed(1)} pts, ` +
        `baseline ${baselinePoints.toFixed(1)} pts (settlement points, zero-sum)`,
    );
    expect(aiPoints).toBeGreaterThan(baselinePoints);
  });
});

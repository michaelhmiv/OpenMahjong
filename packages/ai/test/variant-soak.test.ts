/**
 * Per-variant completion soak: the riichi A3 soak's treatment for the
 * Chinese-family engines (PR #42). The variant policy drives complete
 * games through the real VariantGame state machine; the engine throws
 * on any illegal action, so a finished game is proof of legality. On
 * top of that, every game asserts:
 *
 *   - termination: the game returns within a generous decision cap
 *     (an east game needs a few hundred decisions; the cap exists so a
 *     hang reports as a named variant + seed instead of a timeout);
 *   - the final event is `game-end` and at least one hand was played;
 *   - exact point conservation against the VARIANT's own total —
 *     4 × adapter.startingScore (hong-kong 4,000, mcr 0, taiwanese
 *     4,000; the riichi soak's hard-coded 100,000 does not transfer);
 *   - zero-sum settlement (settlement points are score − startingScore
 *     per seat, so this is conservation stated as payouts).
 *
 * A sample of games per run additionally gets the variant-legality
 * treatment: full tile inventory (every physical tile, unique ids),
 * structural hand shape, and point conservation at EVERY decision
 * point. That check rebuilds the 144-tile inventory per decision, so
 * it stays sampled at volume, exactly as the riichi soak samples its
 * wall accounting.
 *
 * The count is parameterised so CI can split 10,000 games per variant
 * across a matrix of shards while the fast gate runs a smaller count:
 *
 *   AI_VARIANT_SOAK_GAMES       games per variant in this run (default 4)
 *   AI_VARIANT_SOAK_SEED_OFFSET first seed of this run        (default 0)
 *   AI_VARIANT_SOAK_VARIANT     run only this variant         (optional)
 *
 * The dedicated `variant-soak` CI job runs, per variant: hong-kong
 * 8 shards × 1,250 games, taiwanese 8 × 1,250, mcr 50 × 200 — 10,000
 * games each. Shard sizes follow measured cost on the dev VM (east
 * games, wall clock): hong-kong ≈ 2 s/game, taiwanese ≈ 1.5 s/game,
 * mcr ≈ 23 s/game (the vendored MCR scorer is consulted on every win
 * check), riichi ≈ 3.3 s/game of CPU. Against the riichi shard
 * envelope (1,250 games), a hong-kong/taiwanese shard of 1,250 games
 * is ≈ 0.5× the envelope and an mcr shard of 200 games is ≈ 1.1× —
 * equal counts are not equal cost, so the shard counts differ.
 */

import { describe, expect, it } from "vitest";
import {
  VariantGame,
  assertVariantAction,
  type Tile,
  type VariantGameResult,
} from "@openmahjong/engine";
import { createVariantPolicy } from "../src/variant-policy.js";

const VARIANTS = ["hong-kong", "mcr", "taiwanese"] as const;
type VariantId = (typeof VARIANTS)[number];

const SOAK_GAMES = Number(process.env.AI_VARIANT_SOAK_GAMES ?? 4);
const SEED_OFFSET = Number(process.env.AI_VARIANT_SOAK_SEED_OFFSET ?? 0);
const ONLY = process.env.AI_VARIANT_SOAK_VARIANT as VariantId | undefined;
// First games of each run that get per-decision tile conservation.
const TILE_SAMPLE = 2;
// Decision cap per game: east games measured at ~300–450 decisions;
// 100,000 is two orders of magnitude past any real game, so hitting it
// means the game looped, and the failure names the variant and seed.
const MAX_STEPS = 100_000;
// Small chunks plus a yield between games, for the vitest worker RPC
// reason documented in soak.test.ts.
const CHUNK = 5;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function fail(variant: VariantId, seed: number, message: string): never {
  throw new Error(`variant soak ${variant} seed ${seed}: ${message}`);
}

function checkTiles(game: VariantGame, variant: VariantId, seed: number): void {
  const wall = game as unknown as { wall: Tile[]; head: number; tail: number };
  const all = [
    ...wall.wall.slice(wall.head, wall.tail + 1),
    ...game.players.flatMap((p) => [
      ...p.tiles,
      ...p.melds.flatMap((m) => m.tiles),
      ...p.flowers,
      ...p.discards.filter((d) => !d.called).map((d) => d.tile),
    ]),
  ];
  const inventory = game.adapter.inventory();
  if (all.length !== inventory.length)
    fail(
      variant,
      seed,
      `tile conservation: ${all.length} tiles in play, inventory has ${inventory.length}`,
    );
  if (new Set(all.map((t) => t.id)).size !== inventory.length)
    fail(variant, seed, "tile conservation: duplicate tile ids in play");
  const total = game.players.reduce((n, p) => n + p.score, 0);
  if (total !== 4 * game.adapter.startingScore)
    fail(
      variant,
      seed,
      `point conservation mid-game: scores sum to ${total}, expected ${4 * game.adapter.startingScore}`,
    );
}

function playSoakGame(
  variant: VariantId,
  seed: number,
  tileChecks: boolean,
): VariantGameResult {
  const policy = createVariantPolicy();
  const game = new VariantGame({
    variant,
    seed: `variant-soak-${variant}-${seed}`,
    length: "east",
  });
  const expectedTotal = 4 * game.adapter.startingScore;
  const it = game.play();
  let step = it.next();
  let steps = 0;
  while (!step.done) {
    if (++steps > MAX_STEPS)
      fail(
        variant,
        seed,
        `did not terminate within ${MAX_STEPS} decisions (hang, not a long game)`,
      );
    const req = step.value;
    if (tileChecks) {
      const seat = game.players[req.view.seat]!;
      const structural = seat.tiles.length + 3 * seat.melds.length;
      if (
        structural !==
        game.adapter.standingTiles + (req.kind === "turn" ? 1 : 0)
      )
        fail(
          variant,
          seed,
          `structural hand shape: seat ${req.view.seat} holds ${structural} tile-slots, expected ${
            game.adapter.standingTiles + (req.kind === "turn" ? 1 : 0)
          }`,
        );
      if (game.players.flatMap((p) => p.tiles).some((t) => t.type >= 34))
        fail(variant, seed, "a flower/bonus tile is sitting in a hand");
      checkTiles(game, variant, seed);
    }
    const action =
      req.kind === "turn"
        ? policy.turn(req.view, req.context)
        : policy.call(req.view, req.context);
    if (tileChecks) {
      try {
        assertVariantAction(req, action);
      } catch {
        fail(variant, seed, `policy produced an illegal ${req.kind} action`);
      }
    }
    step = it.next(action);
  }
  const result = step.value;
  if (result.events.at(-1)?.type !== "game-end")
    fail(variant, seed, "final event is not game-end");
  if (result.handsPlayed < 1)
    fail(variant, seed, `handsPlayed is ${result.handsPlayed}`);
  const scoreSum = result.scores.reduce((a, b) => a + b, 0);
  if (scoreSum !== expectedTotal)
    fail(
      variant,
      seed,
      `point conservation: final scores ${result.scores} sum to ${scoreSum}, expected ${expectedTotal} (4 × startingScore ${game.adapter.startingScore})`,
    );
  const settlementSum = result.settlement.reduce((a, s) => a + s.points, 0);
  if (settlementSum !== 0)
    fail(
      variant,
      seed,
      `settlement is not zero-sum: points sum to ${settlementSum}`,
    );
  return result;
}

for (const variant of VARIANTS) {
  const run = !ONLY || ONLY === variant ? describe : describe.skip;
  run(`variant soak: ${variant}`, () => {
    it.each(
      Array.from({ length: Math.ceil(SOAK_GAMES / CHUNK) }, (_, i) => i * CHUNK),
    )(
      `games %i.. (chunk of ${CHUNK}): terminating, conserved, zero-sum`,
      async (chunkStart) => {
        const end = Math.min(chunkStart + CHUNK, SOAK_GAMES);
        for (let i = chunkStart; i < end; i++) {
          playSoakGame(variant, SEED_OFFSET + i, i < TILE_SAMPLE);
          await tick();
        }
      },
      900_000,
    );

    it("is deterministic: same seed, identical event log", async () => {
      const runOnce = () => {
        const policy = createVariantPolicy();
        return new VariantGame({
          variant,
          seed: `variant-soak-${variant}-determinism`,
          length: "east",
          policies: [policy, policy, policy, policy],
        }).run();
      };
      const a = runOnce();
      await tick();
      const b = runOnce();
      expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
      expect(b.scores).toEqual(a.scores);
    }, 900_000);
  });
}

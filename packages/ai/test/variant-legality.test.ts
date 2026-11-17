import { describe, it, expect } from "vitest";
import {
  VariantGame,
  assertVariantAction,
  type Tile,
} from "@openmahjong/engine";
import { createVariantPolicy } from "../src/variant-policy.js";
for (const variant of ["hong-kong", "mcr", "taiwanese"] as const)
  describe(`${variant} independent legality/inventory soak`, () => {
    it("conserves every physical tile and all points at every legal seat request across eight seeded matches", () => {
      const policy = createVariantPolicy();
      let decisions = 0;
      for (let seed = 0; seed < 8; seed++) {
        const game = new VariantGame({
            variant,
            seed: `variant-inventory-${seed}`,
            length: "east",
          }),
          it = game.play();
        let step = it.next();
        while (!step.done) {
          const req = step.value,
            seat = game.players[req.view.seat]!,
            structural = seat.tiles.length + 3 * seat.melds.length;
          expect(structural).toBe(
            game.adapter.standingTiles + (req.kind === "turn" ? 1 : 0),
          );
          expect(
            game.players.flatMap((p) => p.tiles).some((t) => t.type >= 34),
          ).toBe(false);
          const wall = game as unknown as {
            wall: Tile[];
            head: number;
            tail: number;
          };
          const all = [
            ...wall.wall.slice(wall.head, wall.tail + 1),
            ...game.players.flatMap((p) => [
              ...p.tiles,
              ...p.melds.flatMap((m) => m.tiles),
              ...p.flowers,
              ...p.discards.filter((d) => !d.called).map((d) => d.tile),
            ]),
          ];
          expect(all).toHaveLength(144);
          expect(new Set(all.map((t) => t.id)).size).toBe(144);
          expect(game.players.reduce((n, p) => n + p.score, 0)).toBe(
            4 * game.adapter.startingScore,
          );
          const action =
            req.kind === "turn"
              ? policy.turn(req.view, req.context)
              : policy.call(req.view, req.context);
          expect(() => assertVariantAction(req, action)).not.toThrow();
          step = it.next(action);
          decisions++;
        }
        expect(step.value.scores.reduce((a, b) => a + b, 0)).toBe(
          4 * game.adapter.startingScore,
        );
      }
      expect(decisions).toBeGreaterThan(100);
    }, 120000);
  });

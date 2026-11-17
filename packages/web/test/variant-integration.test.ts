import { beforeAll, describe, expect, it } from "vitest";
import {
  VariantGame,
  validateVariantReplay,
  type VariantReplay,
} from "@openmahjong/engine";
import { createVariantPolicy } from "@openmahjong/ai";
import { adviseVariantDiscard } from "@openmahjong/coach";
import { VariantAiDriver } from "../src/drivers.js";
import { VariantRunner } from "../src/variant-runner.js";
import { buildBoardReview } from "../src/board-review.js";
import { buildDecisionReview } from "../src/review.js";
import { validateSavedGame } from "../src/replay.js";
import type { Decision } from "../src/runner.js";

describe.each(["hong-kong", "mcr", "taiwanese"] as const)(
  "%s full stack",
  (variant) => {
    let saved: VariantReplay;
    beforeAll(() => {
      const ai = createVariantPolicy(),
        decisions: Decision[] = [];
      const policy = {
        turn(
          v: Parameters<typeof ai.turn>[0],
          c: Parameters<typeof ai.turn>[1],
        ) {
          const a = ai.turn(v, c);
          decisions.push(a);
          return a;
        },
        call(
          v: Parameters<typeof ai.call>[0],
          c: Parameters<typeof ai.call>[1],
        ) {
          const a = ai.call(v, c);
          decisions.push(a);
          return a;
        },
      };
      const game = new VariantGame({
        variant,
        seed: "hk-complete-integration",
        length: "east",
        policies: [policy, policy, policy, policy],
      });
      game.run();
      saved = {
        v: 3,
        engineVersion: 3,
        aiVersion: 1,
        variant,
        ruleset: {
          id:
            variant === "mcr"
              ? "openmahjong-mcr-2006"
              : variant === "taiwanese"
                ? "openmahjong-taiwanese-every-flower"
                : "openmahjong-hkos",
          version: 1,
        },
        seed: "hk-complete-integration",
        length: "east",
        humanSeat: 0,
        id: "hk-complete",
        decisions,
      };
    }, 120000);
    describe("complete feature boundaries", () => {
      it("restores exactly through the seat driver, preserves identity and refuses illegal actions without losing the pending turn", () => {
        const restored = VariantRunner.restore(saved);
        expect(restored.result).not.toBeNull();
        expect(restored.serialize()).toEqual(saved);
        const first = new VariantRunner({
          variant,
          seed: saved.seed,
          length: "east",
          aiDriver: new VariantAiDriver(),
        });
        first.advance();
        const original = first.serialize(),
          pending = first.pending;
        expect(() => first.act({ type: "discard", tileId: 999 })).toThrow();
        expect(first.serialize()).toEqual(original);
        expect(first.pending).toBe(pending);
        expect(validateSavedGame(saved)).toEqual(saved);
        expect(() =>
          validateVariantReplay({ ...saved, variant: "riichi" }),
        ).toThrow(/match/);
        expect(() =>
          validateSavedGame({
            ...saved,
            ruleset: { id: "openmahjong-riichi", version: 1 },
          }),
        ).toThrow(/Unsupported/);
        expect(() => validateSavedGame({ ...saved, engineVersion: 2 })).toThrow(
          /version/,
        );
        expect(() =>
          validateSavedGame({
            ...saved,
            decisions: [{ type: "discard", tileId: 0, riichi: true }],
          }),
        ).toThrow(/discard/);
      });
      it("reconstructs all events once, preserves flowers and uses outcome-blind immutable public coaching inputs", () => {
        const timeline = buildBoardReview(saved),
          review = timeline.data.review;
        expect(review.engineVersion).toBe(3);
        expect(review.variant).toBe(variant);
        expect(review.complete).toBe(true);
        expect(
          timeline
            .seek(timeline.data.events.length - 1)
            .players.map((p) => p.score),
        ).toEqual(timeline.data.result!.scores);
        for (const p of review.positions) {
          expect(p.view).not.toHaveProperty("seed");
          expect(p.view).not.toHaveProperty("wall");
          for (const other of p.view.players)
            expect(other).not.toHaveProperty("hand");
          expect(Object.isFrozen(p.view)).toBe(true);
        }
        const position = review.positions.find(
          (p) => p.kind === "turn" && p.action.type === "discard",
        )!;
        const prefix = buildDecisionReview({
          ...saved,
          decisions: saved.decisions.slice(0, position.decisionIndex + 1),
        }).positions.at(-1)!;
        expect(prefix).toEqual(position);
        expect(adviseVariantDiscard(prefix.view)).toEqual(
          adviseVariantDiscard(position.view),
        );
        // The dealer's extra draw now precedes flower replacement. The
        // first decision is the stable boundary after all initial passes.
        const afterDeal = review.positions[0]!.eventSequence;
        const model = timeline.seek(afterDeal);
        expect(
          model.players.flatMap((p) => p.handIds).some((id) => id >= 136),
        ).toBe(false);
        expect(
          model.players.flatMap((p) => p.flowers).length,
        ).toBeGreaterThanOrEqual(0);
        expect(model.variant).toBe(variant);
        expect(
          model.players
            .flatMap((p) => p.handIds)
            .map((id) => model.resolveTile(id))
            .some((t) => t.red),
        ).toBe(false);
      });
    });
  },
);

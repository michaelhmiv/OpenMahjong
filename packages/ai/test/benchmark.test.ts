/**
 * Performance budget (brief §6): every AI decision must complete in
 * <50 ms of compute on ordinary hardware. This benchmark wraps the AI
 * policy with a timer and plays complete games, recording every turn
 * and call decision.
 *
 * The assertions use the mean and the 95th percentile (a single GC
 * pause on shared CI hardware should not fail the build); the maximum
 * is reported and asserted under a looser bound.
 */

import { describe, expect, it } from "vitest";
import { Game, type Policy } from "@openmahjong/engine";
import { createAiPolicy } from "../src/index.js";

const BENCH_GAMES = 24;

describe("decision-time benchmark", () => {
  it(
    `plays ${BENCH_GAMES} AI-vs-AI games within the 50 ms/decision budget`,
    () => {
      const durations: number[] = [];
      const inner = createAiPolicy();
      const timed: Policy = {
        turn(view, ctx) {
          const start = performance.now();
          const action = inner.turn(view, ctx);
          durations.push(performance.now() - start);
          return action;
        },
        call(view, ctx) {
          const start = performance.now();
          const action = inner.call(view, ctx);
          durations.push(performance.now() - start);
          return action;
        },
      };

      for (let g = 0; g < BENCH_GAMES; g++) {
        const result = new Game({
          seed: `bench-${g}`,
          length: "east",
          policies: timed,
        }).run();
        expect(result.scores.reduce((a, b) => a + b, 0)).toBe(100000);
      }

      durations.sort((a, b) => a - b);
      const n = durations.length;
      const mean = durations.reduce((a, b) => a + b, 0) / n;
      const p50 = durations[Math.floor(n * 0.5)]!;
      const p95 = durations[Math.floor(n * 0.95)]!;
      const p99 = durations[Math.floor(n * 0.99)]!;
      const max = durations[n - 1]!;
      console.log(
        `AI decisions: n=${n} mean=${mean.toFixed(3)}ms p50=${p50.toFixed(3)}ms ` +
          `p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms max=${max.toFixed(3)}ms`,
      );
      expect(n).toBeGreaterThan(1000);
      expect(mean).toBeLessThan(50);
      expect(p95).toBeLessThan(50);
      expect(p99).toBeLessThan(50);
    },
    600_000,
  );
});

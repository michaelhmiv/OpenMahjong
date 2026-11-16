/**
 * Driver seam tests: the HumanDriver always defers to the UI, and the
 * TEMPORARY AI driver plays complete, legal games through the real
 * engine (the engine throws on any illegal action, so finishing a game
 * is the legality proof). Determinism: same seed, same log.
 */

import { describe, expect, it } from "vitest";
import {
  Game,
  type CallContext,
  type PlayerView,
  type Policy,
  type TurnContext,
} from "@openmahjong/engine";
import { HumanDriver, PENDING, TempAiDriver } from "../src/drivers.js";

function asPolicy(driver: TempAiDriver): Policy {
  return {
    turn: (view, ctx) => {
      const a = driver.turn(view, ctx);
      if (a === PENDING) throw new Error("TempAiDriver must never pend");
      return a;
    },
    call: (view, ctx) => {
      const a = driver.call(view, ctx);
      if (a === PENDING) throw new Error("TempAiDriver must never pend");
      return a;
    },
  };
}

describe("HumanDriver", () => {
  it("always returns PENDING", () => {
    const d = new HumanDriver();
    expect(d.turn(undefined as unknown as PlayerView, undefined as unknown as TurnContext)).toBe(PENDING);
    expect(d.call(undefined as unknown as PlayerView, undefined as unknown as CallContext)).toBe(PENDING);
  });
});

describe("TempAiDriver (temporary AI seat)", () => {
  it("plays complete legal games; final scores sum to 100,000", () => {
    for (const seed of ["driver-1", "driver-2", "driver-3"]) {
      const game = new Game({ seed, length: "east", policies: asPolicy(new TempAiDriver()) });
      const result = game.run();
      expect(result.handsPlayed).toBeGreaterThanOrEqual(4);
      expect(result.scores.reduce((a, b) => a + b, 0)).toBe(100000);
      expect(result.events.at(-1)?.type).toBe("game-end");
    }
  }, 600000);

  it("declares riichi and wins hands across a few seeds", () => {
    let riichi = 0;
    let wins = 0;
    for (const seed of ["driver-r1", "driver-r2", "driver-r3", "driver-r4"]) {
      const game = new Game({ seed, length: "east", policies: asPolicy(new TempAiDriver()) });
      const result = game.run();
      riichi += result.events.filter((e) => e.type === "riichi").length;
      wins += result.events.filter((e) => e.type === "win").length;
    }
    expect(riichi).toBeGreaterThan(0);
    expect(wins).toBeGreaterThan(0);
  }, 600000);

  it("is deterministic: same seed replays to the identical log", () => {
    const run = () =>
      new Game({ seed: "driver-det", length: "east", policies: asPolicy(new TempAiDriver()) }).run();
    const a = run();
    const b = run();
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(b.scores).toEqual(a.scores);
  }, 600000);
});

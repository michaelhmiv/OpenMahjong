/**
 * Runner tests: suspension at the human's decision points, the
 * serialize -> restore round trip (brief §11 / A8 — a refreshed game
 * resumes at the identical state, event for event), and log integrity.
 */

import { describe, expect, it } from "vitest";
import type { CallAction, TurnAction } from "@openmahjong/engine";
import { TempAiDriver } from "../src/drivers.js";
import { GameRunner, type SavedGame } from "../src/runner.js";

function drivePending(runner: GameRunner, ai: TempAiDriver): void {
  const p = runner.pending;
  if (!p) throw new Error("expected a pending decision");
  if (p.kind === "turn") runner.act(ai.turn(p.view, p.ctx) as TurnAction);
  else runner.act(ai.call(p.view, p.ctx) as CallAction);
}

describe("GameRunner", () => {
  it("suspends at the human's first decision (human deals the first hand)", () => {
    const runner = new GameRunner({ seed: "runner-1", length: "east", humanSeat: 0, aiDriver: new TempAiDriver() });
    runner.advance();
    expect(runner.result).toBeNull();
    expect(runner.pending).not.toBeNull();
    expect(runner.pending!.kind).toBe("turn");
    expect(runner.pending!.seat).toBe(0);
    // The deal happened before the suspension.
    expect(runner.events.filter((e) => e.type === "deal").length).toBe(4);
    expect(runner.events.some((e) => e.type === "hand-start")).toBe(true);
  }, 60000);

  it("rejects acting with no pending decision and with the wrong action kind", () => {
    const runner = new GameRunner({ seed: "runner-2", length: "east", humanSeat: 0, aiDriver: new TempAiDriver() });
    expect(() => runner.act({ type: "pass" })).toThrow();
    runner.advance();
    expect(() => runner.act({ type: "pass" })).toThrow();
  }, 60000);

  it("resume round-trip: serialize -> restore reproduces the identical state", () => {
    const ai = new TempAiDriver();
    const runner = new GameRunner({ seed: "runner-resume", length: "east", humanSeat: 0, aiDriver: ai });
    runner.advance();
    // Play a stretch of the game (through at least one full hand boundary
    // or 25 human decisions, whichever comes first).
    let acts = 0;
    while (!runner.result && acts < 25) {
      drivePending(runner, ai);
      acts++;
    }
    const saved: SavedGame = JSON.parse(JSON.stringify(runner.serialize())) as SavedGame;
    const eventsJson = JSON.stringify(runner.events);
    const pendingKind = runner.pending?.kind;
    const pendingSeat = runner.pending?.seat;
    const decisionCount = runner.decisions.length;

    const restored = GameRunner.restore(saved, new TempAiDriver());
    expect(JSON.stringify(restored.events)).toBe(eventsJson);
    expect(restored.pending?.kind).toBe(pendingKind);
    expect(restored.pending?.seat).toBe(pendingSeat);
    expect(restored.decisions.length).toBe(decisionCount);
    expect(restored.result).toBeNull();
  }, 300000);

  it("a restored game finishes with the same scores as the uninterrupted game", () => {
    const seed = "runner-finish";
    const playToEnd = (runner: GameRunner, ai: TempAiDriver): readonly number[] => {
      let guard = 0;
      while (!runner.result && guard++ < 3000) drivePending(runner, ai);
      if (!runner.result) throw new Error("game did not finish");
      return runner.result.scores;
    };

    const direct = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: new TempAiDriver() });
    direct.advance();
    const directScores = playToEnd(direct, new TempAiDriver());

    const partial = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: new TempAiDriver() });
    partial.advance();
    const ai2 = new TempAiDriver();
    for (let i = 0; i < 10 && !partial.result; i++) drivePending(partial, ai2);
    const saved: SavedGame = JSON.parse(JSON.stringify(partial.serialize())) as SavedGame;
    const restored = GameRunner.restore(saved, new TempAiDriver());
    const restoredScores = playToEnd(restored, new TempAiDriver());

    expect([...restoredScores]).toEqual([...directScores]);
    expect(restoredScores.reduce((a, b) => a + b, 0)).toBe(100000);
  }, 600000);

  it("detects a tampered decision log instead of silently desyncing", () => {
    const ai = new TempAiDriver();
    const runner = new GameRunner({ seed: "runner-tamper", length: "east", humanSeat: 0, aiDriver: ai });
    runner.advance();
    drivePending(runner, ai);
    const saved = JSON.parse(JSON.stringify(runner.serialize())) as SavedGame;
    // Flip a recorded turn action into a call action: replay must refuse.
    const idx = saved.decisions.findIndex((d) => d.type === "discard");
    expect(idx).toBeGreaterThanOrEqual(0);
    (saved.decisions as unknown[])[idx] = { type: "pass" };
    expect(() => GameRunner.restore(saved, new TempAiDriver())).toThrow(/desync/);
  }, 300000);
});

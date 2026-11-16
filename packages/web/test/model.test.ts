/**
 * View-model mapping tests (brief §9/§13): the table model is a pure fold
 * of the engine event log. Games are produced by the real engine with the
 * temporary AI driver on every seat, then folded and checked for tile
 * accounting, score fidelity, win reconstruction, chi disambiguation, and
 * the uradora reconstruction used by the hand-end breakdown.
 */

import { describe, expect, it } from "vitest";
import { Game, type GameEvent, type Policy } from "@openmahjong/engine";
import { PENDING, TempAiDriver } from "../src/drivers.js";
import { foldEvents, TableModel } from "../src/model.js";
import { GameRunner } from "../src/runner.js";

function asPolicy(driver: TempAiDriver): Policy {
  return {
    turn: (view, ctx) => {
      const a = driver.turn(view, ctx);
      if (a === PENDING) throw new Error("pend");
      return a;
    },
    call: (view, ctx) => {
      const a = driver.call(view, ctx);
      if (a === PENDING) throw new Error("pend");
      return a;
    },
  };
}

function playGame(seed: string): { events: readonly GameEvent[]; scores: readonly number[] } {
  const result = new Game({
    seed,
    length: "east",
    policies: asPolicy(new TempAiDriver()),
  }).run();
  return { events: result.events, scores: result.scores };
}

describe("TableModel fold", () => {
  it("accounts for all 136 tiles right after the deal", () => {
    const { events } = playGame("model-deal");
    // Fold up to (not including) the first draw after the deal.
    const firstDraw = events.findIndex((e, i) => e.type === "draw" && i > 5);
    const model = foldEvents(events.slice(0, firstDraw));
    let accounted = model.wallRemaining + 14; // live wall + dead wall
    for (const p of model.players) {
      accounted += p.handIds.length;
      accounted += p.melds.reduce((n, m) => n + m.tiles.length, 0);
      accounted += p.pond.length;
    }
    expect(accounted).toBe(136);
    expect(model.wallRemaining).toBe(70);
    for (const p of model.players) expect(p.handIds.length).toBe(13);
    expect(model.doraIndicators.length).toBe(1);
  }, 60000);

  it("ends with the engine's exact scores and a settlement", () => {
    const { events, scores } = playGame("model-final");
    const model = foldEvents(events);
    expect(model.players.map((p) => p.score)).toEqual([...scores]);
    expect(model.finalScores).toEqual([...scores]);
    expect(model.settlement).not.toBeNull();
    expect(model.settlement!.reduce((s, e) => s + e.points, 0)).toBeCloseTo(0, 6);
    expect(model.handInProgress).toBe(false);
  }, 60000);

  it("reconstructs a win: hand, yaku, payments all present and consistent", () => {
    // Fold incrementally; at the first hand-end preceded by a win, the
    // breakdown data must be complete.
    let found = false;
    for (const seed of ["model-win-1", "model-win-2", "model-win-3"]) {
      const { events } = playGame(seed);
      const model = new TableModel(0);
      for (const ev of events) {
        model.apply(ev);
        if (ev.type === "hand-end" && model.lastWin) {
          const win = model.lastWin;
          expect(win.yaku.length).toBeGreaterThan(0);
          expect(win.han).toBeGreaterThan(0);
          expect(win.payments.length).toBeGreaterThan(0);
          const handTiles = win.handTiles.length + win.winnerMelds.reduce((n, m) => n + m.tiles.length, 0);
          expect(handTiles).toBe(13);
          const paidOut = win.payments.reduce((s, p) => s + p.amount, 0);
          expect(paidOut).toBeGreaterThan(0);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  }, 120000);

  it("resolves chi melds into real sequences, with and without hints", () => {
    // Find a game (through the runner, which produces chi hints) that
    // contains a chi call, then check the meld is a true sequence.
    let checked = false;
    for (const seed of ["model-chi-1", "model-chi-2", "model-chi-3", "model-chi-4", "model-chi-5"]) {
      const ai = new TempAiDriver();
      const runner = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: ai });
      runner.advance();
      let guard = 0;
      while (!runner.result && guard++ < 400) {
        const p = runner.pending!;
        if (p.kind === "turn") runner.act(ai.turn(p.view, p.ctx) as never);
        else runner.act(ai.call(p.view, p.ctx) as never);
      }
      const chiSeq = runner.events.findIndex((e) => e.type === "call" && e["kind"] === "chi");
      if (chiSeq < 0) continue;
      const model = foldEvents(runner.events.slice(0, chiSeq + 1), 0, runner.chiHints);
      const meld = model.players.flatMap((p) => p.melds).find((m) => m.kind === "chi");
      expect(meld).toBeDefined();
      const types = meld!.tiles.map((t) => t.type).sort((a, b) => a - b);
      expect(types[1]! - types[0]!).toBe(1);
      expect(types[2]! - types[1]!).toBe(1);
      // The hint-less fold must not throw either (deterministic fallback).
      expect(() => foldEvents(runner.events.slice(0, chiSeq + 1))).not.toThrow();
      checked = true;
      break;
    }
    expect(checked).toBe(true);
  }, 300000);

  it("reconstructs uradora indicators for a riichi win, verifiably", () => {
    let checked = false;
    for (const seed of ["model-ura-1", "model-ura-2", "model-ura-3", "model-ura-4", "model-ura-5", "model-ura-6"]) {
      const { events } = playGame(seed);
      const model = new TableModel(0);
      for (const ev of events) {
        model.apply(ev);
        if (ev.type === "hand-end" && model.lastWin && model.players[model.lastWin.seat]?.riichi) {
          const ura = model.uraIndicators();
          expect(ura).not.toBeNull();
          expect(ura!.length).toBe(model.doraIndicators.length);
          checked = true;
          break;
        }
      }
      if (checked) break;
    }
    expect(checked).toBe(true);
  }, 180000);
});

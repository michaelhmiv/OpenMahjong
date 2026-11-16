import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AiDriver } from "../src/drivers.js";
import { GameRunner } from "../src/runner.js";
import { MAX_REPLAY_DECISIONS, parseSavedGame, validateSavedGame } from "../src/replay.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/legacy-v1.json", import.meta.url), "utf8"));

describe("versioned replay integrity", () => {
  it("preserves an independently captured v1 complete game with three kans byte for byte", () => {
    const restored = GameRunner.restore(fixture.saved, new AiDriver());
    expect(restored.result?.scores).toEqual(fixture.scores);
    expect(restored.events).toHaveLength(fixture.eventCount);
    expect(restored.events.filter((e) => e.type === "kan")).toHaveLength(3);
    expect(createHash("sha256").update(JSON.stringify(restored.events)).digest("hex")).toBe(fixture.eventSha256);
    expect(restored.serialize().v).toBe(1);
  });
  it("pins new games to the current engine, rules, and policy and restores the same pending position", () => {
    const runner = new GameRunner({ seed: "current-replay", length: "east", aiDriver: new AiDriver() });
    runner.advance();
    const saved = runner.serialize();
    expect(saved).toMatchObject({ v: 2, engineVersion: 2, aiVersion: 2, ruleset: { id: "openmahjong-riichi", version: 1 } });
    const restored = GameRunner.restore(JSON.parse(JSON.stringify(saved)), new AiDriver());
    expect(restored.events).toEqual(runner.events);
    expect(restored.pending).toEqual(runner.pending);
    for (const invalid of [{ ...saved, engineVersion: 999 }, { ...saved, aiVersion: 999 }, { ...saved, ruleset: { id: "wrc", version: 1 } }]) {
      expect(() => GameRunner.restore(invalid, new AiDriver())).toThrow(/Unsupported replay/);
    }
  });
  it("rejects malformed and oversized actions before executing a game", () => {
    const base = { v: 1, seed: "safe", length: "east", humanSeat: 0, decisions: [] };
    for (const invalid of [null, [], { ...base, humanSeat: 4 }, { ...base, length: "other" }, { ...base, seed: "s".repeat(257) },
      { ...base, decisions: [{ type: "discard", tileId: -1 }] },
      { ...base, decisions: [{ type: "chi", tileIds: [5, 5] }] },
      { ...base, decisions: [{ type: "discard", tileId: 1, riichi: "yes" }] },
      { ...base, decisions: new Array(MAX_REPLAY_DECISIONS + 1).fill({ type: "pass" }) }]) {
      expect(parseSavedGame(invalid)).toBeNull();
    }
  });
  it("rejects a trailing action after game end rather than ignoring it", () => {
    expect(() => GameRunner.restore({ ...fixture.saved, decisions: [...fixture.saved.decisions, { type: "pass" }] }, new AiDriver())).toThrow(/unused decisions/);
  });
  it("rolls an illegal action back so the pending position stays playable", () => {
    const ai = new AiDriver();
    const runner = new GameRunner({ seed: "transactional-answer", length: "east", aiDriver: ai });
    runner.advance();
    const before = runner.serialize();
    const events = runner.events;
    const pending = runner.pending;
    expect(pending?.kind).toBe("turn");
    if (pending?.kind !== "turn") throw new Error("Expected draw");
    const absentId = Array.from({ length: 136 }, (_, i) => i).find((id) => !pending.view.hand.some((t) => t.id === id))!;
    expect(() => runner.act({ type: "discard", tileId: absentId })).toThrow();
    expect(runner.serialize()).toEqual(before);
    expect(runner.pending).toBe(pending);
    expect(runner.events).toBe(events);
    runner.act(ai.turn(pending.view, pending.ctx));
    expect(runner.decisions.length).toBeGreaterThan(before.decisions.length);
  });
  it("canonicalizes imported actions without retaining arbitrary nested payloads", () => {
    const parsed = validateSavedGame({ v: 1, seed: "s", length: "east", humanSeat: 0, decisions: [{ type: "pass", hidden: { wall: [1, 2, 3] } }] });
    expect(parsed.decisions).toEqual([{ type: "pass" }]);
  });
});

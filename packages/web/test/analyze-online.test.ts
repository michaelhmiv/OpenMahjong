import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAnalyze } from "../src/analyze.js";
import { validateSavedGame } from "../src/replay.js";

/** Analyze for online games (issue #106): the fixture is a complete
 *  online riichi East match played through the server's TableEngine
 *  (all four seats bot-played), with the record built by the same
 *  mapping OnlineTables.analyzeRecord serves — committed walls plus
 *  the full decision log. The seeded solo path cannot reproduce it:
 *  online walls are committed shuffles, not seed-derived. */
const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/om-online-1.json", "utf8"),
) as { record: Record<string, unknown>; expected: { finals: number[]; decisions: number; hands: number } };

describe("Analyze — online record (committed walls + decision log)", () => {
  it("validates as a SavedGame and keeps its walls", () => {
    const saved = validateSavedGame(fixture.record);
    if (saved.v !== 2) throw new Error("expected a v2 record");
    expect(saved.walls).toEqual(fixture.record["walls"]);
    expect(saved.humanSeat).toBe(0);
    expect(saved.length).toBe("east");
  });

  it("grades the online game and reproduces its finals", () => {
    const built = buildAnalyze(fixture.record);
    if (!built.available) throw new Error(`online record not analyzable: ${built.reason}`);
    expect(built.totalDecisions).toBe(fixture.expected.decisions);
    expect(built.totalGrades).toBeGreaterThan(0);
    expect(built.overall.accuracy).not.toBeNull();
    expect([...built.finals]).toEqual(fixture.expected.finals);
    expect(built.hands).toHaveLength(fixture.expected.hands);
  });

  it("the walls carry the deal — without them the record does not reproduce the game", () => {
    const { walls: _walls, ...stripped } = fixture.record;
    let outcome: string;
    try {
      const built = buildAnalyze(stripped);
      outcome = built.available ? "available" : built.reason;
    } catch {
      outcome = "threw";
    }
    expect(outcome).not.toBe("available");
  });

  it("rejects malformed walls", () => {
    const walls = fixture.record["walls"] as number[][];
    const duplicated = walls.map((w, i) => (i === 0 ? w.map((id, j) => (j === 1 ? w[0]! : id)) : w));
    expect(() => validateSavedGame({ ...fixture.record, walls: duplicated })).toThrow();
    const short = walls.map((w, i) => (i === 0 ? w.slice(0, 135) : w));
    expect(() => validateSavedGame({ ...fixture.record, walls: short })).toThrow();
    expect(() => validateSavedGame({ ...fixture.record, walls: [] })).toThrow();
  });
});

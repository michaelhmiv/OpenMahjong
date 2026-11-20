import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VariantGame } from "@openmahjong/engine";
import { buildAnalyze, type AnalyzeData } from "../src/analyze.js";

const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/om-analyze-1.json", "utf8"),
) as { saved: unknown; expected: any };

function analyzeStaged(): AnalyzeData {
  const result = buildAnalyze(fixture.saved);
  if (!result.available) throw new Error(`staged game not analyzable: ${result.reason}`);
  return result;
}

describe("Analyze — staged game om-analyze-1 (design acceptance numbers)", () => {
  const data = analyzeStaged();

  it("reproduces the staged finals and settlement", () => {
    expect([...data.finals]).toEqual([7400, 41000, 16400, 35200]);
    expect(data.settlement.map((s) => ({ seat: s.seat, score: s.score, rank: s.rank, points: s.points })))
      .toEqual(fixture.expected.settlement);
    expect(data.hands).toHaveLength(8);
    expect(data.timeline.data.events).toHaveLength(1013);
  });

  it("reproduces per-seat accuracy: 99.5% overall, 3 misses, 0 blunders", () => {
    expect(data.totalDecisions).toBe(576);
    expect(data.totalGrades).toBe(588);
    expect(data.overall).toEqual({ graded: 588, correct: 585, misses: 3, blunders: 0, accuracy: 99.5 });
    for (const seat of data.seats) {
      const exp = fixture.expected.perPlayer[seat.seat];
      expect(seat.decisions).toBe(exp.decisions);
      expect(seat.graded).toBe(exp.gradedDecisions);
      expect(seat.accuracy).toBe(exp.accuracy);
      expect(seat.correct).toBe(exp.best);
      expect(seat.misses).toBe(exp.misses);
      expect(seat.blunders).toBe(exp.blunders);
      expect(seat.avgShantenAfter).toBe(exp.avgShantenAfter);
      expect(seat.avgImprovingTotal).toBe(exp.avgImprovingTotal);
    }
  });

  it("reproduces the by-kind tallies behind the per-player detail", () => {
    const tally = (seat: number, kind: string) => {
      const t = (data.seats[seat]!.byKind as any)[kind];
      return { total: t.total, correct: t.correct };
    };
    expect([0, 1, 2, 3].map((s) => tally(s, "discard"))).toEqual([
      { total: 115, correct: 115 }, { total: 115, correct: 115 },
      { total: 114, correct: 114 }, { total: 114, correct: 114 },
    ]);
    expect([0, 1, 2, 3].map((s) => tally(s, "call").total)).toEqual([18, 32, 34, 33]);
    expect([0, 1, 2, 3].map((s) => tally(s, "kan").total)).toEqual([0, 1, 0, 0]);
    expect([0, 1, 2, 3].map((s) => tally(s, "riichi"))).toEqual([
      { total: 5, correct: 5 }, { total: 2, correct: 1 },
      { total: 4, correct: 2 }, { total: 1, correct: 1 },
    ]);
    expect([0, 1, 2, 3].map((s) => tally(s, "win").total)).toEqual([0, 0, 0, 0]);
    expect(data.winGrades).toBe(0);
    expect(data.tsumoOffered).toBe(0);
  });

  it("reproduces the hand stats for every seat", () => {
    for (const seat of data.seats) {
      expect(seat.handStats).toEqual(fixture.expected.handStats[seat.seat]);
    }
  });

  it("finds exactly the 3 staged misses — all riichi, seats 2, 2, 1", () => {
    expect(data.missesList).toHaveLength(3);
    expect(data.missesList.map((m) => m.decision.position.decisionIndex)).toEqual([419, 423, 483]);
    expect(data.missesList.map((m) => m.decision.position.view.seat)).toEqual([2, 2, 1]);
    for (const miss of data.missesList) {
      expect(miss.grade.kind).toBe("riichi");
      expect(miss.grade.grade).toBe("miss");
    }
    const first = data.missesList[0]!.grade;
    if (first.kind !== "riichi") throw new Error("first miss is not a riichi grade");
    expect(first.declared).toBe(false);
    expect(first.verdict).toBe("declare");
    expect(first.damaRon).toBe(1300);
    expect(first.riichiRon).toBe(2300);
    expect(first.liveTotal).toBe(6);
    expect(first.waits.map((w) => ({ type: w.type, live: w.live }))).toEqual([
      { type: 22, live: 3 }, { type: 25, live: 3 },
    ]);
    const third = data.missesList[2]!.grade;
    if (third.kind !== "riichi") throw new Error("third miss is not a riichi grade");
    expect(third.declared).toBe(true);
    expect(third.verdict).toBe("dama");
    expect(third.damaRon).toBe(8000);
    expect(third.riichiRon).toBe(8000);
  });

  it("grades the P2 decision (index 419) as best discard + riichi miss", () => {
    const decision = data.decisions[419]!;
    expect(decision.position.view.seat).toBe(2);
    expect(decision.position.handIndex).toBe(4);
    expect(decision.position.eventSequence).toBe(723);
    expect(decision.grades.map((g) => [g.kind, g.grade])).toEqual([
      ["discard", "best"], ["riichi", "miss"],
    ]);
    const discard = decision.grades[0]!;
    if (discard.kind !== "discard") throw new Error("expected a discard grade");
    expect(discard.tileType).toBe(26); // 9 of bamboo played
    expect(discard.bestTileType).toBe(26);
    expect(discard.shantenAfter).toBe(0);
  });

  it("computes the score spine, biggest swing, and key moments", () => {
    expect(data.trajectory).toHaveLength(9);
    expect([...data.trajectory[0]!]).toEqual([25000, 25000, 25000, 25000]);
    expect([...data.trajectory[8]!]).toEqual([7400, 41000, 16400, 35200]);
    expect(data.swings[0]).toMatchObject({ handIndex: 6, seat: 0, delta: -13000 });
    expect(data.swings[1]).toMatchObject({ handIndex: 2, seat: 3, delta: 9600 });
    expect(data.swings[2]).toMatchObject({ handIndex: 5, seat: 3, delta: 4600 });
    const kinds = data.moments.map((m) => m.kind);
    expect(kinds.filter((k) => k === "win")).toHaveLength(4);
    expect(kinds.filter((k) => k === "riichi")).toHaveLength(6);
    expect(kinds.filter((k) => k === "kan")).toHaveLength(1);
    const win = data.moments.find((m) => m.kind === "win" && m.handIndex === 6)!;
    expect(win).toMatchObject({ seat: 1, fromSeat: 0, points: 14000, han: 7, fu: 70 });
    expect(data.winsTotal).toBe(4);
    expect(data.ronWins).toBe(4);
  });
});

describe("Analyze — availability is honest about what cannot be graded", () => {
  it("refuses a legacy engine-1 replay", () => {
    const legacy = JSON.parse(readFileSync("packages/web/test/fixtures/legacy-v1.json", "utf8"));
    expect(buildAnalyze(legacy.saved)).toEqual({ available: false, reason: "legacy-rules" });
  });

  it("refuses an incomplete archive instead of fabricating grades", () => {
    const saved = fixture.saved as { decisions: unknown[] };
    const truncated = { ...saved, decisions: saved.decisions.slice(0, 100) };
    expect(buildAnalyze(truncated)).toEqual({ available: false, reason: "incomplete" });
  });

  it("refuses garbage input", () => {
    expect(buildAnalyze({ nonsense: true })).toEqual({ available: false, reason: "invalid" });
    expect(buildAnalyze(null)).toEqual({ available: false, reason: "invalid" });
  });

  it("refuses a variant (engine v3) replay — no taxonomy exists for it", () => {
    const decisions: unknown[] = [];
    const ai = {
      turn: (v: any, c: any) => ({ type: "discard", tileId: c.drawnTile?.id ?? v.hand[0].id }),
      call: () => ({ type: "pass" }),
    };
    const policy = {
      turn(v: any, c: any) { const a = ai.turn(v, c); decisions.push(a); return a; },
      call(v: any, c: any) { const a = ai.call(v, c); decisions.push(a); return a; },
    };
    const game = new VariantGame({
      seed: "analyze-variant-refusal", variant: "hong-kong", length: "east",
      policies: [policy, policy, policy, policy] as never,
    });
    game.run();
    const saved = {
      v: 3, engineVersion: 3, aiVersion: 1, variant: "hong-kong",
      ruleset: { id: (game as any).adapter.profileId, version: 1 },
      seed: "analyze-variant-refusal", length: "east", humanSeat: 0, decisions,
    };
    expect(buildAnalyze(saved)).toEqual({ available: false, reason: "variant-evaluator" });
  });
});

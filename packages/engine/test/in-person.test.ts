import { describe, expect, it } from "vitest";
import {
  calculateDraft,
  recomputeSession,
  sessionSettlement,
  validateScoringSession,
  TABLE_PRESETS,
  type CalculationDraft,
  type ScoringSession,
  type TableEvent,
} from "../src/in-person.js";
import { parseCounts } from "../src/tiles.js";

const context = {
  winner: 1,
  dealer: 0,
  winType: "ron" as const,
  payer: 3,
  honba: 2,
};
const fast: CalculationDraft = {
  input: {
    variant: "riichi",
    path: "fast",
    context,
    han: 3,
    fu: 40,
    yakuman: 0,
  },
  corrections: [],
};
function table(
  events: TableEvent[] = [],
  multipleRon: "all" | "head-bump" = "head-bump",
): ScoringSession {
  return {
    v: 1,
    id: "test",
    variant: "riichi",
    preset: "openmahjong-riichi-table@1",
    names: ["A", "B", "C", "D"],
    startingScores: [25000, 25000, 25000, 25000],
    settings: {
      ...TABLE_PRESETS["openmahjong-riichi-table@1"].settings,
      multipleRon,
    },
    revision: 0,
    updatedAt: "2026-11-17T00:00:00Z",
    finished: false,
    ledger: events.map((event, i) => ({
      id: `op-${i}`,
      kind: "set",
      recordId: `hand-${i}`,
      event,
    })),
  };
}
describe("shared calculator payments", () => {
  it("derives 3 han 40 fu as 1280 base, rounds 5120 to 5200, then adds 600 repeat points", () => {
    expect(calculateDraft(fast).payments).toEqual([
      { from: 3, to: 1, amount: 5800 },
    ]);
    const self = calculateDraft({
      ...fast,
      input: { ...fast.input, context: { ...context, winType: "tsumo" } },
    });
    expect(self.payments).toEqual([
      { from: 0, to: 1, amount: 2800 },
      { from: 2, to: 1, amount: 1500 },
      { from: 3, to: 1, amount: 1500 },
    ]);
  });
  it("detects a closed seven-pairs hand from tiles and keeps manual corrections separate", () => {
    const counts = parseCounts("1122m3344p5566s77z");
    const draft: CalculationDraft = {
      input: {
        variant: "riichi",
        path: "tiles",
        context: { ...context, honba: 0 },
        hand: {
          handCounts: counts,
          melds: [],
          winningTileType: 33,
          winType: "ron",
          seatWind: 28,
          roundWind: 27,
          riichi: false,
          dora: 0,
          honba: 0,
          riichiSticks: 0,
        },
      },
      corrections: [],
    };
    const result = calculateDraft(draft);
    expect(result.units).toBe(2);
    expect(result.fu).toBe(25);
    expect(result.payments[0]!.amount).toBe(1600);
    const id = result.detected[0]!.id;
    const corrected = calculateDraft({
      ...draft,
      corrections: [{ id, units: 3, reason: "Agreed at table" }],
    });
    expect(corrected.detected[0]!.units).toBe(2);
    expect(corrected.corrected[0]!.units).toBe(3);
    expect(corrected.payments[0]!.amount).toBe(3200);
    expect(corrected.manual).toBe(true);
    expect(() =>
      calculateDraft({
        ...draft,
        corrections: [{ id: "invented", units: 1, reason: "x" }],
      }),
    ).toThrow(/unknown fact/);
  });
  it("uses entered card value only, with discard, self-pick, jokerless and Singles/Pairs exceptions", () => {
    const input = {
      variant: "american" as const,
      path: "fast" as const,
      context,
      value: 25,
      jokerless: true,
      singlesPairs: false,
    };
    expect(
      calculateDraft({ input, corrections: [] }).payments.map((p) => p.amount),
    ).toEqual([50, 50, 100]);
    expect(
      calculateDraft({
        input: { ...input, singlesPairs: true },
        corrections: [],
      }).payments.map((p) => p.amount),
    ).toEqual([25, 25, 50]);
    expect(
      calculateDraft({
        input: { ...input, context: { ...context, winType: "tsumo" } },
        corrections: [],
      }).payments.map((p) => p.amount),
    ).toEqual([100, 100, 100]);
    expect(
      calculateDraft({ input: { ...input, bettor: 1 }, corrections: [] })
        .payments.filter((p) => p.to === 4)
        .map((p) => p.amount),
    ).toEqual([50, 50, 100]);
    expect(
      calculateDraft({
        input: { ...input, bettor: "wall" },
        corrections: [],
      }).payments.at(-1),
    ).toEqual({ from: 4, to: 1, amount: 50 });
  });
  it("rejects impossible combinations and unbounded context", () => {
    expect(() =>
      calculateDraft({
        ...fast,
        input: { ...fast.input, context: { ...context, payer: 1 } },
      }),
    ).toThrow();
    expect(() =>
      calculateDraft({
        input: {
          variant: "riichi",
          path: "fast",
          context,
          han: 1,
          fu: 20,
          yakuman: 0,
        },
        corrections: [],
      }),
    ).toThrow();
    expect(() =>
      calculateDraft({
        ...fast,
        input: { ...fast.input, context: { ...context, honba: Infinity } },
      }),
    ).toThrow();
  });
});
describe("recomputed scoring ledgers", () => {
  it("conserves 100,000 including deposits, exhaustive draws, penalties and wins", () => {
    const session = table([
      { kind: "deposit", seat: 0 },
      { kind: "deposit", seat: 2 },
      { kind: "draw", reason: "exhaustive", ready: [0, 1] },
      {
        kind: "penalty",
        reason: "Agreed penalty",
        payments: [{ from: 3, to: 1, amount: 1000 }],
      },
      { kind: "win", wins: [fast] },
    ]);
    const result = recomputeSession(session);
    for (const row of result.rows)
      expect(row.scores.reduce((a, b) => a + b, row.pot)).toBe(100000);
    expect(result.scores).toEqual([25500, 35300, 22500, 16700]);
    expect(result.pot).toBe(0);
  });
  it("applies corrections at the original hand and undo restores the previous operation", () => {
    const session = table([{ kind: "win", wins: [fast] }]);
    const edited: ScoringSession = {
      ...session,
      ledger: [
        ...session.ledger,
        {
          id: "edit",
          kind: "set",
          recordId: "hand-0",
          event: { kind: "draw", reason: "abortive", ready: [] },
        },
      ],
    };
    expect(recomputeSession(edited).scores).toEqual([
      25000, 25000, 25000, 25000,
    ]);
    const undone: ScoringSession = {
      ...edited,
      ledger: [...edited.ledger, { id: "undo", kind: "undo", target: "edit" }],
    };
    expect(recomputeSession(undone).scores).toEqual(
      recomputeSession(session).scores,
    );
    expect(() =>
      validateScoringSession({
        ...session,
        ledger: [...session.ledger, ...session.ledger],
      }),
    ).toThrow(/Duplicate/);
  });
  it("orders simultaneous ron by distance from the discarder and awards the pot once", () => {
    const second: CalculationDraft = {
      input: {
        variant: "riichi",
        path: "fast",
        context: { ...context, winner: 0 },
        han: 1,
        fu: 30,
        yakuman: 0,
      },
      corrections: [],
    };
    const single = table([
      { kind: "deposit", seat: 2 },
      { kind: "win", wins: [fast, second] },
    ]);
    expect(recomputeSession(single).scores).toEqual([
      28100, 25000, 24000, 22900,
    ]);
    const all = table(
      [
        { kind: "deposit", seat: 2 },
        { kind: "win", wins: [fast, second] },
      ],
      "all",
    );
    expect(recomputeSession(all).scores).toEqual([28100, 30800, 24000, 17100]);
    expect(() =>
      recomputeSession(table([{ kind: "win", wins: [fast, fast] }], "all")),
    ).toThrow(/winner/);
  });
  it("settles outstanding deposits deterministically, ties included", () => {
    const session = table([{ kind: "deposit", seat: 2 }]);
    expect(sessionSettlement(session).scores).toEqual([
      26000, 25000, 24000, 25000,
    ]);
    expect(
      sessionSettlement({
        ...session,
        settings: { ...session.settings, finalPot: "return-deposits" },
      }).scores,
    ).toEqual([25000, 25000, 25000, 25000]);
    expect(sessionSettlement(session).transfers).toEqual([
      { from: 2, to: 0, amount: 1000 },
    ]);
  });
});

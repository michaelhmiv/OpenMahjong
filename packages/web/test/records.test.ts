import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@openmahjong/engine";
import {
  buildGameRecord,
  computeHandStats,
  formatRecordStrip,
  formatStatsView,
  relativeDateLabel,
  mergeLocalGameRecords,
  newGameId,
  shouldOfferImport,
  sumRecords,
} from "../src/records.js";
import type { GameRecord, StatsSums } from "../src/api.js";
import type { HistoryLine } from "../src/settings.js";

describe("browser history reconciliation", () => {
  const line: HistoryLine = { date: "2026-11-16T15:04:00.000Z", length: "east",
    scores: [28400, 35000, 25000, 11600], humanRank: 2 };
  const full: GameRecord = { id: "39f388b7-18e6-4ae7-9fa5-06d59b5af62c", length: "east",
    placement: 2, score: 28400, finishedAt: "2026-11-16T15:04:00.500Z",
    log: { v: 1, seed: "history", length: "east", humanSeat: 0, decisions: [] },
    stats: { hands: 4, riichi: 1, dealIns: 1, handsWon: 2, winPoints: 12700 } };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("keeps legacy-only games visible with stable importable UUIDs", () => {
    const result = mergeLocalGameRecords([], [line]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ length: "east", placement: 2, score: 28400,
      finishedAt: line.date, log: null, stats: { hands: 0, winPoints: 0 } });
    expect(result[0]!.id).toMatch(uuid);
    expect(result[0]!.id[14]).toBe("8");
    expect(result[0]!.id[19]).toMatch(/[89ab]/);
    expect(mergeLocalGameRecords([], [line])).toEqual(result);
    // An unrelated preceding row must not change an existing import key.
    const earlier = { ...line, date: "2026-11-15T15:04:00.000Z" };
    expect(mergeLocalGameRecords([], [earlier, line])[1]!.id).toBe(result[0]!.id);
  });

  it("counts a near-time mirror once and retains the full log and hand statistics", () => {
    const records = [full];
    const legacy = [line];
    const result = mergeLocalGameRecords(records, legacy);
    expect(result).toEqual([full]);
    expect(result[0]).toBe(full);
    expect(sumRecords(result)).toMatchObject({ games: 1, hands: 4, handsWon: 2, winPoints: 12700 });
    expect(records).toEqual([full]);
    expect(legacy).toEqual([line]);
  });

  it("preserves separate games outside the write window and mismatched outcomes", () => {
    const distinct: HistoryLine[] = [
      { ...line, date: "2026-11-16T15:03:59.499Z" }, // 1001 ms before the full record
      { ...line, date: "2026-11-16T15:04:00.501Z" }, // recorded after the full row
      { ...line, length: "south" },
      { ...line, humanRank: 1 },
      { ...line, scores: [28500, 34900, 25000, 11600] },
    ];
    const result = mergeLocalGameRecords([full], distinct);
    expect(result).toHaveLength(distinct.length + 1);
    expect(new Set(result.map((record) => record.id)).size).toBe(result.length);
  });

  it("suppresses at most one legacy line per full record", () => {
    const result = mergeLocalGameRecords([full], [line, { ...line }]);
    expect(result).toHaveLength(2);
    expect(result.filter((record) => record.log !== null)).toEqual([full]);
    const legacyOnly = mergeLocalGameRecords([], [line, { ...line }]);
    expect(legacyOnly).toHaveLength(2);
    expect(legacyOnly[0]!.id).not.toBe(legacyOnly[1]!.id);
    expect(result.find((record) => record.log === null)!.id).toBe(legacyOnly[1]!.id);
  });

  it("matches the human score from a replay with a nonzero human seat", () => {
    const otherSeat = { ...full, score: 35000, log: { ...full.log!, humanSeat: 1 } };
    expect(mergeLocalGameRecords([otherSeat], [line])).toEqual([otherSeat]);
  });
});

describe("game IDs in older browsers", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it("uses getRandomValues when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
    vi.stubGlobal("crypto", { getRandomValues });
    expect(newGameId()).toMatch(uuid4);
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
  it("retains UUID shape even when the runtime has no crypto object", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newGameId()).toMatch(uuid4);
  });
});

const ev = (o: Record<string, unknown>): GameEvent => o as unknown as GameEvent;

/**
 * A scripted four-hand game for seat 0, hand-checked:
 * - E1: seat 0 declares riichi, then deals into seat 2's ron (5,800).
 * - E2: seat 0 tsumo — pays 1,000 / 1,000 / 2,000, plus a 1,000 stick.
 * - E3: seat 1 declares riichi (not seat 0's); seat 0 ron off seat 3 (7,700).
 * - S1: exhaustive draw.
 * Totals: hands 4, riichi 1, dealIns 1, handsWon 2, winPoints 5,000 + 7,700 = 12,700.
 */
const SCRIPTED_EVENTS: GameEvent[] = [
  ev({ type: "hand-start", roundWind: "east", handNumber: 1 }),
  ev({ type: "riichi", seat: 0, double: false }),
  ev({
    type: "win", seat: 2, winType: "ron", fromSeat: 0,
    payments: [{ seat: 0, amount: 5800 }], stickPoints: 0,
  }),
  ev({ type: "hand-end", reason: "win", winner: 2, renchan: false }),
  ev({ type: "hand-start", roundWind: "east", handNumber: 2 }),
  ev({
    type: "win", seat: 0, winType: "tsumo",
    payments: [
      { seat: 1, amount: 1000 },
      { seat: 2, amount: 1000 },
      { seat: 3, amount: 2000 },
    ],
    stickPoints: 1000,
  }),
  ev({ type: "hand-end", reason: "win", winner: 0, renchan: false }),
  ev({ type: "hand-start", roundWind: "east", handNumber: 3 }),
  ev({ type: "riichi", seat: 1, double: false }),
  ev({
    type: "win", seat: 0, winType: "ron", fromSeat: 3,
    payments: [{ seat: 3, amount: 7700 }], stickPoints: 0,
  }),
  ev({ type: "hand-end", reason: "win", winner: 0, renchan: false }),
  ev({ type: "hand-start", roundWind: "south", handNumber: 1 }),
  ev({ type: "hand-end", reason: "exhaustive-draw", renchan: false }),
];

describe("computeHandStats", () => {
  it("folds a scripted event log into hand-checked counts", () => {
    expect(computeHandStats(SCRIPTED_EVENTS, 0)).toEqual({
      hands: 4,
      riichi: 1,
      dealIns: 1,
      handsWon: 2,
      winPoints: 12700,
    });
  });

  it("counts from another seat's perspective", () => {
    // Seat 3: dealt into seat 0's ron once; won nothing; never riichi'd.
    expect(computeHandStats(SCRIPTED_EVENTS, 3)).toEqual({
      hands: 4,
      riichi: 0,
      dealIns: 1,
      handsWon: 0,
      winPoints: 0,
    });
  });

  it("is all zeros for an empty log", () => {
    expect(computeHandStats([], 0)).toEqual({
      hands: 0, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0,
    });
  });
});

describe("buildGameRecord", () => {
  it("builds the POST /api/games shape from a finished game", () => {
    const record = buildGameRecord({
      id: "game-1",
      length: "east",
      placement: 2,
      score: 28400,
      finishedAt: "2026-11-16T15:04:00.000Z",
      log: { v: 1, seed: "s", length: "east", humanSeat: 0, decisions: [], id: "game-1" },
      events: SCRIPTED_EVENTS,
      humanSeat: 0,
    });
    expect(record.id).toBe("game-1");
    expect(record.length).toBe("east");
    expect(record.placement).toBe(2);
    expect(record.score).toBe(28400);
    expect(record.finishedAt).toBe("2026-11-16T15:04:00.000Z");
    expect(record.log?.seed).toBe("s");
    expect(record.stats).toEqual({
      hands: 4, riichi: 1, dealIns: 1, handsWon: 2, winPoints: 12700,
    });
  });
});

/** The approved rendering 04's canonical record, as raw sums. */
const RENDERING_SUMS: StatsSums = {
  games: 12,
  wins: 3,
  placementSum: 29, // avg 2.416… → "2.4"
  hands: 126,
  riichi: 23, // 18.25% → "18%"
  dealIns: 9, // 7.14% → "7%"
  handsWon: 31,
  winPoints: 181040, // / 31 = 5,840 exactly
  since: "2026-11-11T12:00:00.000Z",
};

describe("formatStatsView", () => {
  it("formats the rendering's rates with their samples", () => {
    // Blocks carry a stable id alongside the label: app.ts filters on
    // the id because labels translate (filtering on the English label
    // broke in non-English locales).
    expect(formatStatsView(RENDERING_SUMS, { handStats: true })).toEqual([
      { id: "games-played", value: "12", label: "Games played", sample: "Since Nov 11" },
      { id: "win-rate", value: "25%", label: "Win rate", sample: "3 of 12 games" },
      { id: "avg-placement", value: "2.4", label: "Avg placement", sample: "12 games" },
      { id: "riichi-rate", value: "18%", label: "Riichi rate", sample: "23 of 126 hands" },
      { id: "deal-in-rate", value: "7%", label: "Deal-in rate", sample: "9 of 126 hands" },
      { id: "avg-winning-hand", value: "5,840", label: "Avg winning hand", sample: "31 hands won" },
    ]);
  });

  it("shows game-level blocks only when hand stats are absent", () => {
    const blocks = formatStatsView(RENDERING_SUMS, { handStats: false });
    expect(blocks.map((b) => b.label)).toEqual([
      "Games played",
      "Win rate",
      "Avg placement",
    ]);
  });

  it("never divides by zero: no wins → avg winning hand is —", () => {
    const blocks = formatStatsView(
      { ...RENDERING_SUMS, wins: 0, handsWon: 0, winPoints: 0 },
      { handStats: true },
    );
    const avg = blocks.find((b) => b.label === "Avg winning hand");
    expect(avg?.value).toBe("—");
    expect(avg?.sample).toBe("0 hands won");
    const winRate = blocks.find((b) => b.label === "Win rate");
    expect(winRate?.value).toBe("0%");
  });

  it("handles zero games without NaN or Infinity", () => {
    const zero: StatsSums = {
      games: 0, wins: 0, placementSum: 0, hands: 0, riichi: 0,
      dealIns: 0, handsWon: 0, winPoints: 0, since: null,
    };
    const blocks = formatStatsView(zero, { handStats: true });
    for (const b of blocks) {
      expect(b.value).not.toMatch(/NaN|Infinity/);
    }
    expect(blocks.find((b) => b.label === "Avg placement")?.value).toBe("—");
  });
});

describe("formatRecordStrip", () => {
  it("matches the landing strip: Games 12 · Won 3 · Avg place 2.4", () => {
    expect(formatRecordStrip(RENDERING_SUMS)).toEqual({
      games: 12,
      wins: 3,
      avgPlace: "2.4",
    });
  });
});

describe("sumRecords", () => {
  it("sums placements, wins, hand stats, and the earliest date", () => {
    const sums = sumRecords([
      {
        placement: 1, finishedAt: "2026-11-12T00:00:00.000Z",
        stats: { hands: 10, riichi: 2, dealIns: 1, handsWon: 3, winPoints: 15000 },
      },
      {
        placement: 3, finishedAt: "2026-11-11T00:00:00.000Z",
        stats: { hands: 8, riichi: 1, dealIns: 0, handsWon: 1, winPoints: 3900 },
      },
    ]);
    expect(sums).toEqual({
      games: 2, wins: 1, placementSum: 4, hands: 18, riichi: 3,
      dealIns: 1, handsWon: 4, winPoints: 18900, since: "2026-11-11T00:00:00.000Z",
    });
  });
});

describe("shouldOfferImport (brief T4: one-time, first sign-in)", () => {
  const base = { signedIn: true, localCount: 5, serverGames: 0, handled: false };
  it("offers when signed in, local games exist, account is empty", () => {
    expect(shouldOfferImport(base)).toBe(true);
  });
  it("does not offer when signed out", () => {
    expect(shouldOfferImport({ ...base, signedIn: false })).toBe(false);
  });
  it("does not offer when the account already has games", () => {
    expect(shouldOfferImport({ ...base, serverGames: 3 })).toBe(false);
  });
  it("does not offer when the account state is unknown", () => {
    expect(shouldOfferImport({ ...base, serverGames: null })).toBe(false);
  });
  it("does not offer with no local games", () => {
    expect(shouldOfferImport({ ...base, localCount: 0 })).toBe(false);
  });
  it("never re-offers after import or dismissal", () => {
    expect(shouldOfferImport({ ...base, handled: true })).toBe(false);
  });
});

describe("relativeDateLabel (home Last game card)", () => {
  const now = new Date(2026, 10, 16, 15, 0, 0); // Mon Nov 16 2026, local
  it("labels a game finished earlier today as Today", () => {
    expect(relativeDateLabel(new Date(2026, 10, 16, 9, 30).toISOString(), now)).toBe("Today");
  });
  it("labels yesterday's game as Yesterday, across midnight", () => {
    expect(relativeDateLabel(new Date(2026, 10, 15, 23, 30).toISOString(), now)).toBe("Yesterday");
  });
  it("falls back to the History date format for older games", () => {
    const iso = new Date(2026, 10, 10, 12, 0).toISOString();
    expect(relativeDateLabel(iso, now)).toBe("Tue, Nov 10");
  });
  it("returns empty for an unparseable date", () => {
    expect(relativeDateLabel("not-a-date", now)).toBe("");
  });
});

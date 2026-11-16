import { describe, expect, it, vi } from "vitest";
import { types, type Pool } from "pg";
import { PgStore } from "../src/pg-store.js";

describe("Postgres wire-type boundary", () => {
  it("returns bigint win points as a JSON number, matching MemoryStore and the API", async () => {
    // Use the real driver's default int8 parser, rather than assuming that
    // database row types match the TypeScript interface.
    const winPointsFromDriver = types.getTypeParser(20)("9100");
    expect(winPointsFromDriver).toBe("9100");
    const row = {
      id: "0acdbd42-639e-4846-9369-51917ab3b66b", length: "south",
      placement: 2, score: 28700, finished_at: new Date("2026-11-16T12:00:00Z"),
      log: null, hands: 8, riichi: 2, deal_ins: 0, hands_won: 2,
      win_points: winPointsFromDriver,
    };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [row] }) } as unknown as Pool;
    const game = await new PgStore(pool).getGame("user", row.id);
    expect(game?.stats).toEqual({ hands: 8, riichi: 2, dealIns: 0, handsWon: 2, winPoints: 9100 });
    expect(JSON.parse(JSON.stringify(game)).stats.winPoints).toBe(9100);
  });
});

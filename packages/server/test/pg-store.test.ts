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

describe("PgStore resume mapping", () => {
  it("maps the in-progress row to a ResumeEntry and back", async () => {
    const savedAt = new Date("2026-11-16T15:04:05.000Z");
    const state = { v: 2, seed: "om-x", length: "east", humanSeat: 1, decisions: [] };
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.startsWith("SELECT state, client_saved_at")) {
        return { rows: [{ state, client_saved_at: savedAt }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const pool = { query } as unknown as Pool;
    const store = new PgStore(pool);

    await expect(store.getResume("user-1")).resolves.toEqual({
      state,
      clientSavedAt: savedAt,
    });

    await store.putResume("user-1", { state, clientSavedAt: savedAt });
    const upsert = query.mock.calls.find(([sql]) => sql.includes("in_progress_games") && sql.includes("INSERT"));
    expect(upsert).toBeTruthy();
    expect(upsert![1]).toEqual(["user-1", JSON.stringify(state), savedAt]);

    await store.deleteResume("user-1");
    const del = query.mock.calls.find(([sql]) => sql.startsWith("DELETE FROM in_progress_games"));
    expect(del).toBeTruthy();
  });

  it("returns null when no in-progress row exists", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
    await expect(new PgStore(pool).getResume("user-1")).resolves.toBeNull();
  });
});

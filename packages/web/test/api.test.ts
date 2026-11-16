import { describe, expect, it } from "vitest";
import {
  API_BASE,
  fetchMe,
  fetchStats,
  initAuth,
  postGame,
  type GameRecord,
} from "../src/api.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const rejectingFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

describe("initAuth / fetchMe", () => {
  it("treats an unreachable API as signed out, never throws", async () => {
    await expect(initAuth(rejectingFetch)).resolves.toEqual({
      user: null,
      csrfToken: null,
    });
  });

  it("treats a 401 as signed out", async () => {
    const f = (async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    await expect(fetchMe(f)).resolves.toEqual({ user: null, csrfToken: null });
  });

  it("returns the user and CSRF token when signed in", async () => {
    const f = (async () =>
      jsonResponse({ user: { id: "u1", name: "Michael M" }, csrfToken: "tok-1" }),
    ) as unknown as typeof fetch;
    await expect(fetchMe(f)).resolves.toEqual({
      user: { id: "u1", name: "Michael M" },
      csrfToken: "tok-1",
    });
  });

  it("sends cookies with the session probe", async () => {
    let seen: RequestInit | undefined;
    const f = (async (_url: unknown, init?: RequestInit) => {
      seen = init;
      return jsonResponse({ user: null });
    }) as unknown as typeof fetch;
    await fetchMe(f);
    expect(seen?.credentials).toBe("include");
  });
});

describe("fetchStats", () => {
  const sums = {
    games: 12, wins: 3, placementSum: 29, hands: 126, riichi: 23,
    dealIns: 9, handsWon: 31, winPoints: 181040, since: null,
  };
  it("accepts a bare sums object", async () => {
    const f = (async () => jsonResponse(sums)) as unknown as typeof fetch;
    await expect(fetchStats(f)).resolves.toEqual(sums);
  });
  it("accepts a { stats } wrapper", async () => {
    const f = (async () => jsonResponse({ stats: sums })) as unknown as typeof fetch;
    await expect(fetchStats(f)).resolves.toEqual(sums);
  });
  it("returns null when the API is down", async () => {
    await expect(fetchStats(rejectingFetch)).resolves.toBeNull();
  });
});

describe("postGame", () => {
  const record: GameRecord = {
    id: "game-1",
    length: "east",
    placement: 2,
    score: 28400,
    finishedAt: "2026-11-16T15:04:00.000Z",
    log: { v: 1, seed: "s", length: "east", humanSeat: 0, decisions: [] },
    stats: { hands: 4, riichi: 1, dealIns: 1, handsWon: 2, winPoints: 12700 },
  };

  it("posts the record with credentials and the CSRF header", async () => {
    let seenUrl = "";
    let seen: RequestInit | undefined;
    const f = (async (url: unknown, init?: RequestInit) => {
      seenUrl = String(url);
      seen = init;
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    await expect(postGame(record, "tok-1", f)).resolves.toBe(true);
    expect(seenUrl).toBe(`${API_BASE}/api/games`);
    expect(seen?.method).toBe("POST");
    expect(seen?.credentials).toBe("include");
    expect((seen?.headers as Record<string, string>)["x-csrf-token"]).toBe("tok-1");
    expect(JSON.parse(String(seen?.body))).toEqual(JSON.parse(JSON.stringify(record)));
  });

  it("reports failure instead of throwing when the API is down", async () => {
    await expect(postGame(record, null, rejectingFetch)).resolves.toBe(false);
  });
});

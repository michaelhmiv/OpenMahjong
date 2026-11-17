// @vitest-environment jsdom
/**
 * In-progress game carry-over (ruling, 2026-11-16): the local resume
 * save gains a timestamp, the API client speaks the exact
 * `{ resume: { state, savedAt } }` envelope, and ResumeSync mirrors
 * the local save to the account — newer of local/account wins,
 * guests never touch the network, failures never touch local state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_POLICY_VERSION } from "@openmahjong/ai";
import { DEFAULT_RULESET } from "@openmahjong/engine";
import { deleteResume, fetchResume, putResume } from "../src/api.js";
import { REPLAY_ENGINE_VERSION } from "../src/replay.js";
import type { SavedGame } from "../src/runner.js";
import { ResumeSync, type ResumeAuth } from "../src/resume-sync.js";
import {
  clearGame,
  loadGame,
  loadGameSavedAt,
  saveGame,
  storeGame,
} from "../src/settings.js";

function makeGame(seed = "om-test"): SavedGame {
  return {
    v: 2,
    engineVersion: REPLAY_ENGINE_VERSION,
    ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version },
    aiVersion: AI_POLICY_VERSION,
    seed,
    length: "south",
    humanSeat: 0,
    decisions: [{ type: "discard", tileId: 12 }],
    id: "game-1",
  };
}

const T1 = 1_763_000_000_000;
const T2 = 1_763_000_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const rejectingFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

/** An in-memory stand-in for the server's /api/resume, recording calls. */
function makeServer() {
  const server = {
    stored: null as { state: SavedGame; savedAt: string } | null,
    calls: [] as { method: string; body: unknown }[],
    fail: false,
    fetchFn: (async (url: unknown, init?: RequestInit) => {
      if (server.fail) throw new TypeError("Failed to fetch");
      if (!String(url).endsWith("/api/resume")) {
        throw new Error(`unexpected url ${String(url)}`);
      }
      const method = init?.method ?? "GET";
      if (method === "GET") {
        server.calls.push({ method, body: null });
        return jsonResponse({ resume: server.stored });
      }
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as {
          state: SavedGame;
          savedAt: string;
        };
        server.calls.push({ method, body });
        server.stored = { state: body.state, savedAt: body.savedAt };
        return jsonResponse(undefined, true, 204);
      }
      if (method === "DELETE") {
        server.calls.push({ method, body: null });
        server.stored = null;
        return jsonResponse(undefined, true, 204);
      }
      throw new Error(`unexpected method ${method}`);
    }) as unknown as typeof fetch,
    puts(): { state: SavedGame; savedAt: string }[] {
      return server.calls
        .filter((c) => c.method === "PUT")
        .map((c) => c.body as { state: SavedGame; savedAt: string });
    },
    deletes(): number {
      return server.calls.filter((c) => c.method === "DELETE").length;
    },
  };
  return server;
}

const signedIn: ResumeAuth = { signedIn: true, csrfToken: "csrf-1" };
const guest: ResumeAuth = { signedIn: false, csrfToken: null };

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("settings save timestamps", () => {
  it("saveGame stamps the save time and clearGame removes it", () => {
    const before = Date.now();
    const savedAt = saveGame(makeGame());
    expect(savedAt).toBeGreaterThanOrEqual(before);
    expect(savedAt).toBeLessThanOrEqual(Date.now());
    expect(loadGameSavedAt()).toBe(savedAt);
    expect(loadGame()).toEqual(makeGame());

    clearGame();
    expect(loadGame()).toBeNull();
    expect(loadGameSavedAt()).toBeNull();
  });

  it("storeGame writes an explicit save time; a legacy save has none", () => {
    storeGame(makeGame(), T1);
    expect(loadGameSavedAt()).toBe(T1);

    localStorage.setItem("openmahjong.game.v1", JSON.stringify(makeGame()));
    localStorage.removeItem("openmahjong.game.savedat.v1");
    expect(loadGame()).toEqual(makeGame());
    expect(loadGameSavedAt()).toBeNull();
  });
});

describe("resume API client envelope", () => {
  it("fetchResume parses the { resume } envelope", async () => {
    const f = (async () =>
      jsonResponse({ resume: { state: makeGame(), savedAt: iso(T1) } })) as unknown as typeof fetch;
    await expect(fetchResume(f)).resolves.toEqual({
      state: makeGame(),
      savedAt: iso(T1),
    });
  });

  it("fetchResume distinguishes empty from failure", async () => {
    const empty = (async () => jsonResponse({ resume: null })) as unknown as typeof fetch;
    await expect(fetchResume(empty)).resolves.toBe("empty");
    await expect(fetchResume(rejectingFetch)).resolves.toBeNull();
    const unauthorized = (async () => jsonResponse({}, false, 401)) as unknown as typeof fetch;
    await expect(fetchResume(unauthorized)).resolves.toBeNull();
    const malformed = (async () =>
      jsonResponse({ resume: { state: { nope: true }, savedAt: iso(T1) } })) as unknown as typeof fetch;
    await expect(fetchResume(malformed)).resolves.toBeNull();
  });

  it("putResume sends { state, savedAt } with the CSRF header", async () => {
    let seenUrl = "";
    let seen: RequestInit | undefined;
    const f = (async (url: unknown, init?: RequestInit) => {
      seenUrl = String(url);
      seen = init;
      return jsonResponse(undefined, true, 204);
    }) as unknown as typeof fetch;
    await expect(
      putResume({ state: makeGame(), savedAt: iso(T1) }, "csrf-9", f),
    ).resolves.toBe(true);
    expect(seenUrl.endsWith("/api/resume")).toBe(true);
    expect(seen?.method).toBe("PUT");
    expect((seen?.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-9");
    expect(JSON.parse(String(seen?.body))).toEqual({
      state: makeGame(),
      savedAt: iso(T1),
    });
  });

  it("deleteResume issues a CSRF DELETE and reports failure as false", async () => {
    let seen: RequestInit | undefined;
    const f = (async (_url: unknown, init?: RequestInit) => {
      seen = init;
      return jsonResponse(undefined, true, 204);
    }) as unknown as typeof fetch;
    await expect(deleteResume("csrf-9", f)).resolves.toBe(true);
    expect(seen?.method).toBe("DELETE");
    await expect(deleteResume("csrf-9", rejectingFetch)).resolves.toBe(false);
  });
});

describe("ResumeSync reconcile", () => {
  it("server copy wins when it is newer: it becomes the local resume", async () => {
    const server = makeServer();
    storeGame(makeGame("local"), T1);
    server.stored = { state: makeGame("server"), savedAt: iso(T2) };
    const sync = new ResumeSync({ auth: () => signedIn, fetchFn: server.fetchFn });

    await sync.reconcile();

    expect(loadGame()).toEqual(makeGame("server"));
    expect(loadGameSavedAt()).toBe(T2);
    expect(server.puts()).toEqual([]);
  });

  it("local copy wins when it is newer: it is pushed up", async () => {
    const server = makeServer();
    storeGame(makeGame("local"), T2);
    server.stored = { state: makeGame("server"), savedAt: iso(T1) };
    const sync = new ResumeSync({ auth: () => signedIn, fetchFn: server.fetchFn });

    await sync.reconcile();

    expect(server.puts()).toEqual([{ state: makeGame("local"), savedAt: iso(T2) }]);
    expect(server.stored).toEqual({ state: makeGame("local"), savedAt: iso(T2) });
    expect(loadGame()).toEqual(makeGame("local"));
    expect(loadGameSavedAt()).toBe(T2);
  });

  it("pushes the local game when the account has none", async () => {
    const server = makeServer();
    storeGame(makeGame("local"), T1);
    const sync = new ResumeSync({ auth: () => signedIn, fetchFn: server.fetchFn });

    await sync.reconcile();

    expect(server.stored).toEqual({ state: makeGame("local"), savedAt: iso(T1) });
  });

  it("a failed fetch leaves the local resume exactly as it was", async () => {
    const server = makeServer();
    server.fail = true;
    storeGame(makeGame("local"), T1);
    const sync = new ResumeSync({ auth: () => signedIn, fetchFn: server.fetchFn });

    await sync.reconcile();

    expect(loadGame()).toEqual(makeGame("local"));
    expect(loadGameSavedAt()).toBe(T1);
    expect(server.puts()).toEqual([]);
    expect(server.stored).toBeNull();
  });

  it("guests reconcile nothing and make no calls", async () => {
    const server = makeServer();
    storeGame(makeGame("local"), T1);
    server.stored = { state: makeGame("server"), savedAt: iso(T2) };
    const sync = new ResumeSync({ auth: () => guest, fetchFn: server.fetchFn });

    await sync.reconcile();

    expect(server.calls).toEqual([]);
    expect(loadGame()).toEqual(makeGame("local"));
  });
});

describe("ResumeSync save mirroring", () => {
  it("debounces rapid saves into one trailing push of the last state", async () => {
    vi.useFakeTimers();
    const server = makeServer();
    const sync = new ResumeSync({
      auth: () => signedIn,
      fetchFn: server.fetchFn,
      debounceMs: 3_000,
    });

    sync.noteSave(makeGame("one"), T1);
    sync.noteSave(makeGame("two"), T1 + 1);
    sync.noteSave(makeGame("three"), T2);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(server.puts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.puts()).toEqual([{ state: makeGame("three"), savedAt: iso(T2) }]);
  });

  it("flush pushes a pending save immediately", async () => {
    const server = makeServer();
    const sync = new ResumeSync({
      auth: () => signedIn,
      fetchFn: server.fetchFn,
      debounceMs: 60_000,
    });
    sync.noteSave(makeGame(), T1);
    sync.flush();
    await settle();
    expect(server.puts()).toEqual([{ state: makeGame(), savedAt: iso(T1) }]);
  });

  it("finish/abandon clears the server copy and cancels a pending push", async () => {
    vi.useFakeTimers();
    const server = makeServer();
    server.stored = { state: makeGame(), savedAt: iso(T1) };
    const sync = new ResumeSync({
      auth: () => signedIn,
      fetchFn: server.fetchFn,
      debounceMs: 3_000,
    });

    sync.noteSave(makeGame("newer"), T2);
    sync.noteClear();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(server.puts()).toEqual([]);
    expect(server.deletes()).toBe(1);
    expect(server.stored).toBeNull();
  });

  it("a failed push never loses or alters the local resume", async () => {
    const server = makeServer();
    server.fail = true;
    const local = makeGame("local");
    storeGame(local, T1);
    const sync = new ResumeSync({
      auth: () => signedIn,
      fetchFn: server.fetchFn,
      debounceMs: 10,
    });

    sync.noteSave(local, T1);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(loadGame()).toEqual(local);
    expect(loadGameSavedAt()).toBe(T1);
  });

  it("guests make no server calls on save, clear, or flush", async () => {
    const server = makeServer();
    const sync = new ResumeSync({
      auth: () => guest,
      fetchFn: server.fetchFn,
      debounceMs: 10,
    });
    sync.noteSave(makeGame(), T1);
    sync.flush();
    sync.noteClear();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(server.calls).toEqual([]);
  });
});

/** Exercise the real client against real HTTP handlers, without OAuth or SQL. */
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/src/app.js";
import { hashToken } from "../../server/src/auth.js";
import { loadConfig } from "../../server/src/config.js";
import { MemoryStore } from "../../server/src/memory-store.js";
import { deleteAccount, deleteResume, fetchGame, fetchGames, fetchMe, fetchResume, fetchServerSettings, postGame, postImport, putResume, putSettings, signOut, type GameRecord } from "../src/api.js";
import { REPLAY_ENGINE_VERSION } from "../src/replay.js";
import type { SavedGame } from "../src/runner.js";
import { AI_POLICY_VERSION } from "@openmahjong/ai";
import { DEFAULT_RULESET } from "@openmahjong/engine";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { mergeLocalGameRecords } from "../src/records.js";

let server: Server;
let store: MemoryStore;
let client: typeof fetch;
let userId: string;
const csrf = "test-csrf";
beforeEach(async () => {
  store = new MemoryStore();
  const user = await store.upsertUser({ googleSub: "contract-test", name: "Test learner", avatarUrl: null });
  userId = user.id;
  await store.createSession({ userId, tokenHash: hashToken("session-test"), csrfToken: csrf, expiresAt: new Date(Date.now() + 60_000) });
  server = createServer(createApp({ store, google: null, config: loadConfig({}) }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected HTTP port");
  client = ((url, init = {}) => fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`, {
    ...init, headers: { ...init.headers, cookie: "om_session=session-test", origin: "https://openmahjong.app" },
  })) as typeof fetch;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
function game(): GameRecord {
  return { id: randomUUID(), length: "east", placement: 2, score: 25000, finishedAt: "2026-11-16T15:00:00.000Z",
    log: { v: 1, seed: "s", length: "east", humanSeat: 0, decisions: [] },
    stats: { hands: 4, riichi: 1, dealIns: 0, handsWon: 1, winPoints: 1000 } };
}
describe("client/server account contract", () => {
  it("distinguishes an empty account's settings from an offline failure", async () => {
    expect((await fetchMe(client)).user?.id).toBe(userId);
    expect(await fetchServerSettings(client)).toEqual({});
    const offline = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    expect(await fetchServerSettings(offline)).toBeNull();
  });
  it("round-trips preferences and namespaced lesson progress through the settings envelope", async () => {
    const settings = { ...DEFAULT_SETTINGS, guided: true, "openmahjong.tutorial.v1": { done: ["tu1"], active: null } };
    expect(await putSettings(settings, csrf, client)).toBe(true);
    expect(await fetchServerSettings(client)).toEqual(settings);
    expect(await store.getSettings(userId)).toEqual(settings);
    expect(await putSettings(DEFAULT_SETTINGS, "wrong", client)).toBe(false);
    expect(await store.getSettings(userId)).toEqual(settings);
  });
  it("round-trips the in-progress game through the resume envelope", async () => {
    const state: SavedGame = {
      v: 2,
      engineVersion: REPLAY_ENGINE_VERSION,
      ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version },
      aiVersion: AI_POLICY_VERSION,
      seed: "om-contract",
      length: "south",
      humanSeat: 0,
      decisions: [{ type: "discard", tileId: 12 }],
      id: "contract-game",
    };
    const savedAt = "2026-11-16T15:04:05.000Z";

    // Empty account is a distinct answer from a failed call.
    expect(await fetchResume(client)).toBe("empty");

    expect(await putResume({ state, savedAt }, csrf, client)).toBe(true);
    expect(await store.getResume(userId)).toEqual({
      state,
      clientSavedAt: new Date(savedAt),
    });
    expect(await fetchResume(client)).toEqual({ state, savedAt });

    // A bad CSRF token changes nothing.
    expect(await putResume({ state, savedAt }, "wrong", client)).toBe(false);
    expect(await fetchResume(client)).toEqual({ state, savedAt });

    expect(await deleteResume(csrf, client)).toBe(true);
    expect(await fetchResume(client)).toBe("empty");
    expect(await store.getResume(userId)).toBeNull();
    // Clearing twice is fine.
    expect(await deleteResume(csrf, client)).toBe(true);
  });
  it("syncs the bounded 2000-attempt learning history without silently truncating it", async () => {
    const attempts = Array.from({ length: 2000 }, (_, index) => ({
      schemaVersion: 1, taxonomyVersion: 1, id: `learning-attempt-${index}`, exerciseId: "wait-ryanmen",
      exerciseVersion: 1, ruleset: { id: "openmahjong-riichi", version: 1 }, skill: "wait-reading",
      at: 1_700_000_000_000 + index, correct: true, assisted: false, attemptNumber: 1, responseMs: 500,
    }));
    const settings = { ...DEFAULT_SETTINGS, "openmahjong.practice.v1": { schemaVersion: 1, attempts } };
    expect(new TextEncoder().encode(JSON.stringify(settings)).length).toBeGreaterThan(64 * 1024);
    expect(await putSettings(settings, csrf, client)).toBe(true);
    expect(await fetchServerSettings(client)).toEqual(settings);
  });
  it("distinguishes history summaries from replay details", async () => {
    const record = game();
    expect(await postGame(record, csrf, client)).toBe(true);
    const rows = await fetchGames(client);
    expect(rows).toHaveLength(1);
    expect(rows![0]).not.toHaveProperty("log");
    expect(rows![0]).not.toHaveProperty("stats");
    expect(await fetchGame(record.id, client)).toEqual(record);
  });
  it("imports more than one server-sized batch without duplicating retried records", async () => {
    const records = Array.from({ length: 205 }, game);
    expect(await postImport(records, csrf, client)).toBe(true);
    expect((await store.getStats(userId)).games).toBe(205);
    expect(await postImport(records, csrf, client)).toBe(true);
    expect((await store.getStats(userId)).games).toBe(205);
  });
  it("imports legacy-only history with stable database-compatible ids", async () => {
    const old = [{ date: "2026-11-16T14:00:00.000Z", length: "east" as const,
      humanRank: 2, scores: [25000, 35000, 20000, 20000] }];
    const records = mergeLocalGameRecords([], old);
    expect(await postImport(records, csrf, client)).toBe(true);
    expect(await postImport(mergeLocalGameRecords([], old), csrf, client)).toBe(true);
    expect((await store.getStats(userId)).games).toBe(1);
  });
  it("recognizes a successful empty account-deletion response", async () => {
    expect(await deleteAccount(csrf, client)).toBe(true);
    expect(await fetchMe(client)).toEqual({ user: null, csrfToken: null });
    expect(await store.getUserById(userId)).toBeNull();
  });
  it("recognizes signout and rejects missing CSRF without ending the session", async () => {
    expect(await signOut(null, client)).toBe(false);
    expect((await fetchMe(client)).user?.name).toBe("Test learner");
    expect(await signOut(csrf, client)).toBe(true);
    expect((await fetchMe(client)).user).toBeNull();
  });
});

/**
 * HTTP-level suite for the slice-2 backend, run against the in-memory
 * store with a fake Google client (no network, no live Postgres — CI
 * has neither). Covers the brief's server-side acceptance checks:
 * B2 (sign-in round trip), B4 (stats sums, hand-checked), B5 (import
 * dedupe), B6 (deletion removes everything), plus CSRF, idempotency,
 * session expiry, cross-user isolation, and CORS.
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAUTH_STATE_TTL_MS } from "../src/auth.js";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { GoogleClient, GoogleProfile } from "../src/google.js";
import { MemoryStore } from "../src/memory-store.js";
import type { GameRecord } from "../src/store.js";

const APP_ORIGIN = "https://openmahjong.app";

const testConfig: Config = {
  port: 0,
  appOrigin: APP_ORIGIN,
  databaseUrl: null,
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  apiOrigin: "https://api.openmahjong.app",
  cookieDomain: ".openmahjong.app",
};

const PROFILES: Record<string, GoogleProfile> = {
  "code-a": {
    sub: "sub-alice",
    name: "Alice A",
    avatarUrl: "https://example.com/alice.png",
  },
  "code-b": { sub: "sub-bob", name: "Bob B", avatarUrl: null },
};

function fakeGoogle(): GoogleClient {
  return {
    consentUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: "test-client",
        redirect_uri: "https://api.openmahjong.app/auth/google/callback",
        response_type: "code",
        scope: "openid profile",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    async exchangeCode(code: string): Promise<GoogleProfile> {
      const profile = PROFILES[code];
      if (!profile) throw new Error(`unknown code ${code}`);
      return profile;
    },
  };
}

interface Ctx {
  base: string;
  store: MemoryStore;
}

const servers: Server[] = [];

async function setup(
  opts: { google?: GoogleClient | null } = {},
): Promise<Ctx> {
  const store = new MemoryStore();
  const google = opts.google === undefined ? fakeGoogle() : opts.google;
  const server = createServer(createApp({ store, google, config: testConfig }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { base: `http://127.0.0.1:${addr.port}`, store };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** Full sign-in round trip; returns the session cookie + CSRF token. */
async function signIn(
  ctx: Ctx,
  code = "code-a",
): Promise<{ cookie: string; csrf: string }> {
  const start = await fetch(`${ctx.base}/auth/google/start`, {
    redirect: "manual",
  });
  expect(start.status).toBe(302);
  const consent = new URL(start.headers.get("location")!);
  expect(consent.origin + consent.pathname).toBe(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  const state = consent.searchParams.get("state");
  expect(state).toBeTruthy();

  const callback = await fetch(
    `${ctx.base}/auth/google/callback?code=${code}&state=${state}`,
    { redirect: "manual", headers: { cookie: start.headers.getSetCookie()[0]!.split(";")[0]! } },
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe(`${APP_ORIGIN}/`);
  const setCookie = callback.headers
    .getSetCookie()
    .find((c) => c.startsWith("om_session="));
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Lax");
  expect(setCookie).toContain("Domain=.openmahjong.app");
  expect(setCookie).toContain("Path=/");
  const token = setCookie!.slice("om_session=".length).split(";")[0]!;
  const cookie = `om_session=${token}`;

  const me = await fetch(`${ctx.base}/api/me`, { headers: { cookie } });
  const body = (await me.json()) as { csrfToken: string };
  return { cookie, csrf: body.csrfToken };
}

function makeGame(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: randomUUID(),
    length: "south",
    placement: 2,
    score: 28700,
    finishedAt: new Date("2026-11-16T12:00:00.000Z"),
    log: { decisions: [{ type: "discard", tile: "5p" }] },
    stats: { hands: 8, riichi: 2, dealIns: 0, handsWon: 2, winPoints: 9100 },
    ...overrides,
  };
}

function gameBody(game: GameRecord): Record<string, unknown> {
  return {
    id: game.id,
    length: game.length,
    placement: game.placement,
    score: game.score,
    finishedAt: game.finishedAt.toISOString(),
    log: game.log,
    stats: game.stats,
  };
}

async function postGame(
  ctx: Ctx,
  auth: { cookie: string; csrf: string },
  game: GameRecord,
): Promise<Response> {
  return fetch(`${ctx.base}/api/games`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookie,
      "x-csrf-token": auth.csrf,
    },
    body: JSON.stringify(gameBody(game)),
  });
}

describe("health and sign-in configuration", () => {
  it("GET /healthz answers ok", async () => {
    const ctx = await setup();
    const res = await fetch(`${ctx.base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("boots without Google configured: healthz works, start is 503", async () => {
    const ctx = await setup({ google: null });
    const health = await fetch(`${ctx.base}/healthz`);
    expect(health.status).toBe(200);
    const start = await fetch(`${ctx.base}/auth/google/start`, {
      redirect: "manual",
    });
    expect(start.status).toBe(503);
  });

  it("rejects a callback with an unknown state", async () => {
    const ctx = await setup();
    const res = await fetch(
      `${ctx.base}/auth/google/callback?code=code-a&state=bogus`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a callback missing the code", async () => {
    const ctx = await setup();
    const start = await fetch(`${ctx.base}/auth/google/start`, {
      redirect: "manual",
    });
    const state = new URL(start.headers.get("location")!).searchParams.get(
      "state",
    );
    const res = await fetch(
      `${ctx.base}/auth/google/callback?state=${state}`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(400);
  });
});

describe("sessions (B2)", () => {
  it("/api/me is { user: null } when signed out", async () => {
    const ctx = await setup();
    const res = await fetch(`${ctx.base}/api/me`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("sign-in creates the user and /api/me reports it with a CSRF token", async () => {
    const ctx = await setup();
    const { cookie } = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/me`, { headers: { cookie } });
    const body = (await res.json()) as {
      user: { name: string; avatarUrl: string | null };
      csrfToken: string;
    };
    expect(body.user.name).toBe("Alice A");
    expect(body.user.avatarUrl).toBe("https://example.com/alice.png");
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(20);

    expect(ctx.store.users.size).toBe(1);
    const [user] = [...ctx.store.users.values()];
    expect(user!.googleSub).toBe("sub-alice");
    // Only the token's hash is stored, never the token itself.
    expect(ctx.store.sessions.size).toBe(1);
    const [session] = [...ctx.store.sessions.values()];
    expect(session!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).not.toContain(session!.tokenHash);
  });

  it("a second sign-in for the same Google account reuses the user", async () => {
    const ctx = await setup();
    await signIn(ctx);
    await signIn(ctx);
    expect(ctx.store.users.size).toBe(1);
    expect(ctx.store.sessions.size).toBe(2);
  });

  it("sign-out deletes the session and clears the cookie", async () => {
    const ctx = await setup();
    const { cookie, csrf } = await signIn(ctx);
    const res = await fetch(`${ctx.base}/auth/signout`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(res.status).toBe(204);
    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("om_session="));
    expect(cleared).toContain("Max-Age=0");
    expect(ctx.store.sessions.size).toBe(0);

    const me = await fetch(`${ctx.base}/api/me`, { headers: { cookie } });
    expect(await me.json()).toEqual({ user: null });
  });

  it("an expired session no longer authenticates", async () => {
    const ctx = await setup();
    const { cookie } = await signIn(ctx);
    for (const session of ctx.store.sessions.values()) {
      session.expiresAt = new Date(Date.now() - 1000);
    }
    const me = await fetch(`${ctx.base}/api/me`, { headers: { cookie } });
    expect(await me.json()).toEqual({ user: null });
    const games = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie },
    });
    expect(games.status).toBe(401);
    // The expired session was swept.
    expect(ctx.store.sessions.size).toBe(0);
  });
});

describe("CSRF and auth gates", () => {
  it("mutations without a session are 401", async () => {
    const ctx = await setup();
    const res = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(gameBody(makeGame())),
    });
    expect(res.status).toBe(401);
  });

  it("mutations with a session but no CSRF header are 403", async () => {
    const ctx = await setup();
    const { cookie } = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(gameBody(makeGame())),
    });
    expect(res.status).toBe(403);
  });

  it("mutations with a wrong CSRF token are 403", async () => {
    const ctx = await setup();
    const { cookie } = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": "not-the-token",
      },
      body: JSON.stringify(gameBody(makeGame())),
    });
    expect(res.status).toBe(403);
  });

  it("reads without a session are 401 (except /api/me)", async () => {
    const ctx = await setup();
    for (const path of ["/api/games", "/api/stats", "/api/settings"]) {
      const res = await fetch(`${ctx.base}${path}`);
      expect(res.status, path).toBe(401);
    }
  });
});

describe("game records", () => {
  it("inserts a game (201), then re-inserting the same id is idempotent (200, original kept)", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const game = makeGame();

    const first = await postGame(ctx, auth, game);
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as GameRecord;
    expect(firstBody.id).toBe(game.id);
    expect(firstBody.score).toBe(game.score);

    const changed = { ...game, score: 99999 };
    const second = await postGame(ctx, auth, changed);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as GameRecord;
    expect(secondBody.score).toBe(game.score); // existing record wins

    const list = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie: auth.cookie },
    });
    const summaries = (await list.json()) as unknown[];
    expect(summaries).toHaveLength(1);
  });

  it("lists summaries newest first and fetches the full record", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const older = makeGame({
      finishedAt: new Date("2026-11-10T12:00:00.000Z"),
      placement: 4,
      score: 12300,
    });
    const newer = makeGame({
      finishedAt: new Date("2026-11-16T12:00:00.000Z"),
      placement: 1,
      score: 38900,
      length: "east",
    });
    await postGame(ctx, auth, older);
    await postGame(ctx, auth, newer);

    const list = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie: auth.cookie },
    });
    const summaries = (await list.json()) as Array<Record<string, unknown>>;
    expect(summaries.map((s) => s["id"])).toEqual([newer.id, older.id]);
    expect(summaries[0]).toEqual({
      id: newer.id,
      finishedAt: "2026-11-16T12:00:00.000Z",
      length: "east",
      placement: 1,
      score: 38900,
    });
    expect(summaries[0]).not.toHaveProperty("log");

    const full = await fetch(`${ctx.base}/api/games/${older.id}`, {
      headers: { cookie: auth.cookie },
    });
    expect(full.status).toBe(200);
    const record = (await full.json()) as GameRecord;
    expect(record.log).toEqual(older.log);
    expect(record.stats).toEqual(older.stats);
  });

  it("404s a game that does not exist", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/games/${randomUUID()}`, {
      headers: { cookie: auth.cookie },
    });
    expect(res.status).toBe(404);
  });

  it("isolates games per user", async () => {
    const ctx = await setup();
    const alice = await signIn(ctx, "code-a");
    const bob = await signIn(ctx, "code-b");
    const game = makeGame();
    await postGame(ctx, alice, game);

    const asBob = await fetch(`${ctx.base}/api/games/${game.id}`, {
      headers: { cookie: bob.cookie },
    });
    expect(asBob.status).toBe(404);
    const bobList = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie: bob.cookie },
    });
    expect(await bobList.json()).toEqual([]);
  });

  it("rejects malformed game records with 400", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const good = gameBody(makeGame());
    const bad: Array<[string, Record<string, unknown>]> = [
      ["placement 5", { ...good, placement: 5 }],
      ["placement 0", { ...good, placement: 0 }],
      ["bad length", { ...good, length: "west" }],
      ["bad id", { ...good, id: "not-a-uuid" }],
      ["string score", { ...good, score: "28700" }],
      ["bad finishedAt", { ...good, finishedAt: "yesterday" }],
      ["normalized impossible date", { ...good, finishedAt: "2026-02-30T12:00:00.000Z" }],
      [
        "negative stat",
        {
          ...good,
          stats: { hands: -1, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0 },
        },
      ],
      [
        "fractional stat",
        {
          ...good,
          stats: { hands: 1.5, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0 },
        },
      ],
    ];
    for (const [label, body] of bad) {
      const res = await fetch(`${ctx.base}/api/games`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: auth.cookie,
          "x-csrf-token": auth.csrf,
        },
        body: JSON.stringify(body),
      });
      expect(res.status, label).toBe(400);
    }
    const noLog = { ...good } as Record<string, unknown>;
    delete noLog["log"];
    const res = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
      },
      body: JSON.stringify(noLog),
    });
    expect(res.status, "missing log").toBe(400);
  });
});

describe("import (B5)", () => {
  it("imports N games once; re-import is a no-op; partial overlap inserts only the new ones", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const games = [makeGame(), makeGame(), makeGame()];

    const importGames = async (list: GameRecord[]) =>
      fetch(`${ctx.base}/api/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: auth.cookie,
          "x-csrf-token": auth.csrf,
        },
        body: JSON.stringify({ games: list.map(gameBody) }),
      });

    const first = await importGames(games);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ inserted: 3 });

    const again = await importGames(games);
    expect(await again.json()).toEqual({ inserted: 0 });

    const extra = makeGame();
    const overlap = await importGames([games[0]!, games[1]!, extra]);
    expect(await overlap.json()).toEqual({ inserted: 1 });

    const list = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie: auth.cookie },
    });
    expect((await list.json()) as unknown[]).toHaveLength(4);
  });
});

describe("stats (B4)", () => {
  it("sums scripted games to the hand-checked totals", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    // Hand-checked: games 3, wins 2, placementSum 1+3+1 = 5,
    // hands 8+9+7 = 24, riichi 3+2+4 = 9, dealIns 0+1+0 = 1,
    // handsWon 3+1+2 = 6, winPoints 15800+3900+11600 = 31300.
    const scripted = [
      makeGame({
        placement: 1,
        score: 34200,
        stats: { hands: 8, riichi: 3, dealIns: 0, handsWon: 3, winPoints: 15800 },
      }),
      makeGame({
        placement: 3,
        score: 21400,
        stats: { hands: 9, riichi: 2, dealIns: 1, handsWon: 1, winPoints: 3900 },
      }),
      makeGame({
        placement: 1,
        score: 38900,
        stats: { hands: 7, riichi: 4, dealIns: 0, handsWon: 2, winPoints: 11600 },
      }),
    ];
    for (const game of scripted) {
      const res = await postGame(ctx, auth, game);
      expect(res.status).toBe(201);
    }
    const res = await fetch(`${ctx.base}/api/stats`, {
      headers: { cookie: auth.cookie },
    });
    expect(await res.json()).toEqual({
      games: 3,
      wins: 2,
      placementSum: 5,
      hands: 24,
      riichi: 9,
      dealIns: 1,
      handsWon: 6,
      winPoints: 31300,
    });
  });

  it("is all zeros before any game is recorded", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/stats`, {
      headers: { cookie: auth.cookie },
    });
    expect(await res.json()).toEqual({
      games: 0,
      wins: 0,
      placementSum: 0,
      hands: 0,
      riichi: 0,
      dealIns: 0,
      handsWon: 0,
      winPoints: 0,
    });
  });
});

describe("settings sync (A4)", () => {
  it("round-trips the settings object verbatim", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);

    const before = await fetch(`${ctx.base}/api/settings`, {
      headers: { cookie: auth.cookie },
    });
    expect(await before.json()).toEqual({ settings: null });

    const settings = { sound: false, motion: "reduced", largeTiles: true };
    const put = await fetch(`${ctx.base}/api/settings`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
      },
      body: JSON.stringify({ settings }),
    });
    expect(put.status).toBe(204);

    const after = await fetch(`${ctx.base}/api/settings`, {
      headers: { cookie: auth.cookie },
    });
    expect(await after.json()).toEqual({ settings });

    const updated = { sound: true, motion: "standard", largeTiles: false };
    const put2 = await fetch(`${ctx.base}/api/settings`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
      },
      body: JSON.stringify({ settings: updated }),
    });
    expect(put2.status).toBe(204);
    const final = await fetch(`${ctx.base}/api/settings`, {
      headers: { cookie: auth.cookie },
    });
    expect(await final.json()).toEqual({ settings: updated });
  });

  it("PUT without a settings key is 400", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/settings`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
      },
      body: JSON.stringify({ notSettings: {} }),
    });
    expect(res.status).toBe(400);
  });
});

describe("account deletion (B6)", () => {
  it("hard-deletes the user, games, settings, and sessions", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    await postGame(ctx, auth, makeGame());
    await fetch(`${ctx.base}/api/settings`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
      },
      body: JSON.stringify({ settings: { sound: true } }),
    });
    expect(ctx.store.users.size).toBe(1);
    expect(ctx.store.games.size).toBe(1);
    expect(ctx.store.settings.size).toBe(1);
    expect(ctx.store.sessions.size).toBe(1);

    const res = await fetch(`${ctx.base}/api/me`, {
      method: "DELETE",
      headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
    });
    expect(res.status).toBe(204);
    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("om_session="));
    expect(cleared).toContain("Max-Age=0");

    // Direct store check (B6): nothing of the user remains.
    expect(ctx.store.users.size).toBe(0);
    expect(ctx.store.usersByGoogleSub.size).toBe(0);
    expect(ctx.store.games.size).toBe(0);
    expect(ctx.store.settings.size).toBe(0);
    expect(ctx.store.sessions.size).toBe(0);

    const me = await fetch(`${ctx.base}/api/me`, {
      headers: { cookie: auth.cookie },
    });
    expect(await me.json()).toEqual({ user: null });

    // Signing in again starts from an empty record.
    const fresh = await signIn(ctx);
    const stats = await fetch(`${ctx.base}/api/stats`, {
      headers: { cookie: fresh.cookie },
    });
    expect((await stats.json()) as { games: number }).toMatchObject({
      games: 0,
    });
    const games = await fetch(`${ctx.base}/api/games`, {
      headers: { cookie: fresh.cookie },
    });
    expect(await games.json()).toEqual([]);
  });

  it("DELETE /api/me requires CSRF like every mutation", async () => {
    const ctx = await setup();
    const { cookie } = await signIn(ctx);
    const res = await fetch(`${ctx.base}/api/me`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(403);
    expect(ctx.store.users.size).toBe(1);
  });
});

describe("CORS", () => {
  it("allows exactly the app origin with credentials on /api/*", async () => {
    const ctx = await setup();
    const preflight = await fetch(`${ctx.base}/api/games`, {
      method: "OPTIONS",
      headers: {
        origin: APP_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-csrf-token",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      APP_ORIGIN,
    );
    expect(preflight.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "x-csrf-token",
    );

    const res = await fetch(`${ctx.base}/api/me`, {
      headers: { origin: APP_ORIGIN },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
  });

  it("grants no CORS headers to other origins", async () => {
    const ctx = await setup();
    const preflight = await fetch(`${ctx.base}/api/games`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();

    const res = await fetch(`${ctx.base}/api/me`, {
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("OAuth transaction security", () => {
  async function startLogin(ctx: Ctx): Promise<{ state: string; cookie: string }> {
    const response = await fetch(`${ctx.base}/auth/google/start`, { redirect: "manual" });
    expect(response.status).toBe(302);
    const cookie = response.headers.getSetCookie()[0]!;
    expect(cookie).toContain("__Host-om_oauth_state=");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).not.toContain("Domain=");
    return {
      state: new URL(response.headers.get("location")!).searchParams.get("state")!,
      cookie: cookie.split(";")[0]!,
    };
  }

  it("rejects an attacker's callback in another browser without consuming the legitimate transaction", async () => {
    const ctx = await setup();
    const alice = await startLogin(ctx);
    const bob = await startLogin(ctx);
    const url = `${ctx.base}/auth/google/callback?code=code-a&state=${alice.state}`;
    for (const cookie of ["", bob.cookie]) {
      const rejected = await fetch(url, { redirect: "manual", headers: { cookie } });
      expect(rejected.status).toBe(400);
      expect(rejected.headers.getSetCookie()).toEqual([]);
      expect(ctx.store.sessions.size).toBe(0);
    }
    const legitimate = await fetch(url, { redirect: "manual", headers: { cookie: alice.cookie } });
    expect(legitimate.status).toBe(302);
    expect(ctx.store.sessions.size).toBe(1);
    expect(legitimate.headers.getSetCookie()).toContainEqual(expect.stringContaining("__Host-om_oauth_state=; Path=/; Max-Age=0"));
    const replay = await fetch(url, { redirect: "manual", headers: { cookie: alice.cookie } });
    expect(replay.status).toBe(400);
    expect(ctx.store.sessions.size).toBe(1);
  });

  it("rejects an expired transaction even if its browser cookie is present", async () => {
    const ctx = await setup();
    const transaction = await startLogin(ctx);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + OAUTH_STATE_TTL_MS + 1);
    const response = await fetch(`${ctx.base}/auth/google/callback?code=code-a&state=${transaction.state}`, {
      redirect: "manual", headers: { cookie: transaction.cookie },
    });
    expect(response.status).toBe(400);
    expect(ctx.store.users.size).toBe(0);
  });

  it("consumes state before the provider exchange finishes, preventing concurrent callback reuse", async () => {
    let completeExchange!: (profile: GoogleProfile) => void;
    const exchangeCode = vi.fn(() => new Promise<GoogleProfile>((resolve) => {
      completeExchange = resolve;
    }));
    const ctx = await setup({ google: { ...fakeGoogle(), exchangeCode } });
    const transaction = await startLogin(ctx);
    const url = `${ctx.base}/auth/google/callback?code=code-a&state=${transaction.state}`;
    const options = { redirect: "manual" as const, headers: { cookie: transaction.cookie } };
    const original = fetch(url, options);
    try {
      await vi.waitFor(() => expect(exchangeCode).toHaveBeenCalledTimes(1));
      const duplicate = await fetch(url, options);
      expect(duplicate.status).toBe(400);
      expect(exchangeCode).toHaveBeenCalledTimes(1);
      expect(ctx.store.sessions.size).toBe(0);
    } finally {
      completeExchange?.(PROFILES["code-a"]!);
    }
    expect((await original).status).toBe(302);
    expect(ctx.store.sessions.size).toBe(1);
  });

  it("caps pending transactions, then recovers capacity after their TTL", async () => {
    const ctx = await setup();
    for (let i = 0; i < 1000; i++) {
      const response = await fetch(`${ctx.base}/auth/google/start`, { redirect: "manual" });
      expect(response.status).toBe(302);
    }
    const full = await fetch(`${ctx.base}/auth/google/start`, { redirect: "manual" });
    expect(full.status).toBe(429);
    expect(full.headers.get("retry-after")).toBe("60");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + OAUTH_STATE_TTL_MS + 1);
    const recovered = await fetch(`${ctx.base}/auth/google/start`, { redirect: "manual" });
    expect(recovered.status).toBe(302);
  }, 15_000);
});

describe("bounded API inputs and private response handling", () => {
  it("requires CSRF for signout and supports the real cross-origin client preflight", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const preflight = await fetch(`${ctx.base}/auth/signout`, {
      method: "OPTIONS", headers: { origin: APP_ORIGIN, "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-csrf-token");
    const attack = await fetch(`${ctx.base}/auth/signout`, {
      method: "POST", headers: { cookie: auth.cookie, origin: "https://evil.example" },
    });
    expect(attack.status).toBe(403);
    expect(ctx.store.sessions.size).toBe(1);
    expect(attack.headers.get("access-control-allow-origin")).toBeNull();
    const signedOut = await fetch(`${ctx.base}/auth/signout`, {
      method: "POST", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf, origin: APP_ORIGIN },
    });
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(ctx.store.sessions.size).toBe(0);
  });

  it("never caches user or OAuth responses and varies CORS even when no Origin is supplied", async () => {
    const ctx = await setup();
    const me = await fetch(`${ctx.base}/api/me`);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(me.headers.get("vary")).toBe("Origin");
    expect(me.headers.get("x-content-type-options")).toBe("nosniff");
    const start = await fetch(`${ctx.base}/auth/google/start`, { redirect: "manual" });
    expect(start.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for malformed/invalid game ids instead of a database or URI-decoding 500", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    for (const id of ["not-a-uuid", "%E0%A4%A"]) {
      const response = await fetch(`${ctx.base}/api/games/${id}`, { headers: { cookie: auth.cookie } });
      expect(response.status).toBe(400);
    }
  });

  it("rejects oversized declared settings and chunked settings before storage", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const body = JSON.stringify({ settings: { oversized: "x".repeat(2 * 1024 * 1024 + 1024) } });
    const declared = await fetch(`${ctx.base}/api/settings`, {
      method: "PUT", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf }, body,
    });
    expect(declared.status).toBe(413);
    const chunkedStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${ctx.base}/api/settings`, {
        method: "PUT", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf, "transfer-encoding": "chunked" },
      }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject);
      for (let i = 0; i < body.length; i += 4096) req.write(body.slice(i, i + 4096));
      req.end();
    });
    expect(chunkedStatus).toBe(413);
    expect(ctx.store.settings.size).toBe(0);
  });

  it("rejects a streamed overflow before the client finishes sending the body", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const response = await new Promise<{ status: number; connection: string | undefined }>((resolve, reject) => {
      const req = httpRequest(`${ctx.base}/api/settings`, {
        method: "PUT",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf, "transfer-encoding": "chunked" },
      }, (res) => {
        res.resume();
        res.once("end", () => {
          resolve({ status: res.statusCode!, connection: res.headers.connection });
          req.destroy();
        });
      });
      req.on("error", reject);
      req.setTimeout(2_000, () => { req.destroy(); reject(new Error("server waited for request EOF after overflow")); });
      req.write("x".repeat(2 * 1024 * 1024 + 1024));
      // Deliberately no req.end(): the input limit must reject during
      // streaming rather than waiting for an attacker to finish.
    });
    expect(response).toEqual({ status: 413, connection: "close" });
    expect(ctx.store.settings.size).toBe(0);
  });

  it("rejects excessive imports before any insert and retains null-log legacy records", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    const response = await fetch(`${ctx.base}/api/import`, {
      method: "POST", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
      body: JSON.stringify({ games: Array.from({ length: 201 }, () => gameBody(makeGame())) }),
    });
    expect(response.status).toBe(400);
    expect(ctx.store.games.size).toBe(0);
    const legacy = await postGame(ctx, auth, makeGame({ log: null }));
    expect(legacy.status).toBe(201);
  });

  it("rejects unsafe/SQL-overflowing numbers, impossible counters, and deep JSON", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    let deep: unknown = "leaf";
    for (let i = 0; i < 70; i++) deep = { child: deep };
    const good = makeGame();
    for (const game of [
      { ...good, score: 0.5 },
      { ...good, score: Number.MAX_SAFE_INTEGER + 1 },
      { ...good, stats: { ...good.stats, hands: 2_147_483_648 } },
      { ...good, stats: { ...good.stats, handsWon: 9 } },
      { ...good, stats: { ...good.stats, winPoints: Number.MAX_SAFE_INTEGER + 1 } },
      { ...good, log: deep },
    ]) {
      const response = await postGame(ctx, auth, game);
      expect(response.status).toBe(400);
    }
    const nonFinite = JSON.stringify(gameBody(good)).replace('"score":28700', '"score":1e999');
    const overflow = await fetch(`${ctx.base}/api/games`, {
      method: "POST", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf }, body: nonFinite,
    });
    expect(overflow.status).toBe(400);
    expect(ctx.store.games.size).toBe(0);
  });

  it("requires an object settings envelope while preserving namespaced learning progress", async () => {
    const ctx = await setup();
    const auth = await signIn(ctx);
    for (const settings of [null, [], "settings", 42]) {
      const response = await fetch(`${ctx.base}/api/settings`, {
        method: "PUT", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf }, body: JSON.stringify({ settings }),
      });
      expect(response.status).toBe(400);
    }
    const settings = { sound: true, "openmahjong.tutorial.v1": { completed: ["TU-1"] } };
    const valid = await fetch(`${ctx.base}/api/settings`, {
      method: "PUT", headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf }, body: JSON.stringify({ settings }),
    });
    expect(valid.status).toBe(204);
    const stored = await fetch(`${ctx.base}/api/settings`, { headers: { cookie: auth.cookie } });
    expect(await stored.json()).toEqual({ settings });
  });
});

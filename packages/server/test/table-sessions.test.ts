import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryStore } from "../src/memory-store.js";
import { hashToken } from "../src/auth.js";
import type { Config } from "../src/config.js";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
async function harness() {
  const store = new MemoryStore();
  const config: Config = {
    port: 0,
    appOrigin: "https://openmahjong.app",
    apiOrigin: "https://api.openmahjong.app",
    cookieDomain: ".openmahjong.app",
    databaseUrl: null,
    googleClientId: null,
    googleClientSecret: null,
  };
  for (const id of ["one", "two"]) {
    const user = await store.upsertUser({
      googleSub: id,
      name: id,
      avatarUrl: null,
    });
    await store.createSession({
      userId: user.id,
      tokenHash: hashToken(id),
      csrfToken: `csrf-${id}`,
      expiresAt: new Date(Date.now() + 60000),
    });
  }
  const server = createServer(createApp({ store, config, google: null }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    user = "one",
    csrf = true,
  ) =>
    fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: `om_session=${user}`,
        ...(csrf ? { "x-csrf-token": `csrf-${user}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const state = {
    v: 1,
    id: "table-a",
    variant: "riichi",
    preset: "openmahjong-riichi-table@1",
    names: ["A", "B", "C", "D"],
    startingScores: [25000, 25000, 25000, 25000],
    settings: {
      multipleRon: "head-bump",
      settlement: "openmahjong",
      finalPot: "leader",
    },
    revision: 0,
    updatedAt: "2026-11-17T00:00:00Z",
    finished: false,
    ledger: [],
  };
  return { store, request, state };
}
describe("private versioned scoring session endpoints", () => {
  it("requires session, CSRF and owner; rejects invalid/oversized ledgers", async () => {
    const { request, state } = await harness();
    const body = { expectedRevision: 0, mutationId: "write-a", session: state };
    expect((await request("/api/table-sessions")).status).toBe(200);
    expect(
      (await request("/api/table-sessions", "GET", undefined, "missing"))
        .status,
    ).toBe(401);
    expect(
      (await request("/api/table-sessions/table-a", "PUT", body, "one", false))
        .status,
    ).toBe(403);
    expect(
      (await request("/api/table-sessions/table-a", "PUT", body)).status,
    ).toBe(200);
    expect(
      (await request("/api/table-sessions/table-a", "GET", undefined, "two"))
        .status,
    ).toBe(404);
    expect(
      (
        await request("/api/table-sessions/table-a", "PUT", {
          ...body,
          mutationId: "bad",
          session: {
            ...state,
            ledger: [
              {
                id: "x",
                kind: "set",
                recordId: "a",
                event: { kind: "deposit", seat: 8 },
              },
            ],
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/table-sessions/table-a", "PUT", {
          ...body,
          extra: "a".repeat(600000),
        })
      ).status,
    ).toBe(413);
    expect(
      (await request("/api/table-sessions/table-a", "GET")).headers.get(
        "cache-control",
      ),
    ).toBe("no-store");
  });
  it("serializes concurrent revisions, accepts duplicates, rejects key reuse, and cascades deletion", async () => {
    const { store, request, state } = await harness();
    const body = { expectedRevision: 0, mutationId: "write-a", session: state };
    const first = await request("/api/table-sessions/table-a", "PUT", body);
    expect(
      ((await first.json()) as { entry: { revision: number } }).entry.revision,
    ).toBe(1);
    const duplicate = await request("/api/table-sessions/table-a", "PUT", body);
    expect(((await duplicate.json()) as { status: string }).status).toBe(
      "duplicate",
    );
    expect(
      (
        await request("/api/table-sessions/table-a", "PUT", {
          ...body,
          session: { ...state, finished: true },
        })
      ).status,
    ).toBe(409);
    const attempts = await Promise.all(
      ["b", "c"].map((mutationId) =>
        request("/api/table-sessions/table-a", "PUT", {
          ...body,
          expectedRevision: 1,
          mutationId,
          session: { ...state, revision: 1 },
        }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = await request("/api/table-sessions/table-a", "PUT", {
      ...body,
      mutationId: "offline-old",
    });
    expect(
      ((await conflict.json()) as { entry: { revision: number } }).entry
        .revision,
    ).toBe(2);
    expect(store.tables.size).toBe(1);
    expect(store.tableWrites.size).toBe(2);
    expect((await request("/api/me", "DELETE")).status).toBe(204);
    expect(store.tables.size).toBe(0);
    expect(store.tableWrites.size).toBe(0);
  });
  it("rejects unknown annual-card content even in superseded records", async () => {
    const { request, state } = await harness();
    const bad = {
      ...state,
      variant: "american",
      preset: "american-payments@1",
      settings: {
        multipleRon: "head-bump",
        settlement: "raw",
        finalPot: "leader",
      },
      ledger: [
        {
          id: "bad",
          kind: "set",
          recordId: "one",
          event: {
            kind: "win",
            wins: [
              {
                input: {
                  variant: "american",
                  path: "fast",
                  context: {
                    winner: 0,
                    dealer: 0,
                    payer: 1,
                    winType: "ron",
                    honba: 0,
                  },
                  value: 25,
                  jokerless: false,
                  singlesPairs: false,
                  annualPatterns: ["private"],
                },
                corrections: [],
              },
            ],
          },
        },
        { id: "undo", kind: "undo", target: "bad" },
      ],
    };
    expect(
      (
        await request("/api/table-sessions/table-a", "PUT", {
          expectedRevision: 0,
          mutationId: "x",
          session: bad,
        })
      ).status,
    ).toBe(400);
  });
});

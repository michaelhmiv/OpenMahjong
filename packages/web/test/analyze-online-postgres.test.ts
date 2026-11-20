import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../server/src/migrations.js";
import { OnlineTables, type Player } from "../../server/src/online/service.js";
import { OnlineHttp } from "../../server/src/online/http.js";
import { ValidationError } from "../../server/src/validate.js";
import type { Format } from "../../server/src/online/match.js";
import { buildAnalyze } from "../src/analyze.js";

/** Analyze for online games (issue #106) — the full integration:
 *  a real finished online match in PostgreSQL, the record served by
 *  OnlineTables.analyzeRecord and by the HTTP route, graded by the
 *  shipped client grader (buildAnalyze). Lives in the web package
 *  because the grader's module graph needs the web tsconfig; runs
 *  in CI's postgres job alongside the server suites. */
const url = process.env.OPENMAHJONG_TEST_DB;
const riichiEast: Format = { variant: "riichi", pace: "correspondence", length: "east" };

describe.skipIf(!url)("Analyze for online games (PostgreSQL integration)", () => {
  const schema = "om_analyze_" + randomUUID().replaceAll("-", "");
  let admin: Pool, db: Pool, t: OnlineTables;
  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error("Loopback test database required");
    admin = new Pool({ connectionString: url });
    await admin.query("CREATE SCHEMA " + schema);
    db = new Pool({ connectionString: url, options: "-c search_path=" + schema });
    await runMigrations(db);
    t = new OnlineTables(db);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
    }
  });

  async function player(): Promise<Player> {
    const id = randomUUID(), name = "Seat " + id.slice(0, 4);
    return (
      await db.query<Player>(
        "INSERT INTO online_players(id,user_id,name,csrf) VALUES($1,$2,$3,$4) RETURNING id,name,user_id",
        [id, null, name, randomUUID()],
      )
    ).rows[0]!;
  }
  const view = (p: Player, id: string) => t.transaction((d) => t.snapshot(d, p.id, id));
  const act = (p: Player, id: string, kind: string) =>
    t.transaction((d) => t.roomAction(d, p, id, kind));

  /** A started custom table with four seated players. */
  async function table(format: Format, host?: Player) {
    const players = [host ?? (await player()), await player(), await player(), await player()];
    const { id } = await t.transaction((d) => t.create(d, players[0]!, format, "custom"));
    const { invite } = await view(players[0]!, id);
    for (const p of players.slice(1)) {
      await t.transaction((d) => t.join(d, p, null, invite));
      await act(p, id, "ready");
    }
    await act(players[0]!, id, "start");
    return { players, id };
  }

  /** Withdraw every seat (bots cover) and tick until settlement. */
  async function finish(players: Player[], id: string) {
    for (const p of players) await act(p, id, "leave");
    for (let i = 0; i < 1500; i++) {
      await t.tick();
      const state = (await db.query("SELECT state FROM online_rooms WHERE id=$1", [id])).rows[0].state;
      if (state === "finished") return;
    }
    throw new Error("table did not finish");
  }

  it("hands each participant the complete record, and the shipped grader grades it", async () => {
    const { players, id } = await table(riichiEast);
    await finish(players, id);
    const seats = new Map(
      (await db.query("SELECT seat,player FROM online_seats WHERE room=$1", [id])).rows.map(
        (r) => [r.player as string, r.seat as number],
      ),
    );
    const snapshot = await view(players[0]!, id);
    expect(snapshot.state).toBe("finished");
    for (const p of [players[0]!, players[2]!]) {
      const record = await t.transaction((d) => t.analyzeRecord(d, p.id, id));
      expect(Object.keys(record).sort()).toEqual(
        ["aiVersion", "decisions", "engineVersion", "humanSeat", "id", "length", "ruleset", "seed", "v", "walls"].sort(),
      );
      expect(record.v).toBe(2);
      expect(record.id).toBe(id);
      expect(record.length).toBe("east");
      expect(record.humanSeat).toBe(seats.get(p.id));
      expect(record.decisions.length).toBeGreaterThan(100);
      for (const wall of record.walls) {
        expect(wall).toHaveLength(136);
        expect(new Set(wall).size).toBe(136);
      }
      const built = buildAnalyze(record);
      if (!built.available) throw new Error(`record not analyzable: ${built.reason}`);
      expect(built.totalGrades).toBeGreaterThan(0);
      expect(built.overall.accuracy).not.toBeNull();
      for (const entry of snapshot.result ?? [])
        expect(built.finals[entry.seat]).toBe(entry.score);
    }
    // The record is the archive, whoever asks: two participants see
    // the same walls and decisions, differing only in their seat.
    const a = await t.transaction((d) => t.analyzeRecord(d, players[0]!.id, id));
    const b = await t.transaction((d) => t.analyzeRecord(d, players[1]!.id, id));
    expect(b.decisions).toEqual(a.decisions);
    expect(b.walls).toEqual(a.walls);
    expect(b.humanSeat).not.toBe(a.humanSeat);
  }, 120_000);

  it("refuses non-participants, unfinished games and variant games", async () => {
    const outsider = await player();
    const live = await table(riichiEast);
    await expect(
      t.transaction((d) => t.analyzeRecord(d, live.players[0]!.id, live.id)),
    ).rejects.toMatchObject({ status: 409 });
    await finish(live.players, live.id);
    await expect(
      t.transaction((d) => t.analyzeRecord(d, outsider.id, live.id)),
    ).rejects.toMatchObject({ status: 404 });
    const variant = await table({ variant: "hong-kong", pace: "correspondence", length: "east" });
    await finish(variant.players, variant.id);
    await expect(
      t.transaction((d) => t.analyzeRecord(d, variant.players[0]!.id, variant.id)),
    ).rejects.toMatchObject({ status: 409 });
  }, 120_000);

  it("serves the record over HTTP to a guest participant only", async () => {
    const http = new OnlineHttp(t);
    const origin = "http://localhost:4187";
    const readBody = async (req: IncomingMessage): Promise<unknown> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) throw new ValidationError("request body must be JSON");
      return JSON.parse(text) as unknown;
    };
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const u = new URL(req.url ?? "/", origin);
      if (!u.pathname.startsWith("/api/online/")) {
        res.writeHead(404).end();
        return;
      }
      http.handle(req, res, u, origin, async () => null, () => readBody(req)).catch((e: unknown) => {
        const status = e instanceof ValidationError ? e.status : 500;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const call = (route: string, cookie = "", body?: unknown) =>
      fetch(`http://127.0.0.1:${port}/api/online/` + route, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      const name = "Guest " + randomUUID().slice(0, 8);
      const joined = await call("guests", "", { name });
      expect(joined.status).toBe(200);
      const cookie = joined.headers.get("set-cookie")!.split(";")[0]!;
      const host = (
        await db.query<Player>("SELECT id,name,user_id FROM online_players WHERE name=$1", [name])
      ).rows[0]!;
      const { players, id } = await table(riichiEast, host);
      await finish(players, id);
      const ok = await call("matches/" + id + "/analyze", cookie);
      expect(ok.status).toBe(200);
      const record = (await ok.json()) as { v: number; humanSeat: number };
      expect(record.v).toBe(2);
      expect(record.humanSeat).toBe(0);
      const built = buildAnalyze(record);
      expect(built.available).toBe(true);
      const stranger = await call("guests", "", { name: "Guest " + randomUUID().slice(0, 8) });
      const strangerCookie = stranger.headers.get("set-cookie")!.split(";")[0]!;
      expect((await call("matches/" + id + "/analyze", strangerCookie)).status).toBe(404);
      expect((await call("matches/" + id + "/analyze")).status).toBe(401);
    } finally {
      server.close();
    }
  }, 120_000);
});

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { hashToken } from "../src/auth.js";
import { OnlineHttp } from "../src/online/http.js";
import { PgStore } from "../src/pg-store.js";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { runMigrations } from "../src/migrations.js";
import { OnlineTables, type Player } from "../src/online/service.js";
import type { Format } from "../src/online/match.js";

const url = process.env.OPENMAHJONG_TEST_DB;
const f: Format = { variant: "riichi", pace: "correspondence", length: "east" };

describe.skipIf(!url)("online ownership and recovery in PostgreSQL", () => {
  const schema = "om_online_" + randomUUID().replaceAll("-", "");
  let admin: Pool, db: Pool, t: OnlineTables;
  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error("Loopback test database required");
    admin = new Pool({ connectionString: url });
    await admin.query("CREATE SCHEMA " + schema);
    db = new Pool({
      connectionString: url,
      options: "-c search_path=" + schema,
    });
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
  async function player(account = false): Promise<Player> {
    const id = randomUUID(),
      name = "Seat " + id.slice(0, 4);
    if (account)
      await db.query("INSERT INTO users(id,google_sub,name) VALUES($1,$2,$3)", [
        id,
        "test-" + id,
        name,
      ]);
    return (
      await db.query<Player>(
        "INSERT INTO online_players(id,user_id,name,csrf) VALUES($1,$2,$3,$4) RETURNING id,name,user_id",
        [id, account ? id : null, name, randomUUID()],
      )
    ).rows[0]!;
  }
  const view = (p: Player, id: string, server = t) =>
    server.transaction((d) => server.snapshot(d, p.id, id));
  const join = (p: Player, invite: string) =>
    t.transaction((d) => t.join(d, p, null, invite));
  const act = (p: Player, id: string, kind: string) =>
    t.transaction((d) => t.roomAction(d, p, id, kind));
  async function table(format: Format) {
    const players = await Promise.all(
      Array.from({ length: 4 }, () => player()),
    );
    const { id } = await t.transaction((d) =>
      t.create(d, players[0]!, format, "custom"),
    );
    const { invite } = await view(players[0]!, id);
    for (const p of players.slice(1)) {
      await join(p, invite!);
      await act(p, id, "ready");
    }
    await act(players[0]!, id, "start");
    return { players, id };
  }
  it("keeps an unlimited seat through guest expiry, code rotation and account conversion over HTTP", async () => {
    const store = new PgStore(db),
      origin = "http://localhost:4187";
    const server = createServer(
      createApp({
        store,
        config: loadConfig({ APP_ORIGIN: origin }),
        google: null,
        online: new OnlineHttp(t),
      }),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const call = (
      route: string,
      body?: unknown,
      cookie = "",
      csrf = "",
      from = origin,
    ) =>
      fetch("http://127.0.0.1:" + address.port + "/api/online/" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie,
          origin: from,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      const newGuest = await call("guests", { name: "Future account" });
      expect(newGuest.status).toBe(200);
      const guestCookie = newGuest.headers.get("set-cookie")!;
      expect(guestCookie).toContain("HttpOnly");
      expect(guestCookie).toContain("Secure");
      const initial = guestCookie.split(";")[0]!,
        g = (await newGuest.json()) as { csrf: string; recovery: string };
      expect((await call("rooms", f, initial, "bad")).status).toBe(403);
      expect(
        (await call("rooms", f, initial, g.csrf, "http://unrelated.invalid"))
          .status,
      ).toBe(403);
      expect(
        (await call("rooms", { ...f, variant: ["riichi"] }, initial, g.csrf))
          .status,
      ).toBe(400);
      const { id } = (await (
        await call("rooms", f, initial, g.csrf)
      ).json()) as { id: string };
      const write = (kind: string) =>
        call("matches/" + id + "/room", { kind }, initial, g.csrf);
      for (let i = 1; i < 4; i++) expect((await write("bot")).status).toBe(200);
      expect((await write("start")).status).toBe(200);
      const first = (await (
        await call("matches/" + id, undefined, initial)
      ).json()) as { choices: unknown[]; view: unknown };
      expect(first.choices.length).toBeGreaterThan(0);
      const nextCode = (await (
        await call("guest/recovery", {}, initial, g.csrf)
      ).json()) as { recovery: string };
      expect((await call("recover", { code: g.recovery })).status).toBe(403);
      await db.query(
        "UPDATE online_players SET expires_at=clock_timestamp()-interval '30 days' WHERE csrf=$1",
        [g.csrf],
      );
      expect((await call("matches/" + id, undefined, initial)).status).toBe(
        401,
      );
      const renewed = await call("recover", { code: nextCode.recovery });
      expect(renewed.status).toBe(200);
      const renewedCookie = renewed.headers.get("set-cookie")!.split(";")[0]!;
      expect(
        await (await call("matches/" + id, undefined, renewedCookie)).json(),
      ).toEqual(first);
      expect((await call("recover", { code: nextCode.recovery })).status).toBe(
        403,
      );
      expect((await call("matches/" + id, undefined, initial)).status).toBe(
        401,
      );
      const account = await store.upsertUser({
        googleSub: "claim-" + id,
        name: "Member",
        avatarUrl: null,
      });
      const token = randomUUID(),
        csrf = randomUUID();
      await store.createSession({
        userId: account.id,
        tokenHash: hashToken(token),
        csrfToken: csrf,
        expiresAt: new Date(Date.now() + 60000),
      });
      const accountCookie = "om_session=" + token;
      expect(
        (await call("matches/" + id, undefined, accountCookie)).status,
      ).toBe(404);
      expect(
        (
          await call(
            "claim-guest",
            {},
            accountCookie + "; " + renewedCookie,
            csrf,
          )
        ).status,
      ).toBe(200);
      expect(
        (await call("matches/" + id, undefined, renewedCookie)).status,
      ).toBe(401);
      const restored = (await (
        await call("matches/" + id, undefined, accountCookie)
      ).json()) as typeof first;
      expect(restored.choices).toEqual(first.choices);
      expect(restored.view).toEqual(first.view);
      await store.deleteUser(account.id);
      expect(
        (await call("matches/" + id, undefined, accountCookie)).status,
      ).toBe(401);
      const seat = (
        await db.query(
          "SELECT s.covered,p.name FROM online_seats s JOIN online_players p ON p.id=s.player WHERE s.room=$1 AND s.seat=0",
          [id],
        )
      ).rows[0];
      expect(seat).toEqual({ covered: true, name: "Deleted player" });
      await db.query("DELETE FROM online_rooms WHERE id=$1", [id]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
  it("serializes the last seat, transfers the host and checks membership", async () => {
    const [host, b, c, d] = (await Promise.all([
      player(),
      player(),
      player(),
      player(),
    ])) as [Player, Player, Player, Player];
    const { id } = await t.transaction((db) => t.create(db, host, f, "custom"));
    const { invite } = await view(host, id);
    await join(b, invite!);
    await act(host, id, "bot");
    await act(host, id, "list");
    const race = await Promise.allSettled([
      join(c, invite!),
      t.transaction((db) => t.join(db, d, id, undefined)),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const outsider = race[0]!.status === "fulfilled" ? d : c;
    await expect(view(outsider, id)).rejects.toThrow("Table unavailable");
    await expect(act(b, id, "start")).rejects.toThrow("Host");
    await act(host, id, "leave");
    expect((await view(b, id)).host).toBe(true);
  });
  it("restores a month's unanswered decision, deduplicates races and protects in-progress review", async () => {
    const { players, id } = await table(f),
      host = players[0]!;
    const start = await view(host, id);
    if (!("choices" in start) || !start.choices)
      throw Error("missing private turn");
    expect(start.choices.length).toBeGreaterThan(0);
    await expect(
      t.transaction((d) => t.review(d, host.id, id)),
    ).rejects.toThrow("after final");
    await db.query(
      "UPDATE online_seats SET seen_at=now()-interval '30 days' WHERE room=$1",
      [id],
    );
    const other = new OnlineTables(db);
    await Promise.all([other.tick(), t.tick()]);
    expect(await view(host, id, other)).toEqual(start);
    const body = { actionId: randomUUID(), version: 1, revision: 0, choice: 0 };
    const send = (server: OnlineTables, p: Player, b = body) =>
      server.transaction((d) => server.action(d, p.id, id, b));
    await expect(send(other, players[2]!)).rejects.toThrow(
      "Unavailable choice",
    );
    expect(await Promise.all([send(t, host), send(other, host)])).toEqual([
      { accepted: 0 },
      { accepted: 0 },
    ]);
    await expect(send(other, host, { ...body, choice: 1 })).rejects.toThrow(
      "reused",
    );
    await expect(
      send(t, host, { ...body, actionId: randomUUID() }),
    ).rejects.toThrow("changed");
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM online_receipts WHERE room=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await view(host, id, new OnlineTables(db))).toEqual(
      await view(host, id),
    );
  });
  it("separates the 60-second live cover from claim time and reclaims only the owner's seat", async () => {
    const { players, id } = await table({ ...f, pace: "live" });
    await db.query("UPDATE online_rooms SET due_at=now() WHERE id=$1", [id]);
    await db.query(
      "UPDATE online_seats SET seen_at=now()-interval '58 seconds' WHERE room=$1 AND seat=0",
      [id],
    );
    await t.tick();
    expect((await view(players[0]!, id)).seats[0]!.covered).toBe(false);
    await db.query("UPDATE online_rooms SET due_at=now() WHERE id=$1", [id]);
    await db.query(
      "UPDATE online_seats SET seen_at=now()-interval '61 seconds' WHERE room=$1 AND seat=0",
      [id],
    );
    await Promise.all([t.tick(), new OnlineTables(db).tick()]);
    const after = await view(players[0]!, id);
    expect(after.seats[0]!.covered).toBe(true);
    expect("revision" in after && Number(after.revision)).toBeGreaterThan(0);
    await t.transaction((d) => t.presence(d, players[0]!.id, id, true));
    expect((await view(players[0]!, id)).seats[0]!.covered).toBe(false);
  });
  it("offers a compatible custom seat to an opted-in Friendly ticket and rejects expired or stolen offers", async () => {
    const format = { ...f, pace: "live" as const };
    const host = await player(),
      visitor = await player(),
      other = await player();
    const custom = await t.transaction((d) =>
      t.create(d, host, format, "custom"),
    );
    await act(host, custom.id, "list");
    const queue = await t.transaction((d) =>
      t.queue(d, visitor, format, "friendly", true),
    );
    await t.matchWaiting();
    const offer = (await view(visitor, queue.id)).offer;
    expect(offer).toMatchObject({ bots: 0, occupied: 1, pace: "live" });
    await expect(
      t.transaction((d) => t.answerOffer(d, other.id, offer.id, true)),
    ).rejects.toThrow("expired");
    await db.query(
      "UPDATE online_offers SET expires_at=now()-interval '1 second' WHERE id=$1",
      [offer.id],
    );
    await expect(
      t.transaction((d) => t.answerOffer(d, visitor.id, offer.id, true)),
    ).rejects.toThrow("expired");
    await db.query(
      "UPDATE online_offers SET expires_at=now()+interval '30 seconds' WHERE id=$1",
      [offer.id],
    );
    expect(
      await t.transaction((d) => t.answerOffer(d, visitor.id, offer.id, true)),
    ).toEqual(custom);
    expect(await view(visitor, queue.id)).toEqual({ redirect: custom.id });
    expect((await view(visitor, custom.id)).seats).toHaveLength(2);
  });
  it("a reclaimed controller fences commands from an older tab", async () => {
    const { players, id } = await table(f),
      who = players[0]!;
    const a = randomUUID(),
      b = randomUUID();
    await t.transaction((d) => t.presence(d, who.id, id, true, a, true));
    const first = await t.transaction((d) => t.snapshot(d, who.id, id, a));
    await t.transaction((d) => t.presence(d, who.id, id, true, b, true));
    const old = await t.transaction((d) => t.snapshot(d, who.id, id, a));
    expect(old.choices).toEqual([]);
    const cmd = {
      actionId: randomUUID(),
      version: 1,
      revision: 0,
      choice: 0,
      client: a,
      generation: first.generation,
    };
    await expect(
      t.transaction((d) => t.action(d, who.id, id, cmd)),
    ).rejects.toThrow("changed");
    const fresh = await t.transaction((d) => t.snapshot(d, who.id, id, b));
    await t.transaction((d) =>
      t.action(d, who.id, id, {
        ...cmd,
        client: b,
        generation: fresh.generation,
      }),
    );
  });
  it("requires consent from all humans to end an unlimited match", async () => {
    const { players, id } = await table(f);
    for (const p of players.slice(0, 3)) await act(p, id, "end");
    expect((await view(players[3]!, id)).state).toBe("playing");
    await act(players[3]!, id, "end");
    expect((await view(players[3]!, id)).state).toBe("closed");
  });
  it("voids rating for live matches spanning a shared service outage", async () => {
    const participants = await Promise.all(
      Array.from({ length: 4 }, () => player(true)),
    );
    const format = { ...f, pace: "live" as const };
    const ids = await Promise.all(
      participants.map((p) =>
        t.transaction((d) => t.queue(d, p, format, "ranked")),
      ),
    );
    const id = ids[0]!.id;
    await t.heartbeat();
    await db.query(
      "UPDATE online_rooms SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
      [id],
    );
    await db.query(
      "UPDATE online_clock SET last_tick=clock_timestamp()-interval '1 minute'",
    );
    await t.heartbeat();
    for (const p of participants) await act(p, id, "leave");
    for (let i = 0; i < 1500; i++) {
      await t.tick();
      if ((await view(participants[0]!, id)).state === "finished") break;
    }
    const result = await view(participants[0]!, id);
    expect(result).toMatchObject({
      state: "finished",
      ratingVoid: "Service interruption",
      ratings: [],
    });
  }, 90000);
  it("forms ranked tables only through matchmaking and settles once across two workers", async () => {
    const guest = await player();
    await expect(
      t.transaction((d) => t.queue(d, guest, f, "ranked")),
    ).rejects.toThrow("Sign in");
    const participants = await Promise.all(
      Array.from({ length: 4 }, () => player(true)),
    );
    const ids = await Promise.all(
      participants.map((p) => t.transaction((d) => t.queue(d, p, f, "ranked"))),
    );
    const id = ids[0]!.id;
    expect(new Set(ids.map((x) => x.id)).size).toBe(1);
    expect((await view(participants[0]!, id)).state).toBe("playing");
    await expect(
      t.transaction((d) => t.join(d, guest, id, undefined)),
    ).rejects.toThrow("unavailable");
    // Deliberate withdrawals continue with bots. Inactivity cannot withdraw an untimed player.
    for (const p of participants) await act(p, id, "leave");
    const other = new OnlineTables(db);
    for (let i = 0; i < 1500; i++) {
      await Promise.all([t.tick(), other.tick()]);
      if (
        (await db.query("SELECT state FROM online_rooms WHERE id=$1", [id]))
          .rows[0].state === "finished"
      )
        break;
    }
    const result = await view(participants[0]!, id);
    expect(result.state).toBe("finished");
    const ledger = await db.query(
      "SELECT * FROM online_rating_changes WHERE room=$1",
      [id],
    );
    expect(ledger.rowCount).toBe(4);
    expect(ledger.rows.every((r) => r.after_rating <= r.before_rating)).toBe(
      true,
    );
    await t.tick();
    expect(
      (
        await db.query("SELECT * FROM online_rating_changes WHERE room=$1", [
          id,
        ])
      ).rowCount,
    ).toBe(4);
    expect((await act(participants[0]!, id, "rematch")).id).toBe(
      (await act(participants[1]!, id, "rematch")).id,
    );
  }, 90000);
});

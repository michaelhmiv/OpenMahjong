import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { hashToken, newToken, parseCookies } from "../auth.js";
import { randomUUID } from "node:crypto";
import { OnlineTables, fail, formatOf, type Player } from "./service.js";

type Account = {
  user: { id: string; name: string };
  session: { csrfToken: string };
};
type Identity = Player & { csrf: string };
type Payload = Record<string, unknown>;
const cookieName = "__Host-om_guest";
function nameOf(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value.trim()].length > 32 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    return fail("Choose a name of 1–32 visible characters");
  return value.trim();
}
function limitGuestCookie(req: IncomingMessage) {
  const value = parseCookies(req.headers.cookie).get(cookieName);
  return value && value.length <= 64 ? hashToken(value) : null;
}
function json(res: ServerResponse, body: unknown) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export class OnlineHttp {
  private readonly creationRates = new Map<
    string,
    { since: number; count: number }
  >();
  constructor(readonly tables: OnlineTables) {}
  private limitCreation(req: IncomingMessage) {
    const key = req.socket.remoteAddress ?? "local",
      now = Date.now();
    const current = this.creationRates.get(key);
    if (!current || current.since + 60000 < now) {
      if (this.creationRates.size >= 4096)
        for (const [k, v] of this.creationRates)
          if (v.since + 60000 < now) this.creationRates.delete(k);
      this.creationRates.set(key, { since: now, count: 1 });
    } else if (++current.count > 60)
      fail("Too many attempts. Try again in a minute.", 429);
  }
  private async identity(
    req: IncomingMessage,
    account: Account | null,
  ): Promise<Identity | null> {
    if (account) {
      const { user, session } = account;
      let p = (
        await this.tables.db.query<Player>(
          "SELECT id,name,user_id FROM online_players WHERE user_id=$1",
          [user.id],
        )
      ).rows[0];
      if (!p)
        p = (
          await this.tables.db.query<Player>(
            `INSERT INTO online_players(id,user_id,name,csrf) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id,name,user_id`,
            [randomUUID(), user.id, user.name, newToken()],
          )
        ).rows[0]!;
      return { ...p, csrf: session.csrfToken };
    }
    const hash = limitGuestCookie(req);
    if (!hash) return null;
    return (
      (
        await this.tables.db.query<Identity>(
          "SELECT id,name,user_id,csrf FROM online_players WHERE guest_hash=$1 AND expires_at>now()",
          [hash],
        )
      ).rows[0] ?? null
    );
  }

  private async issueGuest(
    db: PoolClient,
    req: IncomingMessage,
    res: ServerResponse,
    b: Payload,
    recover: boolean,
  ) {
    this.limitCreation(req);
    const token = newToken(),
      csrf = newToken(),
      recovery = newToken();
    const values = [hashToken(token), csrf, hashToken(recovery)];
    let player;
    if (recover) {
      if (typeof b.code !== "string" || b.code.length > 64)
        return fail("Invalid recovery code");
      player = (
        await db.query<Player>(
          `UPDATE online_players SET guest_hash=$1,csrf=$2,recovery_hash=$3,expires_at=now()+interval '30 days'
        WHERE recovery_hash=$4 AND user_id IS NULL RETURNING id,name,user_id`,
          [...values, hashToken(b.code)],
        )
      ).rows[0];
      if (!player) return fail("Recovery code unavailable", 403);
    } else {
      player = (
        await db.query<Player>(
          `INSERT INTO online_players(guest_hash,csrf,recovery_hash,name,id,expires_at)
        VALUES ($1,$2,$3,$4,$5,now()+interval '30 days') RETURNING id,name,user_id`,
          [...values, nameOf(b.name), randomUUID()],
        )
      ).rows[0]!;
    }
    res.setHeader(
      "set-cookie",
      cookieName +
        "=" +
        token +
        "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000",
    );
    return { name: player.name, account: false, csrf, recovery };
  }

  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    origin: string,
    auth: () => Promise<Account | null>,
    body: () => Promise<unknown>,
  ) {
    const method = req.method,
      route = url.pathname.slice("/api/online/".length);
    const mutation = method !== "GET";
    if (mutation && req.headers.origin !== origin)
      return fail("Invalid request origin", 403);
    const account = await auth();
    const p = await this.identity(req, account);
    if (route === "me" && method === "GET") {
      json(
        res,
        p ? { name: p.name, account: !!p.user_id, csrf: p.csrf } : null,
      );
      return;
    }
    const input = mutation ? await body() : {};
    if (!input || typeof input !== "object" || Array.isArray(input))
      return fail("Expected object");
    const b = input as Payload;
    if (method === "POST" && (route === "guests" || route === "recover")) {
      if (account || (p && route === "guests"))
        return fail("A player is already signed in", 409);
      json(
        res,
        await this.tables.transaction((db) =>
          this.issueGuest(db, req, res, b, route === "recover"),
        ),
      );
      return;
    }
    if (!p) return fail("Join as a guest or sign in", 401);
    if (mutation && req.headers["x-csrf-token"] !== p.csrf)
      return fail("Session changed", 403);
    if (route === "games" && method === "GET") {
      json(res, await this.tables.list(p.id));
      return;
    }
    if (route === "profile" && method === "POST") {
      await this.tables.db.query(
        "UPDATE online_players SET name=$2 WHERE id=$1",
        [p.id, nameOf(b.name)],
      );
      json(res, { ok: true });
      return;
    }
    if (route === "claim-guest" && method === "POST" && account) {
      const hash = limitGuestCookie(req);
      await this.tables.transaction(async (db) => {
        const guest = (
          await db.query(
            "SELECT id FROM online_players WHERE guest_hash=$1 AND expires_at>now() FOR UPDATE",
            [hash],
          )
        ).rows[0];
        if (!guest) return fail("Guest session has expired", 409);
        const collision = await db.query(
          "SELECT 1 FROM online_seats a JOIN online_seats b ON a.room=b.room OR (a.live_busy AND b.live_busy) WHERE a.player=$1 AND b.player=$2 LIMIT 1",
          [p.id, guest.id],
        );
        if (collision.rowCount)
          return fail("These seats overlap with your account", 409);
        await db.query("UPDATE online_seats SET player=$1 WHERE player=$2", [
          p.id,
          guest.id,
        ]);
        await db.query("UPDATE online_rooms SET host=$1 WHERE host=$2", [
          p.id,
          guest.id,
        ]);
        await db.query("UPDATE online_receipts SET player=$1 WHERE player=$2", [
          p.id,
          guest.id,
        ]);
        await db.query("DELETE FROM online_players WHERE id=$1", [guest.id]);
      });
      json(res, { ok: true });
      return;
    }
    if (route === "rooms" && method === "POST") {
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.create(db, p, formatOf(b), "custom"),
        ),
      );
      return;
    }
    if (route === "rooms/join" && method === "POST") {
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.join(db, p, b.id, b.invite),
        ),
      );
      return;
    }
    if (route === "queue" && method === "POST") {
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.queue(db, p, formatOf(b), String(b.mode)),
        ),
      );
      return;
    }
    const match =
      /^matches\/([\da-f-]{36})(?:\/(actions|room|review|presence|stream))?$/.exec(
        route,
      );
    if (!match) return fail("Unknown online route", 404);
    const id = match[1]!,
      endpoint = match[2];
    const snapshot = () =>
      this.tables.transaction((db) => this.tables.snapshot(db, p.id, id));
    if (method === "GET" && !endpoint) json(res, await snapshot());
    else if (method === "GET" && endpoint === "review")
      json(
        res,
        await this.tables.transaction((db) => this.tables.review(db, p.id, id)),
      );
    else if (method === "POST" && endpoint === "actions")
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.action(db, p.id, id, b),
        ),
      );
    else if (method === "POST" && endpoint === "room")
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.roomAction(db, p, id, b.kind, b.seat),
        ),
      );
    else if (method === "POST" && endpoint === "presence")
      json(
        res,
        await this.tables.transaction((db) =>
          this.tables.presence(db, p.id, id, b.reclaim === true),
        ),
      );
    else if (method === "GET" && endpoint === "stream") {
      const first = await snapshot();
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      });
      let last = JSON.stringify(first),
        busy = false,
        checked = 0;
      res.write("retry: 1500\ndata: " + last + "\n\n");
      const timer = setInterval(async () => {
        if (busy || res.destroyed) return;
        busy = true;
        try {
          if (Date.now() - checked >= 10000) {
            const current = await this.identity(req, await auth());
            if (current?.id !== p.id) {
              res.end();
              return;
            }
            await this.tables.transaction((db) =>
              this.tables.presence(db, p.id, id, false),
            );
            checked = Date.now();
            if (!res.write(": heartbeat\n\n")) {
              res.end();
              return;
            }
          }
          const data = JSON.stringify(await snapshot());
          if (data !== last) {
            last = data;
            if (!res.write("data: " + data + "\n\n")) res.end();
          }
        } catch {
          res.end();
        } finally {
          busy = false;
        }
      }, 1000);
      res.once("close", () => clearInterval(timer));
    } else return fail("Unknown online operation", 404);
  }
}

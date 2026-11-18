import { randomInt, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { rate, rating } from "openskill";
import type { GameResult } from "@openmahjong/engine";
import { ValidationError } from "../validate.js";
import { newToken } from "../auth.js";
import { TableEngine, newJournal, type Format, type Journal } from "./match.js";

export type Player = { id: string; name: string; user_id: string | null };
type Seat = {
  seat: number;
  player: string | null;
  name: string;
  ready: boolean;
  covered: boolean;
  bot_played: boolean;
  seen_at: Date;
  idle_at: Date | null;
};
type Room = Format & {
  id: string;
  host: string | null;
  origin: "custom" | "ranked" | "friendly";
  state: string;
  invite: string | null;
  listed: boolean;
  journal: Journal | null;
  result: GameResult["settlement"] | null;
};
type Db = PoolClient;
export const fail = (message: string, status = 400): never => {
  throw new ValidationError(message, status);
};
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    return fail("Invalid identifier");
  return value;
}
export function formatOf(b: Record<string, unknown>): Format {
  if (
    !["riichi", "hong-kong", "mcr", "taiwanese"].includes(String(b.variant)) ||
    !["east", "south", "full"].includes(String(b.length)) ||
    (b.variant === "riichi" && b.length === "full") ||
    !["live", "correspondence"].includes(String(b.pace))
  )
    return fail("Invalid table settings");
  return { variant: b.variant, length: b.length, pace: b.pace } as Format;
}
function poolKey(f: Format) {
  return [f.variant, f.length, f.pace, "pl-v1"].join("/");
}
const seatQuery = `SELECT s.*,coalesce(p.name,'Bot') AS name FROM online_seats s LEFT JOIN online_players p ON p.id=s.player WHERE room=$1 ORDER BY seat`;
function member(seats: Seat[], actor: string): Seat {
  return (
    seats.find((s) => s.player === actor) ?? fail("Table unavailable", 404)
  );
}
async function lockRoom(db: Db, id: string): Promise<Room> {
  return (
    (
      await db.query<Room>(
        "SELECT * FROM online_rooms WHERE id=$1 FOR UPDATE",
        [uuid(id)],
      )
    ).rows[0] ?? fail("Table unavailable", 404)
  );
}
async function seatsOf(db: Db, id: string) {
  return (await db.query<Seat>(seatQuery, [id])).rows;
}

export class OnlineTables {
  private readonly cache = new Map<string, TableEngine>();
  constructor(
    readonly db: Pool,
    readonly enabled = { custom: true, friendly: true, ranked: true },
  ) {}

  async transaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.db.connect();
    try {
      await db.query("BEGIN");
      const result = await work(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        return fail("This seat or assignment is already taken", 409);
      throw error;
    } finally {
      db.release();
    }
  }

  private engine(room: Room) {
    const j = room.journal!;
    let engine = this.cache.get(room.id);
    if (
      !engine ||
      engine.tip !== (j.steps.at(-1)?.id ?? null) ||
      !j.walls.length
    ) {
      engine = new TableEngine(room, j);
      if (this.cache.size >= 64)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(room.id, engine);
    } else engine.attach(j);
    return engine;
  }

  async list(actor: string) {
    const mine = await this.db.query(
      `SELECT r.id,r.variant,r.length,r.pace,r.origin,r.state,s.seat,s.ready,
      coalesce((r.journal->'pending') @> to_jsonb(ARRAY[s.seat::int]),false) AS "yourMove"
      FROM online_rooms r JOIN online_seats s ON r.id=s.room WHERE s.player=$1 AND r.state <> 'closed'
      ORDER BY (r.state='finished'),r.created_at DESC`,
      [actor],
    );
    const open = await this.db
      .query(`SELECT r.id,r.variant,r.length,r.pace,count(s.seat)::int occupied,
      count(s.seat) FILTER (WHERE s.player IS NULL)::int bots FROM online_rooms r JOIN online_seats s ON s.room=r.id
      WHERE r.state='waiting' AND r.origin='custom' AND r.listed GROUP BY r.id HAVING count(*)<4 ORDER BY r.created_at LIMIT 100`);
    return { games: mine.rows, open: open.rows, enabled: this.enabled };
  }

  private async addSeat(
    db: Db,
    room: Room,
    actor: string | null,
    ready: boolean,
  ) {
    const seats = await seatsOf(db, room.id);
    if (actor && seats.some((s) => s.player === actor)) return;
    const free = [0, 1, 2, 3].filter((i) => !seats.some((s) => s.seat === i));
    if (!free.length || room.state !== "waiting")
      return fail("Table is full or has started", 409);
    const seat =
      room.origin === "ranked" ? free[randomInt(free.length)] : free[0];
    await db.query(
      "INSERT INTO online_seats(room,seat,player,ready,live_busy) VALUES ($1,$2,$3,$4,$5)",
      [room.id, seat, actor, ready, room.pace === "live"],
    );
  }

  async create(
    db: Db,
    actor: Player,
    f: Format,
    origin: Room["origin"],
    parent: string | null = null,
  ) {
    if (!this.enabled[origin])
      return fail("New tables are currently paused", 503);
    if (origin === "ranked" && !actor.user_id)
      return fail("Sign in to play Ranked", 403);
    const id = randomUUID();
    const room = (
      await db.query<Room>(
        `INSERT INTO online_rooms(id,host,variant,length,pace,origin,invite,parent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          id,
          actor.id,
          f.variant,
          f.length,
          f.pace,
          origin,
          origin === "custom" ? newToken() : null,
          parent,
        ],
      )
    ).rows[0]!;
    await this.addSeat(db, room, actor.id, true);
    return { id };
  }

  async queue(db: Db, actor: Player, f: Format, mode: string) {
    if (mode !== "friendly" && mode !== "ranked") return fail("Unknown queue");
    if (!this.enabled[mode]) return fail("Queue is paused", 503);
    if (mode === "ranked" && !actor.user_id)
      return fail("Sign in to play Ranked", 403);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "queue/" + mode + "/" + poolKey(f),
    ]);
    const found = await db.query<{ id: string }>(
      `SELECT r.id FROM online_rooms r
      WHERE r.origin=$1 AND r.variant=$2 AND r.length=$3 AND r.pace=$4 AND r.state='waiting'
      AND (SELECT count(*) FROM online_seats s WHERE s.room=r.id)<4
      AND ($1 <> 'ranked' OR NOT EXISTS (
        SELECT 1 FROM online_seats s LEFT JOIN online_ratings a ON a.player=s.player AND a.pool=$6
        LEFT JOIN online_ratings b ON b.player=$5 AND b.pool=$6 WHERE s.room=r.id
        AND abs(coalesce(a.mu,25)-coalesce(b.mu,25))>5+extract(epoch FROM now()-r.created_at)/30))
      ORDER BY EXISTS(SELECT 1 FROM online_seats s WHERE s.room=r.id AND s.player=$5) DESC,r.created_at LIMIT 1 FOR UPDATE`,
      [mode, f.variant, f.length, f.pace, actor.id, poolKey(f)],
    );
    if (!found.rows.length) return this.create(db, actor, f, mode);
    const room = await lockRoom(db, found.rows[0]!.id);
    await this.addSeat(db, room, actor.id, true);
    const seats = await seatsOf(db, room.id);
    if (seats.length === 4) await this.start(db, room, seats);
    return { id: room.id };
  }

  async join(db: Db, actor: Player, id: unknown, invite: unknown) {
    const row =
      typeof invite === "string" && invite.length <= 64
        ? (
            await db.query<{ id: string }>(
              "SELECT id FROM online_rooms WHERE invite=$1",
              [invite],
            )
          ).rows[0]
        : { id: uuid(id) };
    if (!row) return fail("Invite expired or unavailable", 404);
    const room = await lockRoom(db, row.id);
    if (
      room.origin !== "custom" ||
      (!room.listed && invite !== room.invite) ||
      room.state !== "waiting"
    )
      return fail("Room unavailable", 404);
    await this.addSeat(db, room, actor.id, false);
    return { id: room.id };
  }

  private async start(db: Db, room: Room, seats: Seat[]) {
    if (seats.length !== 4 || seats.some((s) => !s.ready))
      return fail("Four ready seats are required", 409);
    if (room.origin === "ranked") {
      const n = await db.query(
        "SELECT count(*)::int AS n FROM online_seats s JOIN online_players p ON s.player=p.id WHERE s.room=$1 AND p.user_id IS NOT NULL",
        [room.id],
      );
      if (n.rows[0].n !== 4) return fail("Ranked needs four accounts", 409);
    }
    room.state = "playing";
    room.journal = newJournal();
    await db.query(
      "UPDATE online_rooms SET state='playing',listed=false,invite=NULL WHERE id=$1",
      [room.id],
    );
    await db.query("UPDATE online_seats SET seen_at=now() WHERE room=$1", [
      room.id,
    ]);
    await this.advance(db, room, await seatsOf(db, room.id), Date.now());
  }

  async roomAction(
    db: Db,
    actor: Player,
    id: string,
    kind: unknown,
    index?: unknown,
  ) {
    const room = await lockRoom(db, id);
    const seats = await seatsOf(db, id);
    const me = member(seats, actor.id);
    if (kind === "rematch" && room.state === "finished") {
      const next = await db.query<{ id: string }>(
        "SELECT id FROM online_rooms WHERE parent=$1 AND state='waiting'",
        [id],
      );
      if (next.rows.length) {
        const r = await lockRoom(db, next.rows[0]!.id);
        await this.addSeat(db, r, actor.id, true);
        return { id: r.id };
      }
      await db.query("UPDATE online_rooms SET parent=NULL WHERE parent=$1", [
        id,
      ]);
      return this.create(db, actor, room, "custom", id);
    }
    if (room.state === "playing" && kind === "leave") {
      if (room.pace === "correspondence" && room.origin !== "ranked") {
        // A deliberate withdrawal ends the untimed table without awarding ratings.
        await db.query(
          "UPDATE online_rooms SET state='closed',due_at=NULL WHERE id=$1",
          [id],
        );
        await db.query(
          "UPDATE online_seats SET live_busy=false WHERE room=$1",
          [id],
        );
      } else {
        await db.query(
          "UPDATE online_seats SET covered=true WHERE room=$1 AND seat=$2",
          [id, me.seat],
        );
        await this.advance(db, room, await seatsOf(db, id), Date.now());
      }
      return { id };
    }
    if (kind === "start" && room.state === "playing") return { id };
    if (room.state !== "waiting")
      return fail("Room has already started or closed", 409);
    if (kind === "leave") {
      await db.query("DELETE FROM online_seats WHERE room=$1 AND player=$2", [
        id,
        actor.id,
      ]);
      const next = seats.find((s) => s.player && s.player !== actor.id);
      if (!next)
        await db.query(
          "UPDATE online_rooms SET state='closed',invite=NULL,listed=false WHERE id=$1",
          [id],
        );
      else if (room.host === actor.id)
        await db.query("UPDATE online_rooms SET host=$2 WHERE id=$1", [
          id,
          next.player,
        ]);
    } else if (kind === "ready") {
      await db.query(
        "UPDATE online_seats SET ready=true WHERE room=$1 AND player=$2",
        [id, actor.id],
      );
    } else {
      if (room.host !== actor.id || room.origin !== "custom")
        return fail("Host controls only", 403);
      if (kind === "start") await this.start(db, room, seats);
      else if (kind === "bot") await this.addSeat(db, room, null, true);
      else if (kind === "removeBot")
        await db.query(
          "DELETE FROM online_seats WHERE room=$1 AND seat=$2 AND player IS NULL",
          [id, Number.isInteger(index) ? index : -1],
        );
      else if (kind === "list" || kind === "unlist")
        await db.query("UPDATE online_rooms SET listed=$2 WHERE id=$1", [
          id,
          kind === "list",
        ]);
      else return fail("Unknown room action");
    }
    return { id };
  }

  async snapshot(db: Db, actor: string, id: string) {
    const room = await lockRoom(db, id);
    const seats = await seatsOf(db, id);
    const me = member(seats, actor);
    const summary = {
      id,
      variant: room.variant,
      length: room.length,
      pace: room.pace,
      origin: room.origin,
      state: room.state,
      host: room.host === actor,
      listed: room.listed,
      invite: room.host === actor ? room.invite : null,
      seat: me.seat,
      seats: seats.map((s) => ({
        seat: s.seat,
        name: s.name,
        bot: s.player === null,
        covered: s.covered,
        ready: s.ready,
      })),
    };
    if (!room.journal || room.state === "closed") return summary;
    if (room.state === "finished") {
      const ratings = await db.query(
        "SELECT s.seat,c.before_rating,c.after_rating FROM online_rating_changes c JOIN online_seats s ON s.room=c.room AND s.player=c.player WHERE c.room=$1 ORDER BY s.seat",
        [id],
      );
      return { ...summary, result: room.result, ratings: ratings.rows };
    }
    const engine = this.engine(room);
    const choices =
      room.journal.answers[me.seat] || me.covered
        ? []
        : engine.choices[me.seat]!;
    return {
      ...summary,
      view: engine.view(me.seat),
      revision: room.journal.steps.length,
      choices,
      claimTile: choices.length ? engine.claimTile : null,
      deadline: room.journal.deadline,
    };
  }

  async review(db: Db, actor: string, id: string) {
    const room = await lockRoom(db, id);
    const me = member(await seatsOf(db, id), actor);
    if (room.state !== "finished")
      return fail("Review opens after final settlement", 409);
    const engine = new TableEngine(room, room.journal!, true);
    const { events } = engine.game;
    const version = room.variant === "riichi" ? 2 : 3;
    const extra = room.variant === "riichi" ? {} : { variant: room.variant };
    const hands: number[] = [];
    let hand = -1;
    for (const event of events) {
      if (event.type === "hand-start") hand++;
      hands.push(hand);
    }
    const positions = engine.positions.flatMap((p, index) =>
      p.view.seat === me.seat
        ? [
            {
              kind: p.kind,
              context: p.context,
              view: p.view,
              action: p.action,
              controller: p.by,
              decisionIndex: index,
              eventSequence: p.event,
              handIndex: hands[p.event],
              informationMode: "player-perspective",
              engineVersion: version,
              ...extra,
            },
          ]
        : [],
    );
    const result = engine.result!;
    return {
      humanSeat: me.seat,
      events,
      chiHints: engine.chiHints,
      review: {
        schemaVersion: 1,
        engineVersion: version,
        ...extra,
        complete: true,
        consumedDecisions: engine.positions.length,
        positions,
        moments: [],
      },
      result: {
        scores: result.scores,
        settlement: result.settlement,
        handsPlayed: result.handsPlayed,
      },
    };
  }

  async action(
    db: Db,
    actor: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const token = uuid(body.actionId);
    if (
      body.version !== 1 ||
      !Number.isSafeInteger(body.revision) ||
      !Number.isInteger(body.choice)
    )
      return fail("Invalid decision envelope");
    const room = await lockRoom(db, id);
    let seats = await seatsOf(db, id);
    const me = member(seats, actor);
    const receipt = (
      await db.query(
        "SELECT revision,choice FROM online_receipts WHERE room=$1 AND player=$2 AND action_id=$3",
        [id, actor, token],
      )
    ).rows[0];
    if (receipt) {
      if (receipt.revision !== body.revision || receipt.choice !== body.choice)
        return fail("Action ID reused", 409);
      return { accepted: receipt.revision };
    }
    const j = room.journal;
    if (
      room.state !== "playing" ||
      !j ||
      me.covered ||
      j.steps.length !== body.revision ||
      j.answers[me.seat]
    )
      return fail("Decision has changed", 409);
    const now = Date.now();
    if (j.deadline !== null && now >= j.deadline)
      return fail("Decision expired", 409);
    const action = this.engine(room).choices[me.seat]?.[body.choice as number];
    if (!action) return fail("Unavailable choice", 422);
    j.answers[me.seat] = { action, by: "human" };
    await db.query("INSERT INTO online_receipts VALUES($1,$2,$3,$4,$5)", [
      id,
      actor,
      token,
      body.revision,
      body.choice,
    ]);
    await db.query(
      "UPDATE online_seats SET idle_at=NULL,seen_at=now() WHERE room=$1 AND player=$2",
      [id, actor],
    );
    seats = await seatsOf(db, id);
    await this.advance(db, room, seats, now);
    return { accepted: body.revision };
  }

  async presence(db: Db, actor: string, id: string, reclaim: boolean) {
    const room = await lockRoom(db, id);
    const me = member(await seatsOf(db, id), actor);
    if (room.state === "playing" && room.pace === "live") {
      await db.query(
        "UPDATE online_seats SET seen_at=now(), covered=CASE WHEN $3 THEN false ELSE covered END, idle_at=CASE WHEN $3 THEN NULL ELSE idle_at END WHERE room=$1 AND player=$2",
        [id, actor, reclaim],
      );
      if (reclaim && me.covered)
        await this.advance(db, room, await seatsOf(db, id), Date.now());
    }
    return { id };
  }

  private async finish(db: Db, room: Room, seats: Seat[], result: GameResult) {
    if (room.origin === "ranked") {
      const pool = poolKey(room);
      const old = [];
      for (const s of [...seats].sort((a, b) =>
        a.player!.localeCompare(b.player!),
      )) {
        await db.query(
          "INSERT INTO online_ratings VALUES($1,$2,25,$3) ON CONFLICT DO NOTHING",
          [s.player, pool, 25 / 3],
        );
        const r = (
          await db.query(
            "SELECT mu,sigma FROM online_ratings WHERE player=$1 AND pool=$2 FOR UPDATE",
            [s.player, pool],
          )
        ).rows[0]!;
        old[s.seat] = rating({ mu: r.mu, sigma: r.sigma });
      }
      const ranks = seats.map(
        (s) => result.settlement.find((x) => x.seat === s.seat)!.rank,
      );
      const updated = rate(
        old.map((r) => [r]),
        { rank: ranks },
      );
      for (const s of seats) {
        const prev = old[s.seat]!,
          next = updated[s.seat]![0]!;
        const mu = s.bot_played ? Math.min(prev.mu, next.mu) : next.mu;
        await db.query(
          "UPDATE online_ratings SET mu=$3,sigma=$4 WHERE player=$1 AND pool=$2",
          [s.player, pool, mu, next.sigma],
        );
        await db.query(
          "INSERT INTO online_rating_changes VALUES($1,$2,$3,$4,$5)",
          [
            room.id,
            s.player,
            pool,
            Math.round(prev.mu * 60),
            Math.round(mu * 60),
          ],
        );
      }
    }
    await db.query("UPDATE online_seats SET live_busy=false WHERE room=$1", [
      room.id,
    ]);
    await db.query(
      "UPDATE online_rooms SET state='finished',result=$2,due_at=NULL,journal=$3 WHERE id=$1",
      [room.id, JSON.stringify(result.settlement), room.journal],
    );
    this.cache.delete(room.id);
  }

  private async advance(db: Db, room: Room, seats: Seat[], now: number) {
    const j = room.journal!;
    const engine = this.engine(room);
    const live = room.pace === "live";
    for (const s of seats) {
      if (
        live &&
        s.player &&
        !s.covered &&
        Math.min(s.seen_at.getTime(), s.idle_at?.getTime() ?? Infinity) +
          60000 <=
          now
      ) {
        s.covered = true;
        await db.query(
          "UPDATE online_seats SET covered=true WHERE room=$1 AND seat=$2",
          [room.id, s.seat],
        );
      }
    }
    // Yield after a short burst when an entire table is covered by bots.
    for (let moves = 0; moves < 8 && !engine.result; moves++) {
      if (live && j.deadline === null)
        j.deadline = now + (engine.kind === "call" ? 5000 : 20000);
      for (const s of seats) {
        if (!engine.choices[s.seat]?.length || j.answers[s.seat]) continue;
        const bot = !s.player || s.covered;
        if (!bot && (j.deadline === null || j.deadline > now)) continue;
        j.answers[s.seat] = {
          action: engine.automatic(s.seat, bot),
          by: bot ? "bot" : "clock",
        };
        if (s.player && bot && !s.bot_played) {
          s.bot_played = true;
          await db.query(
            "UPDATE online_seats SET bot_played=true WHERE room=$1 AND seat=$2",
            [room.id, s.seat],
          );
        } else if (s.player && !bot && !s.idle_at) {
          s.idle_at = new Date(now);
          await db.query(
            "UPDATE online_seats SET idle_at=$3 WHERE room=$1 AND seat=$2",
            [room.id, s.seat, s.idle_at],
          );
        }
      }
      if (!engine.canAdvance(j.answers)) break;
      engine.commit(j);
      j.deadline = null;
    }
    if (engine.result) {
      await this.finish(db, room, seats, engine.result);
      return;
    }
    const pending = seats.filter(
      (s) => engine.choices[s.seat]!.length && !j.answers[s.seat],
    );
    const next = Math.min(
      j.deadline ?? Infinity,
      ...seats
        .filter((s) => live && s.player && !s.covered)
        .map(
          (s) =>
            Math.min(s.seen_at.getTime(), s.idle_at?.getTime() ?? Infinity) +
            60000,
        ),
    );
    const due =
      pending.some((s) => !s.player || s.covered) ||
      (live && j.deadline === null)
        ? new Date(now)
        : Number.isFinite(next)
          ? new Date(next)
          : null;
    await db.query("UPDATE online_rooms SET journal=$2,due_at=$3 WHERE id=$1", [
      room.id,
      { ...j, pending: pending.map((s) => s.seat) },
      due,
    ]);
  }

  async tick() {
    return this.transaction(async (db) => {
      const batch = await db.query<Room>(
        "SELECT * FROM online_rooms WHERE state='playing' AND due_at<=clock_timestamp() ORDER BY due_at LIMIT 4 FOR UPDATE SKIP LOCKED",
      );
      for (const room of batch.rows)
        await this.advance(db, room, await seatsOf(db, room.id), Date.now());
    });
  }
}

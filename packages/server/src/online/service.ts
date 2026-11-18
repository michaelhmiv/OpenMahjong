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
  controller: string | null;
  generation: number;
  end_requested: boolean;
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
  rating_void_reason: string | null;
  journal: Journal | null;
  result: GameResult["settlement"] | null;
};
type Db = PoolClient;
async function dbTime(db: Db): Promise<number> {
  return (
    await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")
  ).rows[0]!.now.getTime();
}
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
    typeof b.variant !== "string" ||
    !["riichi", "hong-kong", "mcr", "taiwanese"].includes(b.variant) ||
    typeof b.length !== "string" ||
    !["east", "south", "full"].includes(b.length) ||
    (b.variant === "riichi" && b.length === "full") ||
    typeof b.pace !== "string" ||
    !["live", "correspondence"].includes(b.pace)
  )
    return fail("Invalid table settings");
  return { variant: b.variant, length: b.length, pace: b.pace } as Format;
}
function poolKey(f: Format) {
  return [f.variant, f.length, f.pace, "pl-v1"].join("/");
}
const seatQuery = `SELECT s.seat,s.player,s.ready,s.covered,s.bot_played,s.seen_at,s.idle_at,s.controller,s.generation,s.end_requested,coalesce(p.name,'Bot') AS name FROM online_seats s LEFT JOIN online_players p ON p.id=s.player WHERE room=$1 ORDER BY seat`;
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
async function lobbyLock(db: Db) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('openmahjong:lobby',0))",
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
      engine = new TableEngine(room, j, false, true);
      if (this.cache.size >= 64)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(room.id, engine);
    } else engine.attach(j);
    return engine;
  }

  async list(actor: string) {
    const mine = await this.db.query(
      `SELECT r.id,r.variant,r.length,r.pace,r.origin,r.state,s.seat,s.ready,
      coalesce(r.state='playing' AND NOT s.covered AND jsonb_array_length(s.projection->'choices')>0,false) AS "yourMove"
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
    await lobbyLock(db);
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

  async queue(
    db: Db,
    actor: Player,
    f: Format,
    mode: string,
    acceptCustom = false,
  ) {
    if (mode !== "friendly" && mode !== "ranked") return fail("Unknown queue");
    if (!this.enabled[mode]) return fail("Queue is paused", 503);
    if (mode === "ranked" && !actor.user_id)
      return fail("Sign in to play Ranked", 403);
    await lobbyLock(db);
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
    const id = found.rows[0]?.id ?? (await this.create(db, actor, f, mode)).id;
    const room = await lockRoom(db, id);
    await this.addSeat(db, room, actor.id, true);
    if (mode === "friendly")
      await db.query(
        "UPDATE online_seats SET accept_custom=$3 WHERE room=$1 AND player=$2",
        [room.id, actor.id, acceptCustom],
      );
    const seats = await seatsOf(db, room.id);
    if (seats.length === 4) await this.start(db, room, seats);
    return { id: room.id };
  }

  async join(db: Db, actor: Player, id: unknown, invite: unknown) {
    await lobbyLock(db);
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
    await this.advance(db, room, await seatsOf(db, room.id), await dbTime(db));
  }

  async roomAction(
    db: Db,
    actor: Player,
    id: string,
    kind: unknown,
    index?: unknown,
  ) {
    await lobbyLock(db);
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
    if (
      room.state === "playing" &&
      kind === "end" &&
      room.pace === "correspondence"
    ) {
      await db.query(
        "UPDATE online_seats SET end_requested=true WHERE room=$1 AND player=$2",
        [id, actor.id],
      );
      if (
        seats.every(
          (s) => !s.player || s.end_requested || s.player === actor.id,
        )
      ) {
        await db.query(
          "UPDATE online_rooms SET state='closed',due_at=NULL WHERE id=$1",
          [id],
        );
      }
      return { id };
    }
    if (room.state === "playing" && kind === "leave") {
      // A deliberate withdrawal keeps the other three seats playing, even at an untimed table.
      await db.query(
        "UPDATE online_seats SET covered=true,generation=generation+1 WHERE room=$1 AND seat=$2",
        [id, me.seat],
      );
      await this.advance(db, room, await seatsOf(db, id), await dbTime(db));
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

  async snapshot(db: Db, actor: string, id: string, client?: string) {
    const room =
      (
        await db.query<Room>(
          `SELECT id,variant,length,pace,origin,state,host,listed,invite,result,rating_void_reason
      FROM online_rooms WHERE id=$1 FOR SHARE`,
          [uuid(id)],
        )
      ).rows[0] ?? fail("Table unavailable", 404);
    const seats = await seatsOf(db, id);
    if (!seats.some((s) => s.player === actor)) {
      const moved = (
        await db.query(
          "SELECT destination FROM online_transfers WHERE source=$1 AND player=$2",
          [id, actor],
        )
      ).rows[0];
      if (moved) return { redirect: moved.destination };
    }
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
      generation: me.generation,
      controlling: !me.controller || me.controller === client,
      seats: seats.map((s) => ({
        seat: s.seat,
        name: s.name,
        bot: s.player === null,
        covered: s.covered,
        ready: s.ready,
        endRequested: s.end_requested,
        coverAt:
          room.state === "playing" &&
          room.pace === "live" &&
          s.player &&
          !s.covered &&
          Date.now() - s.seen_at.getTime() > 15000
            ? s.seen_at.getTime() + 60000
            : null,
      })),
    };
    if (room.state === "waiting" && room.origin === "friendly") {
      const offer = (
        await db.query(
          `SELECT o.id,o.expires_at,r.variant,r.length,r.pace,count(s.seat)::int occupied,
        count(s.seat) FILTER (WHERE s.player IS NULL)::int bots
        FROM online_offers o JOIN online_rooms r ON r.id=o.room JOIN online_seats s ON s.room=r.id
        WHERE o.player=$1 AND o.ticket=$2 AND o.expires_at>clock_timestamp() AND r.listed AND r.state='waiting'
        GROUP BY o.id,r.id HAVING count(s.seat)<4 ORDER BY o.expires_at LIMIT 1`,
          [actor, id],
        )
      ).rows[0];
      return { ...summary, offer: offer ?? null };
    }
    if (room.state === "waiting" || room.state === "closed") return summary;
    if (room.state === "finished") {
      const ratings = await db.query(
        "SELECT s.seat,c.before_rating,c.after_rating FROM online_rating_changes c JOIN online_seats s ON s.room=c.room AND s.player=c.player WHERE c.room=$1 ORDER BY s.seat",
        [id],
      );
      return {
        ...summary,
        result: room.result,
        ratings: ratings.rows,
        ratingVoid: room.rating_void_reason,
      };
    }
    const row = (
      await db.query(
        "SELECT projection FROM online_seats WHERE room=$1 AND player=$2",
        [id, actor],
      )
    ).rows[0];
    // Rows made by an earlier worker acquire a delivery projection on their next write.
    const data = row?.projection ?? this.project(await lockRoom(db, id), me);
    return {
      ...summary,
      ...data,
      choices: summary.controlling ? data.choices : [],
    };
  }

  private project(room: Room, seat: Seat, engine = this.engine(room)) {
    const j = room.journal!;
    const choices =
      j.answers[seat.seat] || seat.covered ? [] : engine.choices[seat.seat]!;
    return {
      view: engine.view(seat.seat),
      revision: j.steps.length,
      choices,
      claimTile: choices.length ? engine.claimTile : null,
      deadline: j.deadline,
      handResult: j.handResult ?? null,
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
      (me.controller !== null &&
        (body.client !== me.controller || body.generation !== me.generation)) ||
      j.steps.length !== body.revision ||
      j.answers[me.seat]
    )
      return fail("Decision has changed", 409);
    const now = await dbTime(db);
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

  async presence(
    db: Db,
    actor: string,
    id: string,
    reclaim: boolean,
    client?: string,
    claimControl = false,
  ) {
    const room = await lockRoom(db, id);
    const seats = await seatsOf(db, id);
    if (!seats.some((s) => s.player === actor)) {
      const transfer = (
        await db.query(
          "SELECT destination FROM online_transfers WHERE source=$1 AND player=$2",
          [id, actor],
        )
      ).rows[0];
      if (transfer) return { id: transfer.destination };
    }
    const me = member(seats, actor);
    if (client) uuid(client);
    if (claimControl && client && me.controller !== client) {
      await db.query(
        "UPDATE online_seats SET controller=$3,generation=generation+1 WHERE room=$1 AND player=$2",
        [id, actor, client],
      );
    } else if (me.controller && me.controller !== client) return { id };
    if (
      room.pace === "live" &&
      (room.state === "playing" || room.state === "waiting")
    ) {
      await db.query(
        "UPDATE online_seats SET seen_at=clock_timestamp(),covered=CASE WHEN $3 THEN false ELSE covered END,idle_at=CASE WHEN $3 THEN NULL ELSE idle_at END WHERE room=$1 AND player=$2",
        [id, actor, reclaim],
      );
      if (reclaim && me.covered)
        await this.advance(db, room, await seatsOf(db, id), await dbTime(db));
    }
    return { id };
  }

  private async finish(db: Db, room: Room, seats: Seat[], result: GameResult) {
    if (room.origin === "ranked" && !room.rating_void_reason) {
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
          "UPDATE online_seats SET covered=true,generation=generation+1 WHERE room=$1 AND seat=$2",
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
    const delivery = seats.map((s) => this.project(room, s, engine));
    await db.query(
      `UPDATE online_seats SET projection = payload.value
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS payload(value,ord)
      WHERE room=$1 AND seat=payload.ord-1`,
      [room.id, JSON.stringify(delivery)],
    );
    await db.query("UPDATE online_rooms SET journal=$2,due_at=$3 WHERE id=$1", [
      room.id,
      { ...j, pending: pending.map((s) => s.seat) },
      due,
    ]);
  }

  private async moveQueuedPlayer(db: Db, from: Room, to: Room, player: string) {
    await db.query("DELETE FROM online_seats WHERE room=$1 AND player=$2", [
      from.id,
      player,
    ]);
    await this.addSeat(db, to, player, to.origin !== "custom");
    await db.query(
      `INSERT INTO online_transfers VALUES($1,$2,$3) ON CONFLICT(source,player)
      DO UPDATE SET destination=EXCLUDED.destination`,
      [from.id, player, to.id],
    );
    const remaining = (await seatsOf(db, from.id)).filter((s) => s.player);
    await db.query("UPDATE online_rooms SET host=$2,state=$3 WHERE id=$1", [
      from.id,
      remaining[0]?.player ?? null,
      remaining.length ? "waiting" : "closed",
    ]);
    const seats = await seatsOf(db, to.id);
    if (to.origin !== "custom" && seats.length === 4)
      await this.start(db, to, seats);
  }

  async answerOffer(db: Db, actor: string, id: string, accept: boolean) {
    await lobbyLock(db);
    const offer = (
      await db.query(
        "SELECT * FROM online_offers WHERE id=$1 AND player=$2 AND expires_at>clock_timestamp() FOR UPDATE",
        [uuid(id), actor],
      )
    ).rows[0];
    if (!offer) return fail("This offer has expired", 409);
    const from = await lockRoom(db, offer.ticket),
      to = await lockRoom(db, offer.room);
    member(await seatsOf(db, from.id), actor);
    if (from.state !== "waiting" || to.state !== "waiting" || !to.listed)
      return fail("This offer has closed", 409);
    if (accept) await this.moveQueuedPlayer(db, from, to, actor);
    await db.query("UPDATE online_offers SET expires_at=now() WHERE id=$1", [
      id,
    ]);
    return { id: accept ? to.id : from.id };
  }

  async matchWaiting() {
    await this.transaction(async (db) => {
      await lobbyLock(db);
      // Remove stale live queue entries. Untimed memberships persist until explicit withdrawal.
      const stale =
        await db.query(`DELETE FROM online_seats s USING online_rooms r
        WHERE r.id=s.room AND r.state='waiting' AND r.origin IN ('friendly','ranked') AND r.pace='live'
        AND s.seen_at < clock_timestamp()-interval '2 minutes' RETURNING s.room`);
      for (const id of new Set(stale.rows.map((r) => r.room))) {
        const first = (await seatsOf(db, id))[0];
        await db.query("UPDATE online_rooms SET host=$2,state=$3 WHERE id=$1", [
          id,
          first?.player ?? null,
          first ? "waiting" : "closed",
        ]);
      }
      if (this.enabled.friendly && this.enabled.custom) {
        const offers =
          await db.query(`SELECT DISTINCT ON(s.player) s.player,s.room AS ticket,r.id AS target
          FROM online_seats s JOIN online_rooms q ON q.id=s.room JOIN online_rooms r
          ON (q.variant,q.length,q.pace)=(r.variant,r.length,r.pace)
          WHERE q.origin='friendly' AND q.state='waiting' AND s.accept_custom
          AND r.origin='custom' AND r.listed AND r.state='waiting' AND (SELECT count(*) FROM online_seats x WHERE x.room=r.id)<4
          AND NOT EXISTS(SELECT 1 FROM online_seats x WHERE x.room=r.id AND x.player=s.player)
          AND NOT EXISTS(SELECT 1 FROM online_offers o WHERE o.ticket=s.room AND o.player=s.player AND (o.room=r.id OR o.expires_at>now()))
          ORDER BY s.player,r.created_at LIMIT 32`);
        for (const o of offers.rows)
          await db.query(
            "INSERT INTO online_offers VALUES($1,$2,$3,$4,clock_timestamp()+interval '45 seconds') ON CONFLICT DO NOTHING",
            [randomUUID(), o.player, o.ticket, o.target],
          );
      }
      if (!this.enabled.ranked) return;
      // Revisit already-waiting players as their allowable skill range widens.
      const pair = (
        await db.query(`SELECT src.id AS source,dst.id AS dest,s.player
        FROM online_rooms src JOIN online_seats s ON s.room=src.id JOIN online_rooms dst ON
        (src.variant,src.length,src.pace)=(dst.variant,dst.length,dst.pace) AND (dst.created_at,dst.id)<(src.created_at,src.id)
        WHERE src.origin='ranked' AND dst.origin='ranked' AND src.state='waiting' AND dst.state='waiting'
        AND (SELECT count(*) FROM online_seats x WHERE x.room=dst.id)<4 AND NOT EXISTS (
          SELECT 1 FROM online_seats x LEFT JOIN online_ratings a ON a.player=x.player AND a.pool=concat_ws('/',src.variant,src.length,src.pace,'pl-v1')
          LEFT JOIN online_ratings b ON b.player=s.player AND b.pool=concat_ws('/',src.variant,src.length,src.pace,'pl-v1') WHERE x.room=dst.id
          AND (x.player=s.player OR abs(coalesce(a.mu,25)-coalesce(b.mu,25))>5+extract(epoch FROM now()-dst.created_at)/30))
        ORDER BY dst.created_at,src.created_at LIMIT 1`)
      ).rows[0];
      if (pair)
        await this.moveQueuedPlayer(
          db,
          await lockRoom(db, pair.source),
          await lockRoom(db, pair.dest),
          pair.player,
        );
    });
  }

  /** A shared heartbeat distinguishes a platform outage from one absent player. */
  async heartbeat() {
    await this.transaction(async (db) => {
      await db.query(
        "INSERT INTO online_clock VALUES(true,clock_timestamp()) ON CONFLICT DO NOTHING",
      );
      const prior = (
        await db.query(
          "SELECT last_tick FROM online_clock WHERE singleton FOR UPDATE",
        )
      ).rows[0]!.last_tick as Date;
      const now = await dbTime(db);
      if (now - prior.getTime() > 15000)
        await db.query(
          `UPDATE online_rooms SET rating_void_reason='Service interruption'
        WHERE state='playing' AND origin='ranked' AND pace='live' AND created_at<=$1 AND rating_void_reason IS NULL`,
          [prior],
        );
      await db.query(
        "UPDATE online_clock SET last_tick=clock_timestamp() WHERE singleton",
      );
    });
  }

  async tick() {
    return this.transaction(async (db) => {
      const batch = await db.query<Room>(
        "SELECT * FROM online_rooms WHERE state='playing' AND due_at<=clock_timestamp() ORDER BY due_at LIMIT 4 FOR UPDATE SKIP LOCKED",
      );
      for (const room of batch.rows)
        await this.advance(
          db,
          room,
          await seatsOf(db, room.id),
          await dbTime(db),
        );
    });
  }
}

/**
 * Postgres Store implementation: thin SQL over the migrations in
 * `packages/server/migrations/`. All policy lives in the HTTP layer;
 * this file only moves rows. Sums are cast in SQL so the `pg` driver
 * returns plain JS numbers (it returns strings for int8/numeric).
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  EMPTY_STATS,
  type GameRecord,
  type GameVariant,
  type GameSummary,
  type ResumeEntry,
  type Session,
  type StatsSums,
  type Store,
  type StoredTable, type TableWriteResult,
  type User,
} from "./store.js";

interface UserRow {
  id: string;
  google_sub: string;
  name: string;
  avatar_url: string | null;
  created_at: Date;
}

interface SessionRow {
  token_hash: string;
  user_id: string;
  csrf_token: string;
  expires_at: Date;
  created_at: Date;
}

interface GameRow {
  id: string;
  length: "east" | "south" | "full";
  variant?: GameVariant;
  placement: number;
  score: number;
  finished_at: Date;
  log: unknown;
  hands: number;
  riichi: number;
  deal_ins: number;
  hands_won: number;
  /** pg's default int8 parser returns a string; uploads are safe integers. */
  win_points: string | number;
}

export class PgStore implements Store {
  async listTables(userId: string): Promise<StoredTable[]> {
    const { rows } = await this.pool.query<StoredTable>(`SELECT id, revision, state FROM in_person_sessions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100`, [userId]);
    return rows;
  }
  async getTable(userId: string, id: string): Promise<StoredTable | null> {
    const { rows } = await this.pool.query<StoredTable>(`SELECT id, revision, state FROM in_person_sessions WHERE user_id=$1 AND id=$2`, [userId, id]);
    return rows[0] ?? null;
  }
  async writeTable(userId: string, id: string, expectedRevision: number, mutationId: string, digest: string, state: unknown): Promise<TableWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the owner for atomic creation limits and compare-and-swap,
      // including two devices concurrently creating the same session.
      await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
      const current = (await client.query<StoredTable>(`SELECT id, revision, state FROM in_person_sessions WHERE user_id=$1 AND id=$2`, [userId, id])).rows[0] ?? null;
      const previous = (await client.query<{ digest: string }>(`SELECT digest FROM in_person_writes WHERE user_id=$1 AND session_id=$2 AND mutation_id=$3`, [userId, id, mutationId])).rows[0];
      if (previous) { await client.query("COMMIT"); return { status: previous.digest === digest ? "duplicate" : "key-reused", entry: current }; }
      const count = (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM in_person_sessions WHERE user_id=$1`, [userId])).rows[0]!.count;
      const writes = (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM in_person_writes WHERE user_id=$1 AND session_id=$2`, [userId, id])).rows[0]!.count;
      if ((current?.revision ?? 0) !== expectedRevision || !current && count >= 100 || writes >= 10000) { await client.query("COMMIT"); return { status: "conflict", entry: current }; }
      const entry: StoredTable = { id, revision: expectedRevision + 1, state };
      await client.query(`INSERT INTO in_person_sessions(user_id,id,revision,state) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,id) DO UPDATE SET revision=EXCLUDED.revision,state=EXCLUDED.state,updated_at=now()`, [userId, id, entry.revision, JSON.stringify(state)]);
      await client.query(`INSERT INTO in_person_writes(user_id,session_id,mutation_id,digest,revision) VALUES($1,$2,$3,$4,$5)`, [userId, id, mutationId, digest, entry.revision]);
      await client.query("COMMIT"); return { status: "saved", entry };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  constructor(private readonly pool: Pool) {}

  async upsertUser(input: {
    googleSub: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<User> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (id, google_sub, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_sub) DO UPDATE
         SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id, google_sub, name, avatar_url, created_at`,
      [randomUUID(), input.googleSub, input.name, input.avatarUrl],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      googleSub: row.google_sub,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, google_sub, name, avatar_url, created_at
         FROM users WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      googleSub: row.google_sub,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
  }

  async deleteUser(id: string): Promise<void> {
    // Games, sessions, settings, and in-progress games reference users
    // ON DELETE CASCADE.
    await this.pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.tokenHash, input.userId, input.csrfToken, input.expiresAt],
    );
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT token_hash, user_id, csrf_token, expires_at, created_at
         FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [
      tokenHash,
    ]);
  }

  async insertGame(userId: string, game: GameRecord): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO games
         (user_id, id, length, placement, score, finished_at, log,
          hands, riichi, deal_ins, hands_won, win_points, variant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id, id) DO NOTHING`,
      [
        userId,
        game.id,
        game.length,
        game.placement,
        game.score,
        game.finishedAt,
        JSON.stringify(game.log),
        game.stats.hands,
        game.stats.riichi,
        game.stats.dealIns,
        game.stats.handsWon,
        game.stats.winPoints,
        game.variant ?? "riichi",
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async getGame(userId: string, gameId: string): Promise<GameRecord | null> {
    const { rows } = await this.pool.query<GameRow>(
      `SELECT id, variant, length, placement, score, finished_at, log,
              hands, riichi, deal_ins, hands_won, win_points
         FROM games WHERE user_id = $1 AND id = $2`,
      [userId, gameId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      ...(row.variant && row.variant !== "riichi" ? { variant: row.variant } : {}),
      length: row.length,
      placement: row.placement,
      score: row.score,
      finishedAt: row.finished_at,
      log: row.log,
      stats: {
        hands: row.hands,
        riichi: row.riichi,
        dealIns: row.deal_ins,
        handsWon: row.hands_won,
        winPoints: Number(row.win_points),
      },
    };
  }

  async listGames(userId: string, limit: number): Promise<GameSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      finished_at: Date;
      length: "east" | "south" | "full";
  variant?: GameVariant;
      placement: number;
      score: number;
    }>(
      `SELECT id, variant, finished_at, length, placement, score
         FROM games WHERE user_id = $1
        ORDER BY finished_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      ...(row.variant && row.variant !== "riichi" ? { variant: row.variant } : {}),
      finishedAt: row.finished_at,
      length: row.length,
      placement: row.placement,
      score: row.score,
    }));
  }

  async getStats(userId: string, variant: GameVariant = "riichi"): Promise<StatsSums> {
    const { rows } = await this.pool.query<StatsSums>(
      `SELECT
         COUNT(*)::float8                                AS games,
         COALESCE(SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END), 0)::float8
                                                         AS wins,
         COALESCE(SUM(placement), 0)::float8             AS "placementSum",
         COALESCE(SUM(hands), 0)::float8                 AS hands,
         COALESCE(SUM(riichi), 0)::float8                AS riichi,
         COALESCE(SUM(deal_ins), 0)::float8              AS "dealIns",
         COALESCE(SUM(hands_won), 0)::float8             AS "handsWon",
         COALESCE(SUM(win_points), 0)::float8            AS "winPoints"
       FROM games WHERE user_id = $1 AND variant = $2`,
      [userId, variant],
    );
    return rows[0] ?? { ...EMPTY_STATS };
  }

  async getSettings(userId: string): Promise<unknown> {
    const { rows } = await this.pool.query<{ settings: unknown }>(
      `SELECT settings FROM settings WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ? rows[0].settings : null;
  }

  async putSettings(userId: string, settings: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO settings (user_id, settings, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET settings = EXCLUDED.settings, updated_at = now()`,
      [userId, JSON.stringify(settings)],
    );
  }

  async getResume(userId: string): Promise<ResumeEntry | null> {
    const { rows } = await this.pool.query<{
      state: unknown;
      client_saved_at: Date;
    }>(
      `SELECT state, client_saved_at
         FROM in_progress_games WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return { state: row.state, clientSavedAt: row.client_saved_at };
  }

  async putResume(userId: string, entry: ResumeEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO in_progress_games (user_id, state, client_saved_at, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET state = EXCLUDED.state,
             client_saved_at = EXCLUDED.client_saved_at,
             updated_at = now()`,
      [userId, JSON.stringify(entry.state), entry.clientSavedAt],
    );
  }

  async deleteResume(userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM in_progress_games WHERE user_id = $1`,
      [userId],
    );
  }
}

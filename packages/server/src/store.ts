/**
 * Storage contract for the slice-2 backend.
 *
 * Handlers depend only on this interface. Two implementations ship:
 * `PgStore` (production, thin SQL over the migrations) and
 * `MemoryStore` (tests — CI has no live Postgres). All policy —
 * validation, idempotency, aggregation, CSRF, expiry — lives in the
 * HTTP layer and is exercised against the in-memory store.
 */

export interface User {
  id: string;
  googleSub: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface Session {
  tokenHash: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
  createdAt: Date;
}

export type GameLength = "east" | "south";

/** Per-game counters the client computes at game end (brief §4 T3). */
export interface GameStats {
  hands: number;
  riichi: number;
  dealIns: number;
  handsWon: number;
  winPoints: number;
}

export interface GameRecord {
  /** Client-generated uuid; uploads are idempotent on (user, id). */
  id: string;
  length: GameLength;
  placement: number;
  score: number;
  finishedAt: Date;
  /** The client's saved-game decision log, stored verbatim. */
  log: unknown;
  stats: GameStats;
}

export interface GameSummary {
  id: string;
  finishedAt: Date;
  length: GameLength;
  placement: number;
  score: number;
}

/** Raw sums across a user's games; the client derives rates (T3). */
export interface StatsSums {
  games: number;
  wins: number;
  placementSum: number;
  hands: number;
  riichi: number;
  dealIns: number;
  handsWon: number;
  winPoints: number;
}

export const EMPTY_STATS: StatsSums = {
  games: 0,
  wins: 0,
  placementSum: 0,
  hands: 0,
  riichi: 0,
  dealIns: 0,
  handsWon: 0,
  winPoints: 0,
};

export interface Store {
  /** Insert or refresh the user for a Google subject id. */
  upsertUser(input: {
    googleSub: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  /** Hard delete; games, settings, and sessions cascade (brief A3/B6). */
  deleteUser(id: string): Promise<void>;

  createSession(input: {
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;

  /** Returns true when inserted, false when the (user, id) row existed. */
  insertGame(userId: string, game: GameRecord): Promise<boolean>;
  getGame(userId: string, gameId: string): Promise<GameRecord | null>;
  listGames(userId: string, limit: number): Promise<GameSummary[]>;
  getStats(userId: string): Promise<StatsSums>;

  /** The stored settings JSON, or null when the user never synced. */
  getSettings(userId: string): Promise<unknown>;
  putSettings(userId: string, settings: unknown): Promise<void>;
}

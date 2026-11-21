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
  /** Google subject id; null for Apple-only accounts. */
  googleSub: string | null;
  /** Apple subject id; null for Google-only accounts. */
  appleSub: string | null;
  /** Email claim from Apple sign-in when provided; Google stores none. */
  email: string | null;
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

export type GameLength = "east" | "south" | "full";
export type GameVariant = "riichi" | "hong-kong" | "mcr" | "taiwanese";

/** Per-game counters the client computes at game end (brief §4 T3). */
export interface GameStats {
  hands: number;
  riichi: number;
  dealIns: number;
  handsWon: number;
  winPoints: number;
}

export interface GameRecord {
  variant?: GameVariant;
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
  variant?: GameVariant;
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
  listTables(userId: string): Promise<StoredTable[]>;
  getTable(userId: string, id: string): Promise<StoredTable | null>;
  writeTable(userId: string, id: string, expectedRevision: number, mutationId: string, digest: string, state: unknown): Promise<TableWriteResult>;
  /** Insert or refresh the user for a Google subject id. */
  upsertUser(input: {
    googleSub: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<User>;
  /**
   * Insert or refresh the user for an Apple subject id. Apple and
   * Google identities are separate accounts — never merged by email.
   * `name` is only supplied on a first authorization; when null an
   * existing name is kept, and a new user falls back to "Player".
   */
  upsertAppleUser(input: {
    appleSub: string;
    name: string | null;
    email: string | null;
  }): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  /** Hard delete; games, settings, resume, and sessions cascade (brief A3/B6). */
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
  getStats(userId: string, variant?: GameVariant): Promise<StatsSums>;

  /** The stored settings JSON, or null when the user never synced. */
  getSettings(userId: string): Promise<unknown>;
  putSettings(userId: string, settings: unknown): Promise<void>;

  /** The user's in-progress game, or null when none is stored. */
  getResume(userId: string): Promise<ResumeEntry | null>;
  putResume(userId: string, entry: ResumeEntry): Promise<void>;
  /** Idempotent: clearing a user with nothing stored is a no-op. */
  deleteResume(userId: string): Promise<void>;
}

export interface StoredTable { id: string; revision: number; state: unknown }
export type TableWriteResult = { status: "saved" | "duplicate" | "conflict" | "key-reused"; entry: StoredTable | null };

/** A signed-in player's unfinished game (ruling, 2026-11-16). */
export interface ResumeEntry {
  /** The client's serialized SavedGame, stored verbatim. */
  state: unknown;
  /** When the client saved the game; the newer copy wins at sign-in. */
  clientSavedAt: Date;
}

/**
 * In-memory Store implementation. Used by the test suite (CI has no
 * live Postgres) and as the boot fallback when DATABASE_URL is unset
 * (data then lives only as long as the process — see README).
 *
 * The maps are public so tests can assert directly on stored state
 * (e.g. that account deletion removed everything, brief B6).
 */

import { randomUUID } from "node:crypto";
import {
  EMPTY_STATS,
  type GameRecord,
  type GameSummary,
  type Session,
  type StatsSums,
  type Store,
  type User,
} from "./store.js";

export class MemoryStore implements Store {
  readonly users = new Map<string, User>();
  readonly usersByGoogleSub = new Map<string, string>();
  readonly sessions = new Map<string, Session>();
  readonly games = new Map<string, GameRecord>();
  readonly settings = new Map<string, unknown>();

  async upsertUser(input: {
    googleSub: string;
    name: string;
    avatarUrl: string | null;
  }): Promise<User> {
    const existingId = this.usersByGoogleSub.get(input.googleSub);
    if (existingId !== undefined) {
      const existing = this.users.get(existingId)!;
      const updated: User = {
        ...existing,
        name: input.name,
        avatarUrl: input.avatarUrl,
      };
      this.users.set(existingId, updated);
      return updated;
    }
    const user: User = {
      id: randomUUID(),
      googleSub: input.googleSub,
      name: input.name,
      avatarUrl: input.avatarUrl,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    this.usersByGoogleSub.set(input.googleSub, user.id);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    this.users.delete(id);
    this.usersByGoogleSub.delete(user.googleSub);
    for (const [hash, session] of this.sessions) {
      if (session.userId === id) this.sessions.delete(hash);
    }
    for (const key of this.games.keys()) {
      if (key.startsWith(`${id}:`)) this.games.delete(key);
    }
    this.settings.delete(id);
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<void> {
    this.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      userId: input.userId,
      csrfToken: input.csrfToken,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    });
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  private gameKey(userId: string, gameId: string): string {
    return `${userId}:${gameId}`;
  }

  async insertGame(userId: string, game: GameRecord): Promise<boolean> {
    const key = this.gameKey(userId, game.id);
    if (this.games.has(key)) return false;
    this.games.set(key, game);
    return true;
  }

  async getGame(userId: string, gameId: string): Promise<GameRecord | null> {
    return this.games.get(this.gameKey(userId, gameId)) ?? null;
  }

  async listGames(userId: string, limit: number): Promise<GameSummary[]> {
    const prefix = `${userId}:`;
    const mine: GameRecord[] = [];
    for (const [key, game] of this.games) {
      if (key.startsWith(prefix)) mine.push(game);
    }
    mine.sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
    return mine.slice(0, limit).map((g) => ({
      id: g.id,
      finishedAt: g.finishedAt,
      length: g.length,
      placement: g.placement,
      score: g.score,
    }));
  }

  async getStats(userId: string): Promise<StatsSums> {
    const prefix = `${userId}:`;
    const sums: StatsSums = { ...EMPTY_STATS };
    for (const [key, game] of this.games) {
      if (!key.startsWith(prefix)) continue;
      sums.games += 1;
      if (game.placement === 1) sums.wins += 1;
      sums.placementSum += game.placement;
      sums.hands += game.stats.hands;
      sums.riichi += game.stats.riichi;
      sums.dealIns += game.stats.dealIns;
      sums.handsWon += game.stats.handsWon;
      sums.winPoints += game.stats.winPoints;
    }
    return sums;
  }

  async getSettings(userId: string): Promise<unknown> {
    return this.settings.has(userId) ? this.settings.get(userId) : null;
  }

  async putSettings(userId: string, settings: unknown): Promise<void> {
    this.settings.set(userId, settings);
  }
}

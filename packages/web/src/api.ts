/**
 * Account API client (slice-2 brief §5): a thin wrapper over the
 * OpenMahjong backend. The backend is an enhancement layer only — the
 * game is fully playable with it down, offline, or slow — so every call
 * here resolves to a null/empty result on failure instead of throwing.
 * No tokens live in localStorage (brief §8): the session is the
 * server's httpOnly cookie, sent via credentials: "include"; mutations
 * carry the CSRF token issued by GET /api/me.
 */

import type { GameLength } from "@openmahjong/engine";
import type { SavedGame } from "./runner.js";
import type { Settings } from "./settings.js";

export const API_BASE = "https://api.openmahjong.app";
export const GOOGLE_START_URL = `${API_BASE}/auth/google/start`;

export interface ApiUser {
  readonly id?: string;
  readonly name: string;
  readonly avatarUrl?: string | null;
}

/** Per-game hand statistics for one finished game (see records.ts). */
export interface HandStats {
  readonly hands: number;
  readonly riichi: number;
  readonly dealIns: number;
  readonly handsWon: number;
  readonly winPoints: number;
}

/** A finished-game record, the POST /api/games (and /api/import) shape. */
export interface GameRecord {
  readonly id: string;
  readonly length: GameLength;
  readonly placement: number;
  readonly score: number;
  readonly finishedAt: string;
  /** The exact SavedGame decision log the runner persists; null only
   *  for legacy local-history lines that predate log capture. */
  readonly log: SavedGame | null;
  readonly stats: HandStats;
}

/** Aggregated sums behind the Stats screen and the landing strip. */
export interface StatsSums extends HandStats {
  readonly games: number;
  readonly wins: number;
  readonly placementSum: number;
  /** ISO date of the earliest recorded game, when the source knows it. */
  readonly since?: string | null;
}

export interface MeResult {
  readonly user: ApiUser | null;
  readonly csrfToken: string | null;
}

type FetchFn = typeof fetch;

async function request(
  path: string,
  init: RequestInit,
  fetchFn: FetchFn,
): Promise<unknown | null> {
  try {
    const res = await fetchFn(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function csrfHeaders(csrfToken: string | null): Record<string, string> {
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

/** GET /api/me — who is signed in, plus the CSRF token for mutations. */
export async function fetchMe(fetchFn: FetchFn = fetch): Promise<MeResult> {
  const body = (await request("/api/me", { method: "GET" }, fetchFn)) as
    | { user?: ApiUser | null; csrfToken?: string | null }
    | null;
  if (!body || !body.user) return { user: null, csrfToken: null };
  return { user: body.user, csrfToken: body.csrfToken ?? null };
}

/**
 * The boot-time auth probe. Never rejects: unreachable or broken API
 * means "signed out", and play is never blocked on it (brief §8).
 */
export async function initAuth(fetchFn: FetchFn = fetch): Promise<MeResult> {
  try {
    return await fetchMe(fetchFn);
  } catch {
    return { user: null, csrfToken: null };
  }
}

export async function fetchStats(fetchFn: FetchFn = fetch): Promise<StatsSums | null> {
  const body = (await request("/api/stats", { method: "GET" }, fetchFn)) as
    | { stats?: StatsSums }
    | StatsSums
    | null;
  if (!body) return null;
  const sums = (body as { stats?: StatsSums }).stats ?? (body as StatsSums);
  return typeof sums.games === "number" ? sums : null;
}

export async function fetchGames(fetchFn: FetchFn = fetch): Promise<GameRecord[] | null> {
  const body = (await request("/api/games", { method: "GET" }, fetchFn)) as
    | { games?: GameRecord[] }
    | GameRecord[]
    | null;
  if (!body) return null;
  const games = Array.isArray(body) ? body : body.games;
  return Array.isArray(games) ? games : null;
}

/** GET /api/settings — the account's synced settings, if any. */
export async function fetchServerSettings(
  fetchFn: FetchFn = fetch,
): Promise<Partial<Settings> | null> {
  const body = (await request("/api/settings", { method: "GET" }, fetchFn)) as
    | { settings?: Partial<Settings> }
    | Partial<Settings>
    | null;
  if (!body) return null;
  const settings = (body as { settings?: Partial<Settings> }).settings ??
    (body as Partial<Settings>);
  return settings && typeof settings === "object" ? settings : null;
}

export async function putSettings(
  settings: Settings,
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/api/settings",
    {
      method: "PUT",
      headers: csrfHeaders(csrfToken),
      body: JSON.stringify(settings),
    },
    fetchFn,
  );
  return body !== null;
}

export async function postGame(
  record: GameRecord,
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/api/games",
    {
      method: "POST",
      headers: csrfHeaders(csrfToken),
      body: JSON.stringify(record),
    },
    fetchFn,
  );
  return body !== null;
}

export async function postImport(
  records: readonly GameRecord[],
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/api/import",
    {
      method: "POST",
      headers: csrfHeaders(csrfToken),
      body: JSON.stringify({ games: records }),
    },
    fetchFn,
  );
  return body !== null;
}

export async function signOut(
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/auth/signout",
    { method: "POST", headers: csrfHeaders(csrfToken) },
    fetchFn,
  );
  return body !== null;
}

export async function deleteAccount(
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/api/me",
    { method: "DELETE", headers: csrfHeaders(csrfToken) },
    fetchFn,
  );
  return body !== null;
}

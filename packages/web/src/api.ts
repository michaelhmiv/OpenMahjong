/**
 * Account API client (slice-2 brief §5): a thin wrapper over the
 * OpenMahjong backend. The backend is an enhancement layer only — the
 * game is fully playable with it down, offline, or slow — so every call
 * here resolves to a null/empty result on failure instead of throwing.
 * No tokens live in localStorage (brief §8): the session is the
 * server's httpOnly cookie, sent via credentials: "include"; mutations
 * carry the CSRF token issued by GET /api/me.
 */

import type { VariantLength as GameLength, VariantId } from "@openmahjong/engine";
import { parseSavedGame } from "./replay.js";
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
  readonly variant?: VariantId | "riichi";
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

/** List endpoints intentionally omit large logs; fetch a detail on demand. */
export type GameSummary = Pick<GameRecord, "id" | "length" | "placement" | "score" | "finishedAt" | "variant">;

function isGameSummary(value: unknown): value is GameSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row["id"] === "string" && row["id"].length <= 128 &&
    (row["length"] === "east" || row["length"] === "south" || row["length"] === "full") && (row["variant"] === undefined || ["riichi", "hong-kong", "mcr", "taiwanese"].includes(String(row["variant"]))) &&
    typeof row["placement"] === "number" && Number.isInteger(row["placement"]) && row["placement"] >= 1 && row["placement"] <= 4 &&
    typeof row["score"] === "number" && Number.isSafeInteger(row["score"]) &&
    typeof row["finishedAt"] === "string" && Number.isFinite(Date.parse(row["finishedAt"]));
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

/**
 * Native session provider (iOS step 3b): inside the packaged shell
 * there is no cookie jar the web layer can rely on, so the native
 * bridge (native-auth.ts) installs the session it restored from the
 * keychain here. While a session is installed, every request carries
 * `Authorization: Bearer <token>` (the server resolves bearer exactly
 * like the om_session cookie) and mutations carry the session's
 * `x-csrf-token` unless the caller already supplied one. While
 * nothing is installed — every web user, and guests in the shell —
 * requests behave exactly as they always have (cookie flow only).
 */
export interface NativeSession {
  readonly token: string;
  readonly csrfToken: string;
}

let nativeSession: NativeSession | null = null;

export function installNativeSession(session: NativeSession | null): void {
  nativeSession = session && session.token ? session : null;
}

export function getNativeSession(): NativeSession | null {
  return nativeSession;
}

async function request(
  path: string,
  init: RequestInit,
  fetchFn: FetchFn,
): Promise<unknown | null> {
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...((init.headers ?? {}) as Record<string, string>),
    };
    if (nativeSession) {
      headers["authorization"] = `Bearer ${nativeSession.token}`;
      const method = (init.method ?? "GET").toUpperCase();
      if (method !== "GET" && !("x-csrf-token" in headers)) {
        headers["x-csrf-token"] = nativeSession.csrfToken;
      }
    }
    const res = await fetchFn(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!res.ok) return null;
    // A successful DELETE/sign-out has no JSON body. Treating its 204
    // as a parse failure left deleted accounts looking signed in.
    if (res.status === 204) return {};
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

export async function fetchStats(fetchFn: FetchFn = fetch, variant = "riichi"): Promise<StatsSums | null> {
  const body = (await request(variant === "riichi" ? "/api/stats" : `/api/stats?variant=${encodeURIComponent(variant)}`, { method: "GET" }, fetchFn)) as
    | { stats?: StatsSums }
    | StatsSums
    | null;
  if (!body) return null;
  const sums = (body as { stats?: StatsSums }).stats ?? (body as StatsSums);
  return typeof sums.games === "number" ? sums : null;
}

export async function fetchGames(fetchFn: FetchFn = fetch): Promise<GameSummary[] | null> {
  const body = (await request("/api/games", { method: "GET" }, fetchFn)) as
    | { games?: unknown[] }
    | unknown[]
    | null;
  if (!body) return null;
  const games = Array.isArray(body) ? body : body.games;
  return Array.isArray(games) ? games.filter(isGameSummary) : null;
}

export async function fetchGame(id: string, fetchFn: FetchFn = fetch): Promise<GameRecord | null> {
  const body = await request(`/api/games/${encodeURIComponent(id)}`, { method: "GET" }, fetchFn);
  const value = body && typeof body === "object" && "game" in body ? body.game : body;
  return isGameSummary(value) && "log" in value && "stats" in value ? value as GameRecord : null;
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
  if (typeof body !== "object" || Array.isArray(body)) return null;
  // A successful empty account is distinct from an unreachable API:
  // boot can merge/upload the guest's lesson progress in the former.
  const settings = "settings" in body ? body.settings : body;
  if (settings === null) return {};
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Partial<Settings> : null;
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
      body: JSON.stringify({ settings }),
    },
    fetchFn,
  );
  return body !== null;
}

/** The account's in-progress game (ruling, 2026-11-16): the same
 *  serialized SavedGame the client keeps locally, plus when the
 *  client saved it (ISO string). */
export interface ResumePayload {
  readonly state: SavedGame;
  readonly savedAt: string;
}

/**
 * GET /api/resume. Tri-state on purpose: a stored payload, "empty"
 * (signed in, nothing stored — the local copy wins by default), or
 * null when the call failed (offline/401/down) — a failure must never
 * be mistaken for "nothing stored" and overwrite local state.
 */
export async function fetchResume(
  fetchFn: FetchFn = fetch,
): Promise<ResumePayload | "empty" | null> {
  const body = (await request("/api/resume", { method: "GET" }, fetchFn)) as
    | { resume?: unknown }
    | null;
  if (!body || typeof body !== "object" || !("resume" in body)) return null;
  if (body.resume === null) return "empty";
  const resume = body.resume as { state?: unknown; savedAt?: unknown };
  if (!resume || typeof resume !== "object") return null;
  const state = parseSavedGame(resume.state);
  if (!state) return null;
  if (
    typeof resume.savedAt !== "string" ||
    !Number.isFinite(Date.parse(resume.savedAt))
  ) {
    return null;
  }
  return { state, savedAt: resume.savedAt };
}

/** PUT /api/resume — upsert the caller's in-progress game. */
export async function putResume(
  payload: ResumePayload,
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
  opts: { keepalive?: boolean } = {},
): Promise<boolean> {
  const body = await request(
    "/api/resume",
    {
      method: "PUT",
      headers: csrfHeaders(csrfToken),
      body: JSON.stringify(payload),
      ...(opts.keepalive ? { keepalive: true } : {}),
    },
    fetchFn,
  );
  return body !== null;
}

/** DELETE /api/resume — the game finished or was abandoned. */
export async function deleteResume(
  csrfToken: string | null,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  const body = await request(
    "/api/resume",
    { method: "DELETE", headers: csrfHeaders(csrfToken) },
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
  // The server bounds each request. Split by count and bytes; retries
  // are safe because records are idempotent by user/id.
  let batch: GameRecord[] = [];
  const send = async (): Promise<boolean> => {
    if (!batch.length) return true;
    const body = await request("/api/import", {
      method: "POST", headers: csrfHeaders(csrfToken),
      body: JSON.stringify({ games: batch }),
    }, fetchFn);
    batch = [];
    return body !== null;
  };
  let bytes = 16;
  for (const record of records) {
    const size = new TextEncoder().encode(JSON.stringify(record)).length + 1;
    if (size > 15 * 1024 * 1024) return false;
    if (batch.length >= 200 || bytes + size > 15 * 1024 * 1024) {
      if (!(await send())) return false;
      bytes = 16;
    }
    batch.push(record);
    bytes += size;
  }
  return send();
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

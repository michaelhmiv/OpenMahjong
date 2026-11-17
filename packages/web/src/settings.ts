/**
 * Local persistence (brief §11, S1-5): settings, the in-progress game, and
 * finished-game history live in local storage. Slice 2 adds the account
 * layer on top (api.ts) — local storage remains the guest record and the
 * offline fallback; nothing here talks to the network.
 */

import type { GameLength } from "@openmahjong/engine";
import type { GameRecord } from "./api.js";
import type { SavedGame } from "./runner.js";
import { parseSavedGame } from "./replay.js";

export type MotionName = "standard" | "reduced";

// Dark theme only (Michael, 2026-11-16): the derived light theme is
// removed; theme v5's dark tokens are the single theme.
export interface Settings {
  sound: boolean;
  motion: MotionName;
  largeTiles: boolean;
  lastLength: GameLength;
  /** Guided mode (slice-2 brief §9 ruling): hints and explanations
   *  during CPU games. A pre-game choice on the landing, the same
   *  switch in Settings and in the in-game menu — one setting. */
  guided: boolean;
}

const SETTINGS_KEY = "openmahjong.settings.v1";
const GAME_KEY = "openmahjong.game.v1";
/** When the in-progress game was saved (epoch ms). The account
 *  carry-over (resume-sync.ts) compares it against the server copy's
 *  timestamp: the newer of local/account wins. */
const GAME_SAVED_AT_KEY = "openmahjong.game.savedat.v1";
const HISTORY_KEY = "openmahjong.history.v1";
const RECORDS_KEY = "openmahjong.records.v1";
const IMPORT_KEY = "openmahjong.import-handled.v1";
const TAUGHT_KEY = "openmahjong.taught-focus-frame.v1";

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  motion: "standard",
  largeTiles: false,
  lastLength: "south",
  guided: false,
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length <= 8 * 1024 * 1024 ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/blocked: the game continues without persistence.
  }
}

export function loadSettings(): Settings {
  const saved = readJson<Partial<Settings>>(SETTINGS_KEY);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...DEFAULT_SETTINGS };
  return {
    sound: typeof saved.sound === "boolean" ? saved.sound : DEFAULT_SETTINGS.sound,
    motion: saved.motion === "reduced" || saved.motion === "standard" ? saved.motion : DEFAULT_SETTINGS.motion,
    largeTiles: typeof saved.largeTiles === "boolean" ? saved.largeTiles : DEFAULT_SETTINGS.largeTiles,
    lastLength: saved.lastLength === "east" || saved.lastLength === "south" ? saved.lastLength : DEFAULT_SETTINGS.lastLength,
    guided: typeof saved.guided === "boolean" ? saved.guided : DEFAULT_SETTINGS.guided,
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

/** Save the in-progress game, stamped with the save time (epoch ms,
 *  returned so the account sync pushes the same timestamp). */
export function saveGame(game: SavedGame): number {
  const savedAt = Date.now();
  writeJson(GAME_KEY, game);
  writeJson(GAME_SAVED_AT_KEY, savedAt);
  return savedAt;
}

/** Store a game with a known save time — the account copy that won
 *  the newer-of-local/account comparison at sign-in. */
export function storeGame(game: SavedGame, savedAt: number): void {
  writeJson(GAME_KEY, game);
  writeJson(GAME_SAVED_AT_KEY, savedAt);
}

export function loadGame(): SavedGame | null {
  return parseSavedGame(readJson<unknown>(GAME_KEY));
}

/** When the stored game was saved (epoch ms), or null when unknown
 *  (a save written before timestamps existed counts as oldest). */
export function loadGameSavedAt(): number | null {
  const value = readJson<unknown>(GAME_SAVED_AT_KEY);
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_KEY);
    localStorage.removeItem(GAME_SAVED_AT_KEY);
  } catch {
    /* ignore */
  }
}

export interface HistoryLine {
  readonly date: string;
  readonly length: GameLength;
  readonly scores: readonly number[];
  readonly humanRank: number;
}

export function loadHistory(): HistoryLine[] {
  const rows = readJson<unknown>(HISTORY_KEY);
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is HistoryLine =>
    !!row && typeof row === "object" && validDate(row.date) &&
    (row.length === "east" || row.length === "south") &&
    Array.isArray(row.scores) && row.scores.length === 4 && row.scores.every(Number.isSafeInteger) &&
    Number.isInteger(row.humanRank) && row.humanRank >= 1 && row.humanRank <= 4,
  ).slice(-50);
}

export function appendHistory(line: HistoryLine): void {
  const history = [...loadHistory(), line].slice(-50);
  writeJson(HISTORY_KEY, history);
}

/**
 * Full finished-game records (slice 2): the local mirror of what a
 * signed-in client posts to /api/games — decision log included, so a
 * guest's History rows replay exactly like server ones. The legacy
 * HistoryLine list above stays as the pre-slice-2 record and the
 * fallback for games recorded before this store existed.
 */
export function loadRecords(): GameRecord[] {
  const rows = readJson<unknown>(RECORDS_KEY);
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is GameRecord => {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || row.id.length > 128 || !validDate(row.finishedAt)) return false;
    if (row.length !== "east" && row.length !== "south" && row.length !== "full") return false;
    if (!Number.isInteger(row.placement) || row.placement < 1 || row.placement > 4 || !Number.isSafeInteger(row.score)) return false;
    const stats = row.stats;
    return !!stats && typeof stats === "object" && ["hands", "riichi", "dealIns", "handsWon", "winPoints"]
      .every((key) => Number.isSafeInteger(stats[key]) && stats[key] >= 0);
  }).slice(-50).map((row) => ({ ...row, log: row.log === null ? null : parseSavedGame(row.log) }));
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function appendRecord(record: GameRecord): void {
  const records = [...loadRecords(), record].slice(-50);
  writeJson(RECORDS_KEY, records);
}

/** First-sign-in import (brief T4): offered once per device, ever. */
export function importHandled(): boolean {
  try {
    return localStorage.getItem(IMPORT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markImportHandled(): void {
  try {
    localStorage.setItem(IMPORT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function focusFrameTaught(): boolean {
  try {
    return localStorage.getItem(TAUGHT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markFocusFrameTaught(): void {
  try {
    localStorage.setItem(TAUGHT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** OS-level reduced motion (brief §7: respected alongside the setting). */
export function osPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

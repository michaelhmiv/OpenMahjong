/**
 * Local persistence (brief §11, S1-5): settings, the in-progress game, and
 * finished-game history live in local storage. Slice 2 adds the account
 * layer on top (api.ts) — local storage remains the guest record and the
 * offline fallback; nothing here talks to the network.
 */

import type { GameLength } from "@openmahjong/engine";
import type { GameRecord } from "./api.js";
import type { SavedGame } from "./runner.js";

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
    return raw ? (JSON.parse(raw) as T) : null;
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
  const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) } as Settings & { theme?: unknown };
  // Drop the retired theme key from settings saved before dark-only.
  delete merged.theme;
  return merged;
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

export function saveGame(game: SavedGame): void {
  writeJson(GAME_KEY, game);
}

export function loadGame(): SavedGame | null {
  return readJson<SavedGame>(GAME_KEY);
}

export function clearGame(): void {
  try {
    localStorage.removeItem(GAME_KEY);
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
  return readJson<HistoryLine[]>(HISTORY_KEY) ?? [];
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
  return readJson<GameRecord[]>(RECORDS_KEY) ?? [];
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

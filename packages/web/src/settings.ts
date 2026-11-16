/**
 * Local persistence (brief §11, S1-5): settings, the in-progress game, and
 * finished-game history live in local storage only. No accounts, no server.
 */

import type { GameLength } from "@openmahjong/engine";
import type { SavedGame } from "./runner.js";

export type ThemeName = "dark" | "light";
export type MotionName = "standard" | "reduced";

export interface Settings {
  theme: ThemeName;
  sound: boolean;
  motion: MotionName;
  largeTiles: boolean;
  lastLength: GameLength;
}

const SETTINGS_KEY = "openmahjong.settings.v1";
const GAME_KEY = "openmahjong.game.v1";
const HISTORY_KEY = "openmahjong.history.v1";
const TAUGHT_KEY = "openmahjong.taught-focus-frame.v1";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  sound: true,
  motion: "standard",
  largeTiles: false,
  lastLength: "south",
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
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
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

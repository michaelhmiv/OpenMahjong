/** Versioned, bounded replay data. No DOM, storage, or engine execution. */
import { DEFAULT_RULESET, type GameLength, type Seat } from "@openmahjong/engine";
import { AI_POLICY_VERSION } from "@openmahjong/ai";
import type { Decision } from "./runner.js";

export const REPLAY_ENGINE_VERSION = 2;
export const MAX_REPLAY_DECISIONS = 20_000;
export const MAX_REPLAY_BYTES = 2 * 1024 * 1024;

interface ReplayBase {
  readonly seed: string;
  readonly length: GameLength;
  readonly humanSeat: Seat;
  readonly decisions: readonly Decision[];
  readonly id?: string;
}
export interface LegacySavedGame extends ReplayBase { readonly v: 1 }
export interface CurrentSavedGame extends ReplayBase {
  readonly v: 2;
  readonly engineVersion: typeof REPLAY_ENGINE_VERSION;
  readonly ruleset: { readonly id: string; readonly version: number };
  readonly aiVersion: typeof AI_POLICY_VERSION;
}
export type SavedGame = LegacySavedGame | CurrentSavedGame;

export class ReplayValidationError extends Error {
  override readonly name = "ReplayValidationError";
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}
function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ReplayValidationError(message);
}

/** Return canonical data, stripping unrecognized fields and prototypes. */
export function validateDecision(value: unknown): Decision {
  requireValid(record(value), "Replay action must be an object");
  switch (value["type"]) {
    case "discard": {
      requireValid(integer(value["tileId"], 135), "Invalid discard tile id");
      requireValid(value["riichi"] === undefined || typeof value["riichi"] === "boolean", "Invalid riichi flag");
      return { type: "discard", tileId: value["tileId"], ...(value["riichi"] === undefined ? {} : { riichi: value["riichi"] }) };
    }
    case "ankan": case "shouminkan":
      requireValid(integer(value["tileType"], 33), "Invalid kan tile type");
      return { type: value["type"], tileType: value["tileType"] };
    case "chi": {
      const ids = value["tileIds"];
      requireValid(Array.isArray(ids) && ids.length === 2 && integer(ids[0], 135) && integer(ids[1], 135) && ids[0] !== ids[1], "Invalid chi tile ids");
      return { type: "chi", tileIds: [ids[0], ids[1]] };
    }
    case "tsumo": case "kyuushu": case "pass": case "ron": case "pon": case "daiminkan":
      return { type: value["type"] };
    default: throw new ReplayValidationError("Unknown replay action");
  }
}

/** Structural validation precedes any reconstruction of untrusted data.
 * Legality and complete log consumption are checked by GameRunner. */
export function validateSavedGame(value: unknown): SavedGame {
  requireValid(record(value), "Replay must be an object");
  requireValid(value["v"] === 1 || value["v"] === 2, "Unsupported saved game version");
  requireValid(typeof value["seed"] === "string" && value["seed"].length <= 256, "Invalid replay seed");
  requireValid(value["length"] === "east" || value["length"] === "south", "Invalid game length");
  requireValid(integer(value["humanSeat"], 3), "Invalid human seat");
  requireValid(value["id"] === undefined || (typeof value["id"] === "string" && value["id"].length > 0 && value["id"].length <= 128), "Invalid replay id");
  const raw = value["decisions"];
  requireValid(Array.isArray(raw) && raw.length <= MAX_REPLAY_DECISIONS, "Replay has too many decisions");
  const base: ReplayBase = {
    seed: value["seed"], length: value["length"], humanSeat: value["humanSeat"],
    decisions: raw.map(validateDecision),
    ...(value["id"] === undefined ? {} : { id: value["id"] as string }),
  };
  const canonical: SavedGame = value["v"] === 1 ? { v: 1, ...base } : (() => {
    requireValid(value["engineVersion"] === REPLAY_ENGINE_VERSION, "Unsupported replay engine version");
    const ruleset = value["ruleset"];
    requireValid(record(ruleset) && ruleset["id"] === DEFAULT_RULESET.id && ruleset["version"] === DEFAULT_RULESET.version, "Unsupported replay ruleset");
    requireValid(value["aiVersion"] === AI_POLICY_VERSION, "Unsupported replay AI version");
    return { v: 2, engineVersion: REPLAY_ENGINE_VERSION, ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version }, aiVersion: AI_POLICY_VERSION, ...base };
  })();
  requireValid(new TextEncoder().encode(JSON.stringify(canonical)).length <= MAX_REPLAY_BYTES, "Replay exceeds size limit");
  return canonical;
}

export function parseSavedGame(value: unknown): SavedGame | null {
  try { return validateSavedGame(value); } catch { return null; }
}

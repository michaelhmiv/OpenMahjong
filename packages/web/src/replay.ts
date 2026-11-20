/** Versioned, bounded replay data. No DOM, storage, or engine execution. */
import { DEFAULT_RULESET, validateVariantReplay, type VariantReplay, type GameLength, type Seat } from "@openmahjong/engine";
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
  /** Explicit per-hand walls (tile ids, 136 per hand) for games whose
   *  walls were committed rather than seed-derived — online matches
   *  (issue #106). When present, reconstruction deals these walls in
   *  order instead of the seeded ones; the seed stays in the record
   *  as the game's identifier of origin. Absent on every solo game. */
  readonly walls?: readonly (readonly number[])[];
  /** Coaching-moment records (coaching remainder brief, log-first
   * dependency): the offers at selected human decisions and the
   * choice made, so Review can grade call/kan/riichi/win moments
   * from the record instead of fabricating them. Absent on games
   * recorded before moment capture — those grade discards only. */
  readonly moments?: readonly MomentRecord[];
}

/** The offers at one human decision, recorded when the decision was
 * made. `choice` always equals `decisions[decisionIndex]`; validation
 * enforces it, and Review re-verifies the offers against the
 * reconstructed position before grading. */
export interface MomentRecord {
  readonly decisionIndex: number;
  readonly kind: "call" | "turn";
  readonly choice: Decision;
  // Call-window offers (kind === "call").
  readonly phase?: "ron" | "call" | "chankan";
  readonly tileType?: number;
  readonly fromSeat?: number;
  readonly canRon?: boolean;
  readonly canPon?: boolean;
  readonly canKan?: boolean;
  readonly chiOptions?: readonly (readonly [number, number])[];
  // Turn offers (kind === "turn").
  readonly canTsumo?: boolean;
  readonly drawnTileType?: number | null;
  readonly ankanOptions?: readonly number[];
  readonly shouminkanOptions?: readonly number[];
  readonly riichiDiscardIds?: readonly number[];
}
export type SavedGame = LegacySavedGame | CurrentSavedGame | VariantReplay;

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

const TURN_TYPE_NAMES = new Set(["discard", "ankan", "shouminkan", "tsumo", "kyuushu"]);

function validateTileTypeList(value: unknown, maxLength: number, label: string): number[] {
  requireValid(Array.isArray(value) && value.length <= maxLength, `Invalid ${label}`);
  for (const entry of value as unknown[]) requireValid(integer(entry, 33), `Invalid ${label}`);
  return [...(value as number[])];
}

function validateMoment(value: unknown, decisions: readonly Decision[]): MomentRecord {
  requireValid(record(value), "Moment must be an object");
  const decisionIndex = value["decisionIndex"];
  requireValid(integer(decisionIndex, MAX_REPLAY_DECISIONS) && decisionIndex < decisions.length, "Moment decision index out of range");
  const kind = value["kind"];
  requireValid(kind === "call" || kind === "turn", "Invalid moment kind");
  const choice = validateDecision(value["choice"]);
  requireValid(JSON.stringify(choice) === JSON.stringify(decisions[decisionIndex]), "Moment choice does not match the decision log");
  requireValid(TURN_TYPE_NAMES.has(choice.type) === (kind === "turn"), "Moment kind does not match its choice");
  if (kind === "call") {
    const phase = value["phase"];
    requireValid(phase === "ron" || phase === "call" || phase === "chankan", "Invalid moment phase");
    requireValid(integer(value["tileType"], 33), "Invalid moment tile type");
    requireValid(integer(value["fromSeat"], 3), "Invalid moment seat");
    for (const flag of ["canRon", "canPon", "canKan"] as const) {
      requireValid(typeof value[flag] === "boolean", `Invalid moment flag ${flag}`);
    }
    const chi = value["chiOptions"];
    requireValid(Array.isArray(chi) && chi.length <= 4, "Invalid moment chi options");
    const chiOptions = (chi as unknown[]).map((pair) => {
      requireValid(Array.isArray(pair) && pair.length === 2 && integer(pair[0], 135) && integer(pair[1], 135) && pair[0] !== pair[1], "Invalid moment chi option");
      return [pair[0], pair[1]] as const;
    });
    return {
      decisionIndex, kind, choice, phase,
      tileType: value["tileType"], fromSeat: value["fromSeat"],
      canRon: value["canRon"] as boolean, canPon: value["canPon"] as boolean, canKan: value["canKan"] as boolean,
      chiOptions,
    };
  }
  requireValid(typeof value["canTsumo"] === "boolean", "Invalid moment tsumo flag");
  requireValid(value["drawnTileType"] === null || integer(value["drawnTileType"], 33), "Invalid moment drawn tile");
  const riichiIds = value["riichiDiscardIds"];
  requireValid(Array.isArray(riichiIds) && riichiIds.length <= 14, "Invalid moment riichi discards");
  for (const id of riichiIds as unknown[]) requireValid(integer(id, 135), "Invalid moment riichi discards");
  return {
    decisionIndex, kind, choice,
    canTsumo: value["canTsumo"],
    drawnTileType: value["drawnTileType"] as number | null,
    ankanOptions: validateTileTypeList(value["ankanOptions"], 4, "moment ankan options"),
    shouminkanOptions: validateTileTypeList(value["shouminkanOptions"], 4, "moment shouminkan options"),
    riichiDiscardIds: [...(riichiIds as number[])],
  };
}

function validateWalls(value: unknown): readonly (readonly number[])[] {
  requireValid(Array.isArray(value) && value.length > 0 && value.length <= 64, "Invalid replay walls");
  return value.map((wall) => {
    requireValid(Array.isArray(wall) && wall.length === 136, "Invalid replay wall");
    const seen = new Set<number>();
    for (const id of wall as unknown[]) {
      requireValid(integer(id, 135) && !seen.has(id as number), "Invalid replay wall tile");
      seen.add(id as number);
    }
    return [...(wall as number[])];
  });
}

/** Structural validation precedes any reconstruction of untrusted data.
 * Legality and complete log consumption are checked by GameRunner. */
export function validateSavedGame(value: unknown): SavedGame {
  if (record(value) && value["v"] === 3) return validateVariantReplay(value);
  requireValid(record(value), "Replay must be an object");
  requireValid(value["variant"] === undefined || value["variant"] === "riichi", "Old replay schemas support Riichi only");
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
    let moments: readonly MomentRecord[] | undefined;
    if (value["moments"] !== undefined) {
      const rawMoments = value["moments"];
      requireValid(Array.isArray(rawMoments) && rawMoments.length <= base.decisions.length, "Too many moments");
      const parsed = rawMoments.map((entry) => validateMoment(entry, base.decisions));
      for (let i = 1; i < parsed.length; i++) {
        requireValid(parsed[i]!.decisionIndex > parsed[i - 1]!.decisionIndex, "Moments out of order");
      }
      moments = parsed;
    }
    const walls = value["walls"] === undefined ? undefined : validateWalls(value["walls"]);
    return { v: 2, engineVersion: REPLAY_ENGINE_VERSION, ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version }, aiVersion: AI_POLICY_VERSION, ...base, ...(moments && moments.length > 0 ? { moments } : {}), ...(walls ? { walls } : {}) };
  })();
  requireValid(new TextEncoder().encode(JSON.stringify(canonical)).length <= MAX_REPLAY_BYTES, "Replay exceeds size limit");
  return canonical;
}

export function parseSavedGame(value: unknown): SavedGame | null {
  try { return validateSavedGame(value); } catch { return null; }
}

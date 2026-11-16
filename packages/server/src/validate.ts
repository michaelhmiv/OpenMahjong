/**
 * Shape validation for game-record uploads (brief §4 T1). The server
 * stores records; it never interprets the decision log — `log` is
 * bounded JSON-shaped data, not proof of a valid competitive result.
 */

import type { GameRecord, GameStats } from "./store.js";

export class ValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const MAX_IMPORT_GAMES = 200;
const MAX_GAME_LOG_BYTES = 2 * 1024 * 1024;
const POSTGRES_INT_MAX = 2_147_483_647;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_INSTANT_RE.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as
    [number, number, number, number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return maxDay !== undefined && day >= 1 && day <= maxDay &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    Number.isFinite(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

/** Bound nested JSON before JSON.stringify/pg traversal can exhaust the stack. */
function validateJsonDepth(input: unknown): void {
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 1_000_000) throw new ValidationError("JSON contains too many values");
    if (depth > 64) throw new ValidationError("JSON nesting must not exceed 64 levels");
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new ValidationError("JSON numbers must be finite");
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
    } else if (isRecord(value)) {
      for (const key in value) {
        if (Object.hasOwn(value, key)) visit(value[key], depth + 1);
      }
    }
  }
  // Recursion is bounded to 65 frames; wide arrays do not allocate a second
  // array or a work item per member while validation traverses them.
  visit(input, 0);
}

export function validatedGameId(encoded: string): string {
  let id: string;
  try { id = decodeURIComponent(encoded); }
  catch { throw new ValidationError("id must be a uuid string"); }
  if (!UUID_RE.test(id)) throw new ValidationError("id must be a uuid string");
  return id;
}

export function validateSettings(input: unknown): Record<string, unknown> {
  if (!isRecord(input) || !isRecord(input["settings"])) {
    throw new ValidationError("body must be { settings: object }");
  }
  validateJsonDepth(input["settings"]);
  return input["settings"];
}

export function validateGameStats(input: unknown): GameStats {
  if (!isRecord(input)) throw new ValidationError("stats must be an object");
  const fields = ["hands", "riichi", "dealIns", "handsWon", "winPoints"] as const;
  const out = {} as Record<(typeof fields)[number], number>;
  for (const field of fields) {
    const value = input[field];
    const max = field === "winPoints" ? Number.MAX_SAFE_INTEGER : POSTGRES_INT_MAX;
    if (!isNonNegativeInt(value) || value > max) {
      throw new ValidationError(`stats.${field} must be a non-negative integer <= ${max}`);
    }
    out[field] = value;
  }
  for (const field of ["riichi", "dealIns", "handsWon"] as const) {
    if (out[field] > out.hands) throw new ValidationError(`stats.${field} cannot exceed stats.hands`);
  }
  return out;
}

export function validateGame(input: unknown): GameRecord {
  if (!isRecord(input)) throw new ValidationError("game must be an object");

  const id = input["id"];
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    throw new ValidationError("id must be a uuid string");
  }

  const length = input["length"];
  if (length !== "east" && length !== "south") {
    throw new ValidationError('length must be "east" or "south"');
  }

  const placement = input["placement"];
  if (
    typeof placement !== "number" ||
    !Number.isInteger(placement) ||
    placement < 1 ||
    placement > 4
  ) {
    throw new ValidationError("placement must be an integer 1..4");
  }

  const score = input["score"];
  if (typeof score !== "number" || !Number.isSafeInteger(score)) {
    throw new ValidationError("score must be a safe integer");
  }

  const finishedAtRaw = input["finishedAt"];
  if (!isIsoInstant(finishedAtRaw)) {
    throw new ValidationError("finishedAt must be an ISO string");
  }
  const finishedAt = new Date(finishedAtRaw);
  if (Number.isNaN(finishedAt.getTime())) {
    throw new ValidationError("finishedAt must be an ISO string");
  }

  if (!("log" in input)) {
    throw new ValidationError("log is required");
  }
  validateJsonDepth(input["log"]);
  if (Buffer.byteLength(JSON.stringify(input["log"]), "utf8") > MAX_GAME_LOG_BYTES) {
    throw new ValidationError("game log too large", 413);
  }

  return {
    id,
    length,
    placement,
    score,
    finishedAt,
    log: input["log"],
    stats: validateGameStats(input["stats"]),
  };
}

export function validateGameList(input: unknown): GameRecord[] {
  if (!isRecord(input) || !Array.isArray(input["games"])) {
    throw new ValidationError("body must be { games: [...] }");
  }
  if (input["games"].length > MAX_IMPORT_GAMES) {
    throw new ValidationError(`import must contain at most ${MAX_IMPORT_GAMES} games`);
  }
  return input["games"].map((g) => validateGame(g));
}

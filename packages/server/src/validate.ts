/**
 * Shape validation for game-record uploads (brief §4 T1). The server
 * stores records; it never interprets the decision log — `log` is
 * required to be present and JSON-shaped, nothing more.
 */

import type { GameRecord, GameStats } from "./store.js";

export class ValidationError extends Error {}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0
  );
}

export function validateGameStats(input: unknown): GameStats {
  if (!isRecord(input)) throw new ValidationError("stats must be an object");
  const fields = ["hands", "riichi", "dealIns", "handsWon", "winPoints"] as const;
  const out = {} as Record<(typeof fields)[number], number>;
  for (const field of fields) {
    const value = input[field];
    if (!isNonNegativeInt(value)) {
      throw new ValidationError(`stats.${field} must be a non-negative integer`);
    }
    out[field] = value;
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
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new ValidationError("score must be a finite number");
  }

  const finishedAtRaw = input["finishedAt"];
  if (typeof finishedAtRaw !== "string") {
    throw new ValidationError("finishedAt must be an ISO string");
  }
  const finishedAt = new Date(finishedAtRaw);
  if (Number.isNaN(finishedAt.getTime())) {
    throw new ValidationError("finishedAt must be an ISO string");
  }

  if (!("log" in input)) {
    throw new ValidationError("log is required");
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
  return input["games"].map((g) => validateGame(g));
}

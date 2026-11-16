/** Validation at the local/account storage boundary. Stored lesson state is data,
 * never a trusted action log. Bounds are checked before replay can run. */
import type { CallAction, TurnAction } from "@openmahjong/engine";
import { isModuleId, moduleDef, type ModuleId } from "./curriculum.js";

export const MAX_LESSON_DECISIONS = 512;
export type SceneDecision = TurnAction | CallAction;
export interface SavedLessonState {
  readonly module: ModuleId;
  /** Absent on historical snapshots. Version 1 -> 2 keeps step order unchanged. */
  readonly moduleVersion?: number;
  readonly step: number;
  readonly scene: { readonly seed: string; readonly decisions: readonly SceneDecision[] } | null;
  readonly counters: Readonly<Record<string, number>>;
  readonly found: readonly number[];
}
export interface TutorialProgress {
  readonly done: ModuleId[];
  readonly active: SavedLessonState | null;
}
export interface LessonBounds {
  readonly stepCount: number;
  readonly seeds: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

/** Rebuild known fields; do not preserve arbitrary properties from imported data. */
export function parseSceneDecision(value: unknown): SceneDecision | null {
  if (!record(value)) return null;
  switch (value["type"]) {
    case "discard":
      if (!integer(value["tileId"], 135) ||
        (value["riichi"] !== undefined && typeof value["riichi"] !== "boolean")) return null;
      return { type: "discard", tileId: value["tileId"],
        ...(typeof value["riichi"] === "boolean" ? { riichi: value["riichi"] } : {}) };
    case "ankan":
    case "shouminkan":
      return integer(value["tileType"], 33)
        ? { type: value["type"], tileType: value["tileType"] } : null;
    case "chi": {
      const ids = value["tileIds"];
      if (!Array.isArray(ids) || ids.length !== 2 || !integer(ids[0], 135) ||
        !integer(ids[1], 135) || ids[0] === ids[1]) return null;
      return { type: "chi", tileIds: [ids[0], ids[1]] };
    }
    case "tsumo": case "kyuushu": case "pass": case "ron": case "pon": case "daiminkan":
      return { type: value["type"] };
    default: return null;
  }
}

export function parseSavedLesson(
  raw: unknown,
  boundsFor: (id: ModuleId) => LessonBounds,
): SavedLessonState | null {
  if (!record(raw) || !isModuleId(raw["module"])) return null;
  const id = raw["module"];
  const bounds = boundsFor(id);
  const version = raw["moduleVersion"];
  // Unknown content cannot safely resume under today's step definitions.
  if (version !== undefined && version !== 1 && version !== moduleDef(id).version) return null;
  if (!integer(raw["step"], bounds.stepCount)) return null;
  let scene: SavedLessonState["scene"] = null;
  if (raw["scene"] != null) {
    const saved = raw["scene"];
    if (!record(saved) || typeof saved["seed"] !== "string" || !bounds.seeds.includes(saved["seed"]) ||
      !Array.isArray(saved["decisions"]) || saved["decisions"].length > MAX_LESSON_DECISIONS) return null;
    const decisions: SceneDecision[] = [];
    for (const candidate of saved["decisions"]) {
      const action = parseSceneDecision(candidate);
      if (!action) return null;
      decisions.push(action);
    }
    scene = { seed: saved["seed"], decisions };
  }
  const counters: Record<string, number> = {};
  if (raw["counters"] !== undefined) {
    if (!record(raw["counters"])) return null;
    for (const key of ["discards", "eventsAtRiichi", "misses"]) {
      const value = raw["counters"][key];
      if (value === undefined) continue;
      if (!integer(value, 100_000)) return null;
      counters[key] = value;
    }
  }
  const found = raw["found"] ?? [];
  if (!Array.isArray(found) || found.length > 32 || found.some((index) => !integer(index, 31))) return null;
  return { module: id, moduleVersion: moduleDef(id).version, step: raw["step"], scene,
    counters, found: [...new Set(found as number[])] };
}

export function parseTutorialProgress(
  raw: unknown,
  boundsFor: (id: ModuleId) => LessonBounds,
): TutorialProgress {
  if (!record(raw)) return { done: [], active: null };
  return {
    done: Array.isArray(raw["done"]) ? [...new Set(raw["done"].filter(isModuleId))] : [],
    active: parseSavedLesson(raw["active"], boundsFor),
  };
}

/** Completions union. Prefer an incomplete active module; ties remain local-first.
 * There is no fabricated timestamp or assumption that a greater step is newer. */
export function mergeProgress(a: TutorialProgress, b: TutorialProgress): TutorialProgress {
  const done = [...new Set([...a.done, ...b.done])];
  const candidates = [a.active, b.active].filter((active): active is SavedLessonState => active !== null);
  return { done, active: candidates.find((active) => !done.includes(active.module)) ?? candidates[0] ?? null };
}

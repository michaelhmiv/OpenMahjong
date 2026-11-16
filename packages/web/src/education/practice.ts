/** Exact, hand-based practice foundation. It has no UI or model-generated answers.
 * Validation independently recomputes authored answers before an exercise is usable. */
import {
  isHonor, isTerminal, isSuited, parseCounts, shanten, scoreHand, ukeire,
  type ScoreInput,
} from "@openmahjong/engine";
import { EDUCATION_RULESET, SKILLS, type RulesetRef, type SkillId } from "./curriculum.js";

export const PRACTICE_SCHEMA_VERSION = 1;
export type PracticeAnswer = number | boolean | readonly number[] | readonly string[];
interface ExerciseBase {
  readonly id: string;
  readonly version: number;
  readonly ruleset: RulesetRef;
  readonly skill: SkillId;
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  readonly prompt: string;
  readonly explanation: string;
  readonly source: { readonly kind: "curated"; readonly reference: string };
  readonly expected: PracticeAnswer;
}
interface HandPosition { readonly counts: readonly number[] }
export type PracticeExercise = ExerciseBase & (
  | { readonly kind: "recognition"; readonly tiles: readonly number[]; readonly category: "suited" | "honor" | "terminal"; readonly expected: readonly number[] }
  | { readonly kind: "shape"; readonly position: HandPosition; readonly expected: boolean }
  | { readonly kind: "shanten"; readonly position: HandPosition; readonly expected: number }
  | { readonly kind: "waits"; readonly position: HandPosition; readonly expected: readonly number[] }
  | { readonly kind: "ukeire"; readonly position: HandPosition & { readonly visibleOutsideHand: readonly number[] }; readonly expected: readonly number[] }
  | { readonly kind: "yaku"; readonly position: ScoreInput; readonly expected: readonly string[] }
  | { readonly kind: "scoring"; readonly position: ScoreInput; readonly expected: number }
  | { readonly kind: "defense"; readonly opponentRiichi: true; readonly discarded: readonly number[]; readonly candidates: readonly number[]; readonly expected: readonly number[] }
);

export interface PracticeValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function sameAnswer(a: PracticeAnswer, b: PracticeAnswer): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  // Selection order carries no meaning; repeating a selection is not extra evidence.
  const left = [...new Set(a)].map((value) => JSON.stringify(value)).sort();
  const right = [...new Set(b)].map((value) => JSON.stringify(value)).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}
function validateTypes(types: readonly number[], maxLength: number): void {
  if (!Array.isArray(types) || types.length > maxLength ||
    types.some((type) => !Number.isInteger(type) || type < 0 || type > 33)) {
    throw new Error("Invalid tile types");
  }
  const counts = new Array<number>(34).fill(0);
  for (const type of types) if (++counts[type]! > 4) throw new Error("More than four copies of a tile");
}
function handTotal(counts: readonly number[]): number {
  if (!Array.isArray(counts) || counts.length !== 34 ||
    counts.some((count) => !Number.isInteger(count) || count < 0 || count > 4)) {
    throw new Error("Invalid hand counts");
  }
  return counts.reduce((sum, count) => sum + count, 0);
}

/** Returns exact facts from the visible exercise input. No wall/opponent hand exists. */
export function computePracticeAnswer(exercise: PracticeExercise): PracticeAnswer {
  switch (exercise.kind) {
    case "recognition": {
      validateTypes(exercise.tiles, 34);
      const predicate = exercise.category === "honor" ? isHonor :
        exercise.category === "terminal" ? isTerminal : isSuited;
      return exercise.tiles.flatMap((type, index) => predicate(type) ? [index] : []);
    }
    case "shape": {
      const total = handTotal(exercise.position.counts);
      if (total !== 13 && total !== 14) throw new Error("Shape practice requires 13 or 14 tiles");
      return total === 14 && shanten(exercise.position.counts) === -1;
    }
    case "shanten": {
      const total = handTotal(exercise.position.counts);
      if (total !== 13 && total !== 14) throw new Error("Shanten practice requires 13 or 14 tiles");
      return shanten(exercise.position.counts);
    }
    case "waits": {
      const counts = exercise.position.counts;
      if (handTotal(counts) !== 13) throw new Error("Wait practice requires 13 tiles");
      const work = [...counts];
      const result: number[] = [];
      for (let type = 0; type < 34; type++) {
        if (work[type] === 4) continue;
        work[type]!++;
        if (shanten(work) === -1) result.push(type);
        work[type]!--;
      }
      return result;
    }
    case "ukeire":
      return ukeire(exercise.position.counts, exercise.position.visibleOutsideHand).improving.map((tile) => tile.type);
    case "yaku": return scoreHand(exercise.position).yaku.map((yaku) => yaku.id);
    case "scoring": {
      const score = scoreHand(exercise.position);
      if (score.ronPoints !== null) return score.ronPoints + score.stickPoints;
      const payments = score.tsumoPoints!;
      return (exercise.position.seatWind === 27 ? payments.nonDealer * 3 :
        payments.nonDealer * 2 + payments.dealer) + score.stickPoints;
    }
    case "defense": {
      if (exercise.opponentRiichi !== true) throw new Error("Genbutsu exercise must identify a locked riichi opponent");
      validateTypes([...exercise.discarded, ...exercise.candidates], 136);
      return [...new Set(exercise.candidates)].filter((type) => exercise.discarded.includes(type));
    }
  }
}

/** Content pipeline: semantic checks run before publishing, importing, or answering.
 * A future generated exercise must pass the same gate as a curated exercise. */
export function validateExercise(raw: unknown): PracticeValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { valid: false, errors: ["Invalid exercise"] };
  const exercise = raw as PracticeExercise;
  if (typeof exercise.id !== "string" || typeof exercise.prompt !== "string" ||
    typeof exercise.explanation !== "string" || !exercise.ruleset ||
    typeof exercise.ruleset !== "object" || !exercise.source || exercise.source.kind !== "curated" ||
    typeof exercise.source.reference !== "string" || !exercise.source.reference.trim() ||
    !SKILLS.includes(exercise.skill) || !Number.isInteger(exercise.difficulty) ||
    exercise.difficulty < 1 || exercise.difficulty > 5 ||
    !["recognition", "shape", "shanten", "waits", "ukeire", "yaku", "scoring", "defense"].includes(exercise.kind)) {
    return { valid: false, errors: ["Invalid exercise metadata"] };
  }
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(exercise.id)) errors.push("Invalid exercise identifier");
  if (!Number.isSafeInteger(exercise.version) || exercise.version < 1) errors.push("Invalid content version");
  if (exercise.ruleset.id !== EDUCATION_RULESET.id || exercise.ruleset.version !== EDUCATION_RULESET.version) {
    errors.push("Unsupported ruleset");
  }
  if (!exercise.prompt.trim() || !exercise.explanation.trim()) errors.push("Missing instructional text");
  try {
    const expectedKind = exercise.kind === "shape" ? "boolean" :
      exercise.kind === "scoring" || exercise.kind === "shanten" ? "number" : "array";
    if (expectedKind === "array") {
      if (!Array.isArray(exercise.expected) || exercise.expected.length > 136 ||
        exercise.expected.some((item) => exercise.kind === "yaku" ? typeof item !== "string" :
          typeof item !== "number" || !Number.isSafeInteger(item) || item < 0 || item > 135)) {
        throw new Error("Invalid answer");
      }
    } else if (typeof exercise.expected !== expectedKind ||
      (typeof exercise.expected === "number" && !Number.isSafeInteger(exercise.expected))) throw new Error("Invalid answer");
    if (exercise.kind === "recognition" && !["suited", "honor", "terminal"].includes(exercise.category)) throw new Error("Invalid category");
    const computed = computePracticeAnswer(exercise);
    if (!sameAnswer(computed, exercise.expected)) errors.push("Authored answer disagrees with the rules engine");
  } catch {
    errors.push("Invalid or impossible exercise position");
  }
  return { valid: errors.length === 0, errors };
}

export interface PracticeFeedback {
  readonly correct: boolean;
  readonly expected: PracticeAnswer;
  readonly explanation: string;
  readonly facts: Readonly<Record<string, number>>;
}
export function checkPracticeAnswer(exercise: PracticeExercise, answer: PracticeAnswer): PracticeFeedback {
  const validation = validateExercise(exercise);
  if (!validation.valid) throw new Error(`Unvalidated exercise: ${validation.errors.join("; ")}`);
  const facts: Record<string, number> = {};
  if (exercise.kind === "ukeire") {
    const result = ukeire(exercise.position.counts, exercise.position.visibleOutsideHand);
    facts["shanten"] = result.shanten;
    facts["unseenImprovingCopies"] = result.totalRemaining;
  }
  return { correct: sameAnswer(answer, exercise.expected), expected: exercise.expected,
    explanation: exercise.explanation, facts };
}

const EMPTY_VISIBLE = new Array<number>(34).fill(0);
const BASE = { version: 1, ruleset: EDUCATION_RULESET, difficulty: 1,
  source: { kind: "curated", reference: "docs/education/practice-system.md#curated-fixtures" } } as const;
const SCORE_BASE = { melds: [], seatWind: 28, roundWind: 27, riichi: false, dora: 0,
  honba: 0, riichiSticks: 0 } as const;

/** Small verified starter corpus, not the complete curriculum or a published area. */
export const CURATED_EXERCISES: readonly PracticeExercise[] = [
  { ...BASE, id: "recognize-honors", kind: "recognition", skill: "tile-recognition",
    prompt: "Select the winds and dragons.", tiles: [0, 8, 27, 13, 31, 22, 33], category: "honor", expected: [2, 4, 6],
    explanation: "East, white dragon, and red dragon are honors; numbered tiles are suited tiles." },
  { ...BASE, id: "recognize-terminals", kind: "recognition", skill: "tile-recognition",
    prompt: "Select the suited 1s and 9s.", tiles: [0, 9, 18, 8, 17, 26, 27, 4], category: "terminal", expected: [0, 1, 2, 3, 4, 5],
    explanation: "Only ranks 1 and 9 of the three suits are terminals. Winds are honors." },
  { ...BASE, id: "shape-standard", kind: "shape", skill: "hand-construction",
    prompt: "Does this hand have a complete shape? This question does not establish a legal win.",
    position: { counts: parseCounts("234m345p678s999s55p") }, expected: true,
    explanation: "234m, 345p, 678s, and 999s form four sets; 55p is the pair. A legal win also needs a yaku." },
  { ...BASE, id: "shape-seven-pairs", kind: "shape", skill: "hand-construction",
    prompt: "Does this hand have a complete shape?", position: { counts: parseCounts("22m55m33p77p33s77s22z") }, expected: true,
    explanation: "Seven different pairs form chiitoitsu, a special closed-hand shape." },
  { ...BASE, id: "shanten-single-wait", kind: "shanten", skill: "shanten",
    prompt: "How many shanten is this 13-tile hand?", position: { counts: parseCounts("123m123p123s777z5m") }, expected: 0,
    explanation: "Four sets are complete. Another 5m makes the pair, so this hand is tenpai: zero shanten." },
  { ...BASE, id: "shanten-seven-pairs", kind: "shanten", skill: "shanten", difficulty: 2,
    prompt: "How many shanten is this hand, considering special shapes?", position: { counts: parseCounts("11m44m77m22p55p88s3z") }, expected: 0,
    explanation: "Six pairs and a single West are tenpai for seven different pairs. Another West completes it." },
  { ...BASE, id: "wait-tanki", kind: "waits", skill: "wait-reading",
    prompt: "Select every tile type that completes the shape, regardless of unseen copies.",
    position: { counts: parseCounts("123m123p123s777z5m") }, expected: [4],
    explanation: "Only 5m completes the pair. The three sequences and red-dragon triplet are already complete." },
  { ...BASE, id: "wait-ryanmen", kind: "waits", skill: "wait-reading", difficulty: 2,
    prompt: "Select every tile type that completes the shape, regardless of unseen copies.",
    position: { counts: parseCounts("123m123p777z55s45m") }, expected: [2, 5],
    explanation: "The incomplete 45m sequence accepts 3m or 6m. The other three sets and pair are complete." },
  { ...BASE, id: "ukeire-visible", kind: "ukeire", skill: "ukeire", difficulty: 2,
    prompt: "Select improving tile types with at least one unseen copy. Two 5m are visible outside your hand.",
    position: { counts: parseCounts("123m123p123s777z5m"), visibleOutsideHand: parseCounts("55m") }, expected: [4],
    explanation: "Only 5m completes the pair. One is in hand and two are visible, leaving one unseen copy; its actual location is unknown." },
  { ...BASE, id: "yaku-tanyao", kind: "yaku", skill: "yaku", difficulty: 2,
    prompt: "Identify every yaku for this closed ron hand, won on 4m without riichi.",
    position: { ...SCORE_BASE, handCounts: parseCounts("234m555p345s678s22m"), winningTileType: 3, winType: "ron" }, expected: ["tanyao"],
    explanation: "Every tile is a simple, so tanyao applies. The dot triplet rules out pinfu; riichi was not declared." },
  { ...BASE, id: "score-riichi-pinfu", kind: "scoring", skill: "scoring", difficulty: 2,
    prompt: "How many total points does a nondealer collect for this riichi pinfu ron, with no dora, honba, or sticks?",
    position: { ...SCORE_BASE, handCounts: parseCounts("234m345p345s789s22s"), riichi: true, winningTileType: 1, winType: "ron" }, expected: 2000,
    explanation: "Riichi and pinfu give 2 han. Closed ron gives 30 fu: 30 × 2^(2+2) = 480 base; 480 × 4 rounds to 2,000." },
  { ...BASE, id: "score-chiitoitsu", kind: "scoring", skill: "scoring", difficulty: 2,
    prompt: "How many total points does a nondealer collect for this seven-pairs ron, with no bonuses?",
    position: { ...SCORE_BASE, handCounts: parseCounts("22m55m33p77p33s77s22z"), winningTileType: 28, winType: "ron" }, expected: 1600,
    explanation: "Chiitoitsu is 2 han and exactly 25 fu. Base 25 × 16 = 400; a nondealer ron is 400 × 4 = 1,600." },
  { ...BASE, id: "defense-one-opponent", kind: "defense", skill: "defense",
    prompt: "Select candidate types guaranteed safe against this riichi opponent's ron. No safety is claimed against the others.",
    opponentRiichi: true, discarded: [0, 4, 9, 27], candidates: [4, 13, 27], expected: [4, 27],
    explanation: "5m and East are in that opponent's pond, so furiten prevents their ron. 5p has no such guarantee; other opponents are separate threats." },
];

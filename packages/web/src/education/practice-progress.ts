/** Local-first practice evidence. A lesson completion is exposure, never proof
 * of unassisted mastery. Scheduling is a transparent suggestion, not a lock. */
import {
  EDUCATION_RULESET, SKILLS, SKILL_TAXONOMY_VERSION, type RulesetRef, type SkillId,
} from "./curriculum.js";
import { type PracticeExercise } from "./practice.js";

export const PRACTICE_STORAGE_KEY = "openmahjong.practice.v1";
export const MAX_PRACTICE_ATTEMPTS = 2_000;
const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 14, 30] as const;
export interface PracticeAttempt {
  readonly schemaVersion: 1;
  readonly taxonomyVersion: typeof SKILL_TAXONOMY_VERSION;
  readonly id: string;
  readonly exerciseId: string;
  readonly exerciseVersion: number;
  readonly ruleset: RulesetRef;
  readonly skill: SkillId;
  readonly at: number;
  readonly correct: boolean;
  readonly assisted: boolean;
  readonly attemptNumber: number;
  readonly responseMs: number;
}
export interface PracticeProgress {
  readonly schemaVersion: 1;
  readonly attempts: readonly PracticeAttempt[];
}
export interface SkillEvidence {
  readonly skill: SkillId;
  readonly unassistedFirstAttempts: number;
  readonly unassistedCorrect: number;
  readonly assistedAttempts: number;
  readonly retries: number;
  readonly accuracy: number | null;
  readonly lastPracticedAt: number | null;
  readonly lastSuccessfulAt: number | null;
}
export interface ReviewSchedule {
  readonly exerciseId: string;
  readonly exerciseVersion: number;
  readonly independentSuccessStreak: number;
  readonly dueAt: number;
}

function supportedAttempt(raw: unknown): raw is PracticeAttempt {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as PracticeAttempt;
  return value.schemaVersion === 1 && value.taxonomyVersion === SKILL_TAXONOMY_VERSION &&
    typeof value.id === "string" && value.id.length > 0 && value.id.length <= 100 &&
    typeof value.exerciseId === "string" && /^[a-z][a-z0-9-]{2,79}$/.test(value.exerciseId) &&
    Number.isSafeInteger(value.exerciseVersion) && value.exerciseVersion >= 1 &&
    value.ruleset?.id === EDUCATION_RULESET.id && value.ruleset.version === EDUCATION_RULESET.version &&
    SKILLS.includes(value.skill) && Number.isSafeInteger(value.at) && value.at >= 0 && value.at <= 8_000_000_000_000_000 &&
    typeof value.correct === "boolean" && typeof value.assisted === "boolean" &&
    Number.isSafeInteger(value.attemptNumber) && value.attemptNumber >= 1 && value.attemptNumber <= 100 &&
    Number.isSafeInteger(value.responseMs) && value.responseMs >= 0 && value.responseMs <= DAY;
}

/** Invalid entries cannot poison the remaining local evidence. First ID wins;
 * duplicate IDs do not count twice after an offline merge or repeated submit. */
export function parsePracticeProgress(raw: unknown): PracticeProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { schemaVersion: 1, attempts: [] };
  const value = raw as Partial<PracticeProgress>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.attempts) || value.attempts.length > MAX_PRACTICE_ATTEMPTS) {
    return { schemaVersion: 1, attempts: [] };
  }
  const seen = new Set<string>();
  const attempts: PracticeAttempt[] = [];
  for (const candidate of value.attempts) {
    if (!supportedAttempt(candidate) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    // Copy only documented fields, with no arbitrary imported properties.
    const { schemaVersion, taxonomyVersion, id, exerciseId, exerciseVersion, skill,
      at, correct, assisted, attemptNumber, responseMs } = candidate;
    attempts.push({ schemaVersion, taxonomyVersion, id, exerciseId, exerciseVersion,
      ruleset: { ...EDUCATION_RULESET }, skill, at, correct, assisted, attemptNumber, responseMs });
  }
  attempts.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { schemaVersion: 1, attempts };
}

export function mergePracticeProgress(a: PracticeProgress, b: PracticeProgress): PracticeProgress {
  const candidates = [...parsePracticeProgress(a).attempts, ...parsePracticeProgress(b).attempts];
  const unique = new Map<string, PracticeAttempt>();
  for (const attempt of candidates) if (!unique.has(attempt.id)) unique.set(attempt.id, attempt);
  const attempts = [...unique.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id))
    .slice(-MAX_PRACTICE_ATTEMPTS);
  return { schemaVersion: 1, attempts };
}

export function skillEvidence(progress: PracticeProgress): readonly SkillEvidence[] {
  const attempts = parsePracticeProgress(progress).attempts;
  return SKILLS.map((skill) => {
    const relevant = attempts.filter((attempt) => attempt.skill === skill);
    const independent = relevant.filter((attempt) => !attempt.assisted && attempt.attemptNumber === 1);
    const correct = independent.filter((attempt) => attempt.correct);
    return { skill, unassistedFirstAttempts: independent.length, unassistedCorrect: correct.length,
      assistedAttempts: relevant.filter((attempt) => attempt.assisted).length,
      retries: relevant.filter((attempt) => attempt.attemptNumber > 1).length,
      accuracy: independent.length ? correct.length / independent.length : null,
      lastPracticedAt: relevant.at(-1)?.at ?? null, lastSuccessfulAt: correct.at(-1)?.at ?? null };
  });
}

/** Only independent first responses move a review interval. A retry or hint can
 * help learning, but cannot erase the earlier mistake or postpone its review. */
export function reviewSchedules(progress: PracticeProgress): readonly ReviewSchedule[] {
  const schedules = new Map<string, ReviewSchedule>();
  for (const attempt of parsePracticeProgress(progress).attempts) {
    if (attempt.assisted || attempt.attemptNumber !== 1) continue;
    const key = `${attempt.exerciseId}@${attempt.exerciseVersion}`;
    const previous = schedules.get(key);
    const streak = attempt.correct ? (previous?.independentSuccessStreak ?? 0) + 1 : 0;
    const interval = attempt.correct ? INTERVALS[Math.min(streak - 1, INTERVALS.length - 1)]! : 1;
    schedules.set(key, { exerciseId: attempt.exerciseId, exerciseVersion: attempt.exerciseVersion,
      independentSuccessStreak: streak, dueAt: attempt.at + interval * DAY });
  }
  return [...schedules.values()];
}

/** Due reviews first, then unseen content. Suggestions never hide exercises. */
export function recommendExercises(
  exercises: readonly PracticeExercise[], progress: PracticeProgress, now: number, limit = 3,
): readonly PracticeExercise[] {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(limit) || limit < 0 || limit > 100) {
    throw new Error("Invalid recommendation bounds");
  }
  const schedules = reviewSchedules(progress);
  return exercises.map((exercise, index) => ({ exercise, index,
    schedule: schedules.find((schedule) => schedule.exerciseId === exercise.id && schedule.exerciseVersion === exercise.version) }))
    .filter(({ schedule }) => !schedule || schedule.dueAt <= now)
    .sort((a, b) => (a.schedule ? 0 : 1) - (b.schedule ? 0 : 1) ||
      (a.schedule?.dueAt ?? 0) - (b.schedule?.dueAt ?? 0) || a.index - b.index)
    .slice(0, limit).map(({ exercise }) => exercise);
}

export function loadPracticeProgress(): PracticeProgress {
  try {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    return parsePracticeProgress(raw ? JSON.parse(raw) : null);
  } catch { return { schemaVersion: 1, attempts: [] }; }
}
export function savePracticeProgress(progress: PracticeProgress): void {
  try { localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(parsePracticeProgress(progress))); }
  catch { /* Blocked/full storage: caller can retain the in-memory record. */ }
}

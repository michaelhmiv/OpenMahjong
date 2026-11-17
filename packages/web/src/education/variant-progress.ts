import {
  VARIANT_LESSONS,
  variantLessonQuestions,
  type VariantLesson,
} from "./variant-content.js";
export interface VariantAttempt {
  readonly id: string;
  readonly questionId: string;
  readonly profileId: string;
  readonly contentVersion: 2;
  readonly correct: boolean;
  readonly assisted: boolean;
  readonly at: number;
}
export interface VariantLearningProgress {
  readonly v: 2;
  readonly completed: readonly {
    lessonId: string;
    version: 2;
    profileId: string;
    at: number;
  }[];
  readonly active: Readonly<
    Record<string, { step: number; version: 2; profileId: string; at: number }>
  >;
  readonly attempts: readonly VariantAttempt[];
}
export const emptyVariantProgress = (): VariantLearningProgress => ({
  v: 2,
  completed: [],
  active: {},
  attempts: [],
});
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function parseVariantProgress(input: unknown): VariantLearningProgress {
  const out = emptyVariantProgress();
  if (!record(input) || input["v"] !== 2) return out;
  const completed: VariantLearningProgress["completed"][number][] = [],
    active: Record<string, VariantLearningProgress["active"][string]> = {},
    attempts: VariantAttempt[] = [];
  const lessons = new Map(VARIANT_LESSONS.map((l) => [l.id, l]));
  if (Array.isArray(input["completed"]))
    for (const row of input["completed"].slice(-200))
      if (record(row)) {
        const lesson = lessons.get(String(row["lessonId"]));
        if (
          lesson &&
          row["version"] === lesson.version &&
          row["profileId"] === lesson.profileId &&
          Number.isSafeInteger(row["at"])
        )
          completed.push({
            lessonId: lesson.id,
            version: 2,
            profileId: lesson.profileId,
            at: Number(row["at"]),
          });
      }
  if (record(input["active"]))
    for (const [key, row] of Object.entries(input["active"]).slice(0, 200))
      if (record(row)) {
        const l = lessons.get(key);
        if (
          l &&
          row["version"] === l.version &&
          row["profileId"] === l.profileId &&
          Number.isSafeInteger(row["step"]) &&
          Number(row["step"]) >= 0 &&
          Number(row["step"]) <= l.steps.length &&
          Number.isSafeInteger(row["at"])
        )
          active[key] = {
            step: Number(row["step"]),
            version: 2,
            profileId: l.profileId,
            at: Number(row["at"]),
          };
      }
  const questions = new Map(
    VARIANT_LESSONS.flatMap((l) =>
      variantLessonQuestions(l).map((q) => [q.id, l] as const),
    ),
  );
  if (Array.isArray(input["attempts"]))
    for (const row of input["attempts"].slice(-2000))
      if (record(row)) {
        const lesson = questions.get(String(row["questionId"]));
        if (
          lesson &&
          typeof row["id"] === "string" &&
          row["id"].length <= 128 &&
          row["profileId"] === lesson.profileId &&
          row["contentVersion"] === lesson.version &&
          typeof row["correct"] === "boolean" &&
          typeof row["assisted"] === "boolean" &&
          Number.isSafeInteger(row["at"])
        )
          attempts.push({
            id: row["id"],
            questionId: String(row["questionId"]),
            profileId: lesson.profileId,
            contentVersion: 2,
            correct: row["correct"],
            assisted: row["assisted"],
            at: Number(row["at"]),
          });
      }
  return { v: 2, completed, active, attempts };
}
export function mergeVariantProgress(
  a: VariantLearningProgress,
  b: VariantLearningProgress,
): VariantLearningProgress {
  const complete = new Map<
      string,
      VariantLearningProgress["completed"][number]
    >(),
    attempts = new Map<string, VariantAttempt>();
  for (const row of [...a.completed, ...b.completed])
    if (!complete.has(row.lessonId) || complete.get(row.lessonId)!.at < row.at)
      complete.set(row.lessonId, row);
  for (const row of [...a.attempts, ...b.attempts].sort(
    (x, y) => x.at - y.at || JSON.stringify(x).localeCompare(JSON.stringify(y)),
  ))
    attempts.set(row.id, row);
  const active = { ...a.active };
  for (const [key, row] of Object.entries(b.active))
    if (!active[key] || active[key]!.at < row.at) active[key] = row;
  return parseVariantProgress({
    v: 2,
    completed: [...complete.values()],
    active,
    attempts: [...attempts.values()].slice(-2000),
  });
}
export function lessonStep(
  progress: VariantLearningProgress,
  lesson: VariantLesson,
  step: number,
): VariantLearningProgress {
  return parseVariantProgress({
    ...progress,
    active: {
      ...progress.active,
      [lesson.id]: {
        step,
        version: lesson.version,
        profileId: lesson.profileId,
        at: Date.now(),
      },
    },
  });
}

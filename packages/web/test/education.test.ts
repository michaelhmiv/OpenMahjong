// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { buildTileSet, parseCounts, type PlayerView } from "@openmahjong/engine";
import { MODULES, SKILLS, EDUCATION_RULESET, recommendedModule } from "../src/education/curriculum.js";
import { CURATED_EXERCISES, checkPracticeAnswer, computePracticeAnswer, validateExercise,
  type PracticeExercise } from "../src/education/practice.js";
import { MAX_LESSON_DECISIONS } from "../src/education/lesson-progress.js";
import { LessonController, LessonScene, mergeProgress, parseProgress, distinctQuizValues, waitNames } from "../src/tutorial.js";
import { mergePracticeProgress, parsePracticeProgress, recommendExercises, reviewSchedules,
  skillEvidence, loadPracticeProgress, savePracticeProgress, type PracticeAttempt } from "../src/education/practice-progress.js";

describe("current curriculum", () => {
  it("has acyclic advisory prerequisites and versioned objectives for every actual lesson", () => {
    const visited = new Set<string>();
    for (const entry of MODULES) {
      expect(entry.prerequisites.every((id) => visited.has(id)), entry.id).toBe(true);
      expect(entry.objectives.length).toBeGreaterThan(0);
      expect(entry.rulesets).toContainEqual(EDUCATION_RULESET);
      expect(entry.skills.every((skill) => SKILLS.includes(skill))).toBe(true);
      visited.add(entry.id);
    }
    expect(recommendedModule([])?.id).toBe("tu1");
    expect(recommendedModule(["tu1"])?.id).toBe("tu2");
    // Prerequisites guide suggestions and do not bar directly opening later content.
    expect(new LessonController("tu7").view().text).toContain("Dora");
  });
});

describe("practice publication gate", () => {
  for (const exercise of CURATED_EXERCISES) {
    it(`${exercise.id}: authored answer agrees with the actual rules`, () => {
      expect(validateExercise(exercise)).toEqual({ valid: true, errors: [] });
      expect(checkPracticeAnswer(exercise, exercise.expected).correct).toBe(true);
    });
  }
  it("rejects a plausible but wrong answer and impossible five-copy positions", () => {
    const wait = CURATED_EXERCISES.find((exercise) => exercise.id === "wait-ryanmen")!;
    expect(validateExercise({ ...wait, expected: [2] }).valid).toBe(false);
    const impossible = parseCounts("123m123p123s777z5m");
    impossible[33] = 5;
    expect(validateExercise({ ...wait, position: { counts: impossible } }).valid).toBe(false);
    expect(validateExercise({ ...wait, ruleset: { id: "wrc", version: 2025 } }).valid).toBe(false);
  });
  it("gives every curated exercise a hint and counts extra/missing picks without naming them", () => {
    for (const exercise of CURATED_EXERCISES) {
      expect(exercise.hint.trim().length, exercise.id).toBeGreaterThan(0);
    }
    const recognition = CURATED_EXERCISES.find((exercise) => exercise.id === "recognize-honors")!;
    const stale = checkPracticeAnswer(recognition, [0, 2, 4, 6]);
    expect(stale.correct).toBe(false);
    expect(stale.extraPicks).toBe(1);
    expect(stale.missingPicks).toBe(0);
    expect(stale.hint).toBe(recognition.hint);
    const short = checkPracticeAnswer(recognition, [2]);
    expect(short.extraPicks).toBe(0);
    expect(short.missingPicks).toBe(2);
    const scalar = checkPracticeAnswer(
      CURATED_EXERCISES.find((exercise) => exercise.id === "shanten-single-wait")!, 1);
    expect(scalar.extraPicks).toBeUndefined();
    expect(scalar.missingPicks).toBeUndefined();
  });
  it("accepts unordered selections without coercing string answers into tile indices", () => {
    const recognition = CURATED_EXERCISES[0]!;
    expect(checkPracticeAnswer(recognition, [6, 2, 4]).correct).toBe(true);
    expect(checkPracticeAnswer(recognition, ["6", "2", "4"]).correct).toBe(false);
    expect(checkPracticeAnswer(recognition, [2, 4]).correct).toBe(false);
  });
  it("distinguishes structural waits from unavailable improving copies", () => {
    const wait = CURATED_EXERCISES.find((exercise) => exercise.id === "wait-tanki")!;
    expect(computePracticeAnswer(wait)).toEqual([4]);
    const acceptance = CURATED_EXERCISES.find((exercise) => exercise.id === "ukeire-visible")!;
    const feedback = checkPracticeAnswer(acceptance, [4]);
    expect(feedback.facts).toEqual({ shanten: 0, unseenImprovingCopies: 1 });
    const exhausted = { ...acceptance, position: { counts: parseCounts("123m123p123s777z5m"),
      visibleOutsideHand: parseCounts("555m") }, expected: [] } as PracticeExercise;
    expect(computePracticeAnswer(exhausted)).toEqual([]);
    expect(validateExercise(exhausted).valid).toBe(true);
  });
  it("rejects malformed imported content without throwing or computing a large hand", () => {
    for (const raw of [null, [], {}, { ...CURATED_EXERCISES[0], tiles: new Array(10_000).fill(0) },
      { ...CURATED_EXERCISES[0], category: "flowers" }]) {
      expect(validateExercise(raw).valid).toBe(false);
    }
  });
});

describe("bounded lesson resume", () => {
  const state = { module: "tu1", step: 2, scene: null, counters: {}, found: [] };
  it("migrates existing unversioned records and deduplicates completions", () => {
    const progress = parseProgress({ done: ["tu1", "tu1", "future"], active: state });
    expect(progress.done).toEqual(["tu1"]);
    expect(progress.active?.moduleVersion).toBe(3);
    expect(new LessonController("tu1", progress.active).stepIndex).toBe(2);
  });
  it("drops invalid bounds, unknown content versions and oversized action logs", () => {
    for (const step of [-1, NaN, Infinity, 1.2, 100000]) {
      expect(parseProgress({ active: { ...state, step } }).active).toBeNull();
    }
    expect(parseProgress({ active: { ...state, moduleVersion: 999 } }).active).toBeNull();
    expect(parseProgress({ active: { module: "tu3", step: 1, counters: {}, found: [],
      scene: { seed: "om-tu3", decisions: new Array(MAX_LESSON_DECISIONS + 1).fill({ type: "pass" }) } } }).active).toBeNull();
    expect(parseProgress({ active: { ...state, found: "wrong" } }).active).toBeNull();
  });
  it("cannot consume wrong-phase actions or poison the live scenario after rejection", () => {
    const scene = new LessonScene("om-tu3");
    const events = JSON.stringify(scene.events);
    expect(() => scene.act({ type: "daiminkan" })).toThrow("Invalid lesson turn");
    expect(() => scene.act({ type: "discard", tileId: 999 })).toThrow("Invalid lesson action");
    expect(scene.decisions).toEqual([]);
    expect(JSON.stringify(scene.events)).toBe(events);
    expect(() => LessonScene.restore("om-tu3", [{ type: "pon" }])).toThrow("Invalid lesson turn");
  });
  it("restarts an unreplayable snapshot while preserving separate completion records", () => {
    const progress = parseProgress({ done: ["tu1", "tu2"], active: { module: "tu3", step: 1,
      counters: {}, found: [], scene: { seed: "om-tu3", decisions: [{ type: "pon" }] } } });
    const lesson = new LessonController("tu3", progress.active);
    expect(lesson.stepIndex).toBe(0);
    expect(lesson.view().note).toContain("restarted");
    expect(progress.done).toEqual(["tu1", "tu2"]);
  });
  it("keeps the selected tile instances for every chi in a multi-call scene", () => {
    const scene = new LessonScene("om-tu4chi-5");
    let guard = 0;
    while (scene.stop?.kind !== "gameEnd" &&
      scene.events.filter((event) => event.type === "call" && event["kind"] === "chi").length < 2 && guard++ < 100) {
      scene.auto();
    }
    const calls = scene.events.filter((event) => event.type === "call" && event["kind"] === "chi");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every((event) => scene.chiHints.has(event.seq))).toBe(true);
    const restored = LessonScene.restore(scene.seed, scene.decisions);
    expect([...restored.chiHints]).toEqual([...scene.chiHints]);
  }, 60_000);
  it("does not name a fifth owned copy as a winning tile", () => {
    const tiles = buildTileSet();
    // Public hand fragment: 111m is a declared pon, the fourth 1m is
    // isolated beside three completed sequences. A fifth 1m cannot
    // complete its apparent pair wait.
    const meld = { kind: "pon" as const, tiles: [tiles[0]!, tiles[1]!, tiles[2]!] };
    const counts = parseCounts("234p567p789s");
    const hand = [tiles[3]!, ...counts.flatMap((count, type) =>
      Array.from({ length: count }, (_, copy) => tiles[type * 4 + copy]!))];
    const view = { hand, melds: [meld], players: [{ discards: [], melds: [meld] }],
      doraIndicators: [] } as unknown as PlayerView;
    expect(waitNames(view)).toEqual([]);
  });
  it("prefers an incomplete active lesson when local and account completions union", () => {
    const local = parseProgress({ done: [], active: state });
    const account = parseProgress({ done: ["tu1"], active: { ...state, module: "tu2", step: 1 } });
    expect(mergeProgress(local, account).active?.module).toBe("tu2");
  });
  it("restarts a scoring snapshot that has no recorded win rather than inventing quiz facts", () => {
    const lesson = new LessonController("tu8", { module: "tu8", step: 2, counters: {}, found: [],
      scene: { seed: "om-tu5a-261", decisions: [] } });
    expect(lesson.stepIndex).toBe(0);
    expect(lesson.view().note).toContain("restarted");
    expect(() => lesson.winHan()).toThrow("No recorded win");
  });
  it("keeps exactly one correct number at the same selection index at quiz boundaries", () => {
    for (const [answer, gap, minimum] of [[1, 1, 1], [20, 10, 0], [25, 10, 0], [0, 10, 0]]) {
      const values = distinctQuizValues(answer!, gap!, minimum!);
      expect(values[1]).toBe(answer);
      expect(new Set(values).size).toBe(3);
      expect(values.every((value) => value >= minimum!)).toBe(true);
    }
  });
});

function attempt(overrides: Partial<PracticeAttempt> = {}): PracticeAttempt {
  return { schemaVersion: 1, taxonomyVersion: 1, id: "attempt-1", exerciseId: "wait-tanki",
    exerciseVersion: 1, ruleset: EDUCATION_RULESET, skill: "wait-reading", at: 1_000,
    correct: false, assisted: false, attemptNumber: 1, responseMs: 1_000, ...overrides };
}

describe("evidence and transparent spaced review", () => {
  beforeEach(() => localStorage.clear());
  it("keeps hints and retries out of independent accuracy and review intervals", () => {
    const progress = parsePracticeProgress({ schemaVersion: 1, attempts: [attempt(),
      attempt({ id: "retry", at: 2_000, correct: true, attemptNumber: 2 }),
      attempt({ id: "hint", at: 3_000, correct: true, assisted: true })] });
    const evidence = skillEvidence(progress).find((entry) => entry.skill === "wait-reading");
    expect(evidence).toMatchObject({ unassistedFirstAttempts: 1, unassistedCorrect: 0,
      assistedAttempts: 1, retries: 1, accuracy: 0, lastSuccessfulAt: null });
    expect(reviewSchedules(progress)).toEqual([{ exerciseId: "wait-tanki", exerciseVersion: 1,
      independentSuccessStreak: 0, dueAt: 1_000 + 86_400_000 }]);
  });
  it("grows review intervals 1 -> 3 days, then resets on an independent error", () => {
    const progress = parsePracticeProgress({ schemaVersion: 1, attempts: [
      attempt({ id: "first", correct: true }), attempt({ id: "second", at: 100_000_000, correct: true })] });
    expect(reviewSchedules(progress)[0]).toMatchObject({ independentSuccessStreak: 2, dueAt: 100_000_000 + 3 * 86_400_000 });
    const failed = mergePracticeProgress(progress, { schemaVersion: 1, attempts: [attempt({ id: "third", at: 400_000_000 })] });
    expect(reviewSchedules(failed)[0]).toMatchObject({ independentSuccessStreak: 0, dueAt: 400_000_000 + 86_400_000 });
  });
  it("deduplicates offline merges, ignores incompatible versions, and persists locally", () => {
    const progress = parsePracticeProgress({ schemaVersion: 1, attempts: [attempt(), attempt(),
      attempt({ id: "future", taxonomyVersion: 99 as 1 }), attempt({ id: "nan", at: NaN })] });
    expect(progress.attempts).toHaveLength(1);
    expect(mergePracticeProgress(progress, progress).attempts).toHaveLength(1);
    savePracticeProgress(progress);
    expect(loadPracticeProgress()).toEqual(progress);
    expect(skillEvidence({ schemaVersion: 1, attempts: [] }).every((entry) => entry.accuracy === null)).toBe(true);
  });
  it("recommends due practice from actual mistakes before unseen exercises without hiding content", () => {
    const progress = { schemaVersion: 1 as const, attempts: [attempt()] };
    expect(recommendExercises(CURATED_EXERCISES, progress, 90_000_000, 1)[0]?.id).toBe("wait-tanki");
    expect(recommendExercises(CURATED_EXERCISES, progress, 2_000, 1)[0]?.id).toBe("recognize-honors");
    expect(CURATED_EXERCISES.some((exercise) => exercise.id === "wait-tanki")).toBe(true);
  });
});

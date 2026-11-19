/** Approved Practice surface. Facts and grading stay in the education core. */
import { tileTypeName } from "@openmahjong/engine";
import { SKILL_TAXONOMY_VERSION, type SkillId } from "./education/curriculum.js";
import { CURATED_EXERCISES, checkPracticeAnswer, validateExercise,
  type PracticeAnswer, type PracticeExercise, type PracticeFeedback } from "./education/practice.js";
import { loadPracticeProgress, mergePracticeProgress, parsePracticeProgress, savePracticeProgress,
  recommendExercises, skillEvidence, type PracticeAttempt, type PracticeProgress } from "./education/practice-progress.js";
import { newGameId } from "./records.js";
import { getEnglishKeys, t, tx } from "./i18n/index.js";

export const PRACTICE_SESSION_KEY = "openmahjong.practice-session.v1";
export interface PracticeViewOptions {
  readonly progress?: PracticeProgress;
  readonly initialExerciseId?: string;
  readonly initialSkill?: SkillId;
  readonly renderTile: (tileType: number) => HTMLElement;
  readonly onChangeProgress?: (progress: PracticeProgress) => void;
  readonly onBack: () => void;
  readonly onReview?: () => void;
  /** App-owned saved studies/decisions are recreated with every exercise render. */
  readonly renderSupplement?: () => HTMLElement | null;
  readonly persistLocally?: boolean;
  readonly sessionKey?: string;
  readonly now?: () => number;
}

const NAMES: Partial<Record<SkillId, string>> = {
  "tile-recognition": "Tile recognition", "hand-construction": "Winning shapes",
  shanten: "Shanten", ukeire: "Ukeire", "wait-reading": "Wait reading",
  yaku: "Yaku recognition", scoring: "Scoring", defense: "Defense",
};

/** Exercise prompt / explanation / hint are data strings, minted by the
 *  extractor under learn.practice.<slug> — with "-2" suffixes where two
 *  different strings slugify alike, so the key cannot be derived from
 *  the slug alone. The English value is the identity: resolve by value
 *  within the namespace (its 90 values are all distinct — the
 *  derived-keys test asserts every field resolves to exactly one key).
 *  An unminted string renders as-is rather than leaking a key id. */
const PRACTICE_KEY_BY_VALUE = new Map<string, string>();
for (const [key, entry] of Object.entries(getEnglishKeys())) {
  if (key.startsWith("learn.practice.") && !PRACTICE_KEY_BY_VALUE.has(entry.value)) {
    PRACTICE_KEY_BY_VALUE.set(entry.value, key);
  }
}
function practiceText(value: string): string {
  const key = PRACTICE_KEY_BY_VALUE.get(value);
  return key ? t(key) : value;
}
const YAKU = { tanyao: "Tanyao", pinfu: "Pinfu", riichi: "Riichi",
  chiitoitsu: "Seven pairs", toitoi: "All triplets" } as const;
const HONORS = ["East", "South", "West", "North", "White dragon", "Green dragon", "Red dragon"];
const tileLabel = (type: number) => type < 27 ? tileTypeName(type) : HONORS[type - 27]!;
const DAY = 86_400_000;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(text: string, cls: string, action: () => void): HTMLButtonElement {
  const result = el("button", cls, text);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
function isObject(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

/** The App can own account-aware persistence: persistLocally=false never reads
 * or writes the guest attempt store. sessionKey must identify that same owner. */
export function createPracticeView(options: PracticeViewOptions): HTMLElement {
  const now = options.now ?? Date.now;
  const local = options.persistLocally !== false;
  let progress = local ? mergePracticeProgress(loadPracticeProgress(), options.progress ?? { schemaVersion: 1, attempts: [] })
    : parsePracticeProgress(options.progress);
  const exercises = CURATED_EXERCISES.filter((exercise) => validateExercise(exercise).valid);
  const skills = [...new Set(exercises.map((exercise) => exercise.skill))];
  const sessionKey = options.sessionKey ?? PRACTICE_SESSION_KEY;
  let saved: Record<string, unknown> | null = null;
  try { const text = localStorage.getItem(sessionKey); if (text && text.length <= 16_384) {
    const raw: unknown = JSON.parse(text); if (isObject(raw) && raw["v"] === 1) saved = raw;
  } } catch { /* Blocked or corrupt storage cannot prevent practice. */ }
  const initialPool = options.initialSkill ? exercises.filter((entry) => entry.skill === options.initialSkill) : exercises;
  let exercise = exercises.find((entry) => entry.id === options.initialExerciseId) ??
    exercises.find((entry) => entry.id === saved?.["exerciseId"] &&
      (!options.initialSkill || entry.skill === options.initialSkill)) ??
    recommendExercises(initialPool, progress, Math.max(0, Math.floor(now())), 1)[0] ?? initialPool[0] ?? exercises[0]!;
  let selected = new Set<number | string>();
  let scalar: boolean | number | null = null;
  let attempts = 0;
  let assisted = false;
  let feedback: PracticeFeedback | null = null;
  let completed = false;
  let startedAt = now();
  let lastAttemptId: string | null = null;
  let validationMessage: string | null = null;
  const visited = new Set<string>([exercise.id]);
  const root = el("div", "learning-shell practice-view");
  const saveSession = () => {
    try { localStorage.setItem(sessionKey, JSON.stringify({ v: 1, exerciseId: exercise.id,
      exerciseVersion: exercise.version, selected: [...selected], scalar, attempts, assisted,
      completed, lastAttemptId })); } catch { /* In-memory practice remains usable. */ }
  };
  const answer = (): PracticeAnswer => exercise.kind === "shape" ? scalar as boolean :
    exercise.kind === "shanten" || exercise.kind === "scoring" ? scalar as number :
    [...selected] as number[] | string[];
  if (saved?.["exerciseId"] === exercise.id && saved["exerciseVersion"] === exercise.version) {
    const rawSelected = saved["selected"];
    if (Array.isArray(rawSelected) && rawSelected.length <= 136 && rawSelected.every((value) =>
      typeof value === "string" ? value.length <= 80 : Number.isInteger(value) && value >= 0 && value <= 135)) {
      selected = new Set(rawSelected as (number | string)[]);
    }
    if (typeof saved["scalar"] === "boolean" || (typeof saved["scalar"] === "number" && Number.isSafeInteger(saved["scalar"]))) scalar = saved["scalar"];
    if (typeof saved["attempts"] === "number" && Number.isInteger(saved["attempts"]) && saved["attempts"] >= 0 && saved["attempts"] <= 100) attempts = saved["attempts"];
    assisted = saved["assisted"] === true || attempts > 0;
    if (typeof saved["lastAttemptId"] === "string") {
      const previous = progress.attempts.find((attempt) => attempt.id === saved!["lastAttemptId"] &&
        attempt.exerciseId === exercise.id && attempt.exerciseVersion === exercise.version);
      if (previous) {
        lastAttemptId = previous.id;
        attempts = Math.max(attempts, previous.attemptNumber);
        const checked = checkPracticeAnswer(exercise, answer());
        if (saved["completed"] === true && previous.correct && checked.correct) {
          completed = true; feedback = checked;
        }
      }
    }
  }
  const start = (next: PracticeExercise) => {
    exercise = next;
    selected = new Set(); scalar = null; attempts = 0;
    assisted = visited.has(next.id); visited.add(next.id);
    feedback = null; completed = false; lastAttemptId = null;
    startedAt = now(); validationMessage = null;
    saveSession(); render();
  };
  const toggle = (value: number | string) => {
    if (completed) return;
    if (selected.has(value)) selected.delete(value); else selected.add(value);
    feedback = null; validationMessage = null; saveSession(); render();
    [...root.querySelectorAll<HTMLElement>("[data-answer]")]
      .find((candidate) => candidate.dataset["answer"] === String(value))?.focus();
  };
  const submit = () => {
    if (completed) return;
    if ((exercise.kind === "shape" && typeof scalar !== "boolean") ||
      ((exercise.kind === "shanten" || exercise.kind === "scoring") &&
        (typeof scalar !== "number" || !Number.isSafeInteger(scalar)))) {
      validationMessage = exercise.kind === "shape" ? tx("learn.practice.ui.choose-a-shape-answer-first", "Choose a shape answer first.") : tx("learn.practice.ui.enter-a-whole-number-before-checking", "Enter a whole number before checking.");
      render(); return;
    }
    feedback = checkPracticeAnswer(exercise, answer());
    attempts = Math.min(100, attempts + 1);
    const timestamp = Math.max(0, Math.floor(now()));
    const attempt: PracticeAttempt = { schemaVersion: 1, taxonomyVersion: SKILL_TAXONOMY_VERSION,
      id: newGameId(), exerciseId: exercise.id, exerciseVersion: exercise.version,
      ruleset: exercise.ruleset, skill: exercise.skill, at: timestamp,
      correct: feedback.correct, assisted, attemptNumber: attempts,
      responseMs: Math.min(DAY, Math.max(0, timestamp - startedAt)) };
    lastAttemptId = attempt.id;
    progress = mergePracticeProgress(progress, { schemaVersion: 1, attempts: [attempt] });
    if (local) savePracticeProgress(progress);
    options.onChangeProgress?.(progress);
    completed = feedback.correct;
    // Feedback has been shown (hint or explanation), so subsequent
    // responses are aided.
    assisted = true;
    validationMessage = null; saveSession(); render();
    root.querySelector<HTMLElement>(".feedback")?.focus();
    if (completed) root.querySelector<HTMLElement>("[data-practice-next]")?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  };
  const tile = (type: number): HTMLElement => options.renderTile(type);
  const hand = (types: readonly number[], label: string): HTMLElement => {
    const card = el("div", "card hand-card");
    card.append(el("div", "card-label", label));
    const row = el("div", "hand"); row.setAttribute("aria-label", label);
    for (const type of types) row.append(tile(type));
    card.append(row); return card;
  };
  const selection = (value: number | string, label: string, type?: number): HTMLButtonElement => {
    const item = button("", "answer", () => toggle(value));
    item.dataset["answer"] = String(value);
    item.setAttribute("aria-label", tx("learn.practice.ui.select-0", `Select ${label}`, label));
    item.setAttribute("aria-pressed", String(selected.has(value)));
    item.disabled = completed;
    if (type !== undefined) { const graphic = tile(type); graphic.setAttribute("aria-hidden", "true"); item.append(graphic); }
    item.append(el("span", "", tx("learn.practice.ui.v-0-1", `${label}${selected.has(value) ? " ✓" : ""}`, label, selected.has(value) ? " ✓" : "")));
    return item;
  };
  function render(): void {
    root.replaceChildren(); root.dataset["exerciseId"] = exercise.id;
    const header = el("header", "learning-header");
    const back = button("‹", "back", options.onBack); back.setAttribute("aria-label", tx("learn.practice.ui.back", "Back"));
    const help = button("?", "help", () => { assisted = true; saveSession();
      const explanation = root.querySelector<HTMLDetailsElement>(".practice-explanation");
      if (explanation) { explanation.open = true; explanation.querySelector("summary")?.focus(); }
    }); help.setAttribute("aria-label", tx("learn.practice.ui.explain-this-exercise", "Explain this exercise"));
    header.append(back, el("div", "wordmark", tx("learn.practice.ui.open-mahjong", "OPEN MAHJONG")), help);
    root.append(header);
    const content = el("section", "learning-content content");
    content.tabIndex = 0; content.setAttribute("aria-label", tx("learn.practice.ui.practice-exercise", "Practice exercise"));
    const selectors = el("div", "practice-selectors");
    const categoryLabel = el("label", "", tx("learn.practice.ui.practice-category", "Practice category"));
    const category = el("select"); category.setAttribute("aria-label", tx("learn.practice.ui.practice-category", "Practice category"));
    for (const skill of skills) { const option = el("option", "", tx(`learn.practice.skill.${skill}`, NAMES[skill] ?? skill)); option.value = skill; category.append(option); }
    category.value = exercise.skill;
    category.addEventListener("change", () => start(exercises.find((entry) => entry.skill === category.value)!));
    categoryLabel.append(category);
    const exerciseLabel = el("label", "", tx("learn.practice.ui.exercise", "Exercise"));
    const choose = el("select"); choose.setAttribute("aria-label", tx("learn.practice.ui.exercise", "Exercise"));
    for (const entry of exercises.filter((entry) => entry.skill === exercise.skill)) {
      const option = el("option", "", entry.id.replace(/-/g, " ")); option.value = entry.id; choose.append(option);
    }
    choose.value = exercise.id;
    choose.addEventListener("change", () => start(exercises.find((entry) => entry.id === choose.value)!));
    exerciseLabel.append(choose); selectors.append(categoryLabel, exerciseLabel); content.append(selectors);
    const group = exercises.filter((entry) => entry.skill === exercise.skill);
    content.append(el("div", "eyebrow", tx("learn.practice.ui.v-0-exercise-1-of-2", `${tx(`learn.practice.skill.${exercise.skill}`, NAMES[exercise.skill] ?? exercise.skill).toUpperCase()} · EXERCISE ${group.indexOf(exercise) + 1} OF ${group.length}`, tx(`learn.practice.skill.${exercise.skill}`, NAMES[exercise.skill] ?? exercise.skill).toUpperCase(), group.indexOf(exercise) + 1, group.length)),
      el("h1", "", tx(`learn.practice.skill.${exercise.skill}`, NAMES[exercise.skill] ?? "Practice")), el("p", "intro", practiceText(exercise.prompt)));
    if ("position" in exercise) {
      const counts = "counts" in exercise.position ? exercise.position.counts : exercise.position.handCounts;
      const types = counts.flatMap((count, type) => Array.from({ length: count }, () => type));
      content.append(hand(types, tx("learn.practice.ui.your-0-tiles", `YOUR ${types.length} TILES`, types.length)));
      if (exercise.kind === "ukeire") {
        const visible = exercise.position.visibleOutsideHand.flatMap((count, type) => Array.from({ length: count }, () => type));
        if (visible.length) content.append(hand(visible, tx("learn.practice.ui.visible-outside-your-hand", "VISIBLE OUTSIDE YOUR HAND")));
      }
    } else if (exercise.kind === "defense") content.append(hand(exercise.discarded, tx("learn.practice.ui.riichi-opponents-discards", "RIICHI OPPONENT'S DISCARDS")));
    const answers = el("div", "answers"); answers.setAttribute("aria-label", tx("learn.practice.ui.answer-choices", "Answer choices"));
    if (exercise.kind === "recognition") exercise.tiles.forEach((type, index) => answers.append(selection(index, tileLabel(type), type)));
    else if (exercise.kind === "waits" || exercise.kind === "ukeire") {
      for (let type = 0; type < 34; type++) if (!completed || selected.has(type)) answers.append(selection(type, tileLabel(type), type));
    } else if (exercise.kind === "defense") exercise.candidates.forEach((type) => answers.append(selection(type, tileLabel(type), type)));
    else if (exercise.kind === "yaku") {
      for (const [id, name] of Object.entries(YAKU)) answers.append(selection(id, tx(`learn.practice.yaku.${id}`, name)));
    } else if (exercise.kind === "shape") {
      for (const value of [true, false]) {
        const item = button(value ? tx("learn.practice.ui.complete-shape", "Complete shape") : tx("learn.practice.ui.incomplete-shape", "Incomplete shape"), "answer", () => {
          if (completed) return; scalar = value; feedback = null; saveSession(); render();
        });
        item.setAttribute("aria-pressed", String(scalar === value)); item.disabled = completed; answers.append(item);
      }
    } else {
      const label = el("label", "numeric-answer", exercise.kind === "scoring" ? tx("learn.practice.ui.your-answer-points", "Your answer (points)") : tx("learn.practice.ui.your-answer-shanten", "Your answer (shanten)"));
      const input = el("input"); input.type = "number"; input.step = "1";
      input.setAttribute("aria-label", label.textContent!); input.inputMode = "numeric";
      input.value = typeof scalar === "number" ? String(scalar) : ""; input.disabled = completed;
      input.addEventListener("input", () => { scalar = input.value === "" ? null : Number(input.value); feedback = null; saveSession(); });
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } });
      label.append(input); answers.append(label);
    }
    content.append(answers);
    if (validationMessage) { const message = el("p", "dim", validationMessage); message.setAttribute("role", "alert"); content.append(message); }
    if (feedback) {
      const box = el("div", "card feedback"); box.tabIndex = -1; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
      box.append(el("h2", "", feedback.correct ? tx("learn.practice.ui.correct", "Correct") : tx("learn.practice.ui.try-again", "Try again")));
      if (feedback.correct) {
        // The explanation names the answer, so it renders only once
        // the exercise is answered correctly. While it is still open,
        // feedback is the hint alone — never pick counts: exact
        // belong/missing counts are a membership oracle (submit one
        // tile, read "0 picks do not belong", and that tile is
        // certified), which let every multi-tile exercise be solved
        // by elimination. The grading layer still computes the
        // counts for its own records; they are not shown.
        box.append(el("p", "", practiceText(feedback.explanation)));
      } else {
        box.append(el("p", "", practiceText(feedback.hint)));
        if (typeof feedback.extraPicks === "number" && typeof feedback.missingPicks === "number") {
          if (exercise.kind === "recognition" || exercise.kind === "waits" ||
            exercise.kind === "ukeire" || exercise.kind === "defense") {
            box.append(el("p", "dim", tx("learn.practice.ui.tap-a-picked-tile-again-to-un-pick-it", "Tap a picked tile again to un-pick it.")));
          }
        }
      }
      if (exercise.kind === "waits") box.append(el("p", "dim", tx("learn.practice.ui.this-checks-the-hands-shape-a-legal-win-also-nee", "This checks the hand's shape. A legal win also needs a yaku and must satisfy furiten rules.")));
      if (typeof feedback.facts[tx("learn.practice.ui.unseenimprovingcopies", "unseenImprovingCopies")] === "number") box.append(el("p", "dim", tx("learn.practice.ui.v-0-unseen-improving-copies-their-actual-locations", `${feedback.facts[tx("learn.practice.ui.unseenimprovingcopies", "unseenImprovingCopies")]} unseen improving copies; their actual locations are unknown.`, feedback.facts[tx("learn.practice.ui.unseenimprovingcopies", "unseenImprovingCopies")])));
      content.append(box);
    }
    const details = el("details", "practice-explanation");
    const summary = el("summary", "", tx("learn.practice.ui.show-explanation", "Show explanation"));
    // The browser queues `toggle`; record assistance in the opening click
    // itself so a quick subsequent submission cannot be counted independent.
    summary.addEventListener("click", () => { if (!details.open) { assisted = true; saveSession(); } });
    details.append(summary, el("p", "", practiceText(exercise.explanation)));
    details.addEventListener("toggle", () => { if (details.open) { assisted = true; saveSession(); } });
    content.append(details);
    const primary = button(completed ? tx("learn.practice.ui.next-exercise", "Next exercise") : tx("learn.practice.ui.check-answer", "Check answer"), "primary", completed ? () => {
      const group = exercises.filter((entry) => entry.skill === exercise.skill);
      start(group[(group.indexOf(exercise) + 1) % group.length]!);
    } : submit);
    if (completed) primary.dataset["practiceNext"] = "true";
    content.append(primary);
    content.append(el("p", "source", tx("learn.practice.ui.openmahjong-riichi-exact-rules-check", "OpenMahjong riichi · exact rules check")));
    const evidence = skillEvidence(progress).find((entry) => entry.skill === exercise.skill)!;
    const stats = el("details", "practice-evidence"); stats.append(el("summary", "", tx("learn.practice.ui.your-practice-evidence", "Your practice evidence")));
    stats.append(el("p", "dim", tx("learn.practice.ui.v-0-correct-of-1-independent-first-responses-2-ass", `${evidence.unassistedCorrect} correct of ${evidence.unassistedFirstAttempts} independent first responses · ${evidence.assistedAttempts} assisted · ${evidence.retries} retries. Lesson completion is separate from this evidence.`, evidence.unassistedCorrect, evidence.unassistedFirstAttempts, evidence.assistedAttempts, evidence.retries)));
    const recommended = recommendExercises(exercises.filter((entry) => entry.id !== exercise.id), progress,
      Math.max(0, Math.floor(now())), 1)[0];
    stats.append(el("p", "dim", tx("learn.practice.ui.recommendations-prioritize-due-reviews-then-unse", "Recommendations prioritize due reviews, then unseen exercises. Every exercise remains available in the selectors.")));
    if (recommended) stats.append(button(tx("learn.practice.ui.recommended-practice", "Recommended practice"), "primary", () => start(recommended)));
    stats.append(el("p", "dim", tx("learn.practice.ui.browser-only-progress-can-be-lost-when-site-data", "Browser-only progress can be lost when site data is removed. Accuracy is practice evidence, not a competitive skill rating.")));
    content.append(stats);
    const supplement = options.renderSupplement?.();
    if (supplement) content.append(supplement);
    if (options.onReview) content.append(button(tx("learn.practice.ui.return-to-review", "Return to review"), "primary", options.onReview));
    root.append(content);
  }
  saveSession(); render(); return root;
}

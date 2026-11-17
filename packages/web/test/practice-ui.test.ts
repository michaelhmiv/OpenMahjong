// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeView, PRACTICE_SESSION_KEY } from "../src/practice-ui.js";
import { CURATED_EXERCISES, type PracticeExercise } from "../src/education/practice.js";
import { PRACTICE_STORAGE_KEY, loadPracticeProgress, skillEvidence,
  type PracticeProgress } from "../src/education/practice-progress.js";

function renderTile(type: number): HTMLElement {
  const tile = document.createElement("span"); tile.className = "tile";
  tile.dataset["tileType"] = String(type); tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", `Tile ${type}`); return tile;
}
function mount(id?: string, overrides: Partial<Parameters<typeof createPracticeView>[0]> = {}): HTMLElement {
  const view = createPracticeView({ renderTile, onBack: vi.fn(),
    ...(id ? { initialExerciseId: id } : {}), now: () => 100_000, ...overrides });
  document.body.replaceChildren(view); return view;
}
function click(view: HTMLElement, label: string): void {
  const target = [...view.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.getAttribute("aria-label") === label || button.textContent === label);
  if (!target) throw new Error(`No button ${label}`);
  target.click();
}
function answerChoice(view: HTMLElement, value: string | number): void {
  const target = [...view.querySelectorAll<HTMLButtonElement>("[data-answer]")]
    .find((button) => button.dataset["answer"] === String(value));
  if (!target) throw new Error(`No answer ${value}`);
  target.click();
}
function number(view: HTMLElement, value: number): void {
  const input = view.querySelector<HTMLInputElement>('input[type="number"]')!;
  input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true }));
}
function correctAnswer(view: HTMLElement, exercise: PracticeExercise): void {
  if (exercise.kind === "shape") click(view, exercise.expected ? "Complete shape" : "Incomplete shape");
  else if (exercise.kind === "scoring" || exercise.kind === "shanten") number(view, exercise.expected);
  else for (const value of exercise.expected) answerChoice(view, value);
  click(view, "Check answer");
}

beforeEach(() => { localStorage.clear(); document.body.replaceChildren(); });

describe("approved Practice interactions", () => {
  it("keeps a wrong wait answer, restores its retry state, and separates it from independent accuracy", () => {
    const changed = vi.fn();
    let view = mount("wait-ryanmen", { onChangeProgress: changed });
    click(view, "Select 3m"); click(view, "Check answer");
    expect(view.dataset["exerciseId"]).toBe("wait-ryanmen");
    expect(view.querySelector(".feedback h2")?.textContent).toBe("Try again");
    expect(view.textContent).not.toContain("Next exercise");
    expect(loadPracticeProgress().attempts[0]).toMatchObject({ correct: false, assisted: false, attemptNumber: 1 });
    view = mount(undefined, { onChangeProgress: changed });
    expect(view.dataset["exerciseId"]).toBe("wait-ryanmen");
    expect(view.querySelector('[data-answer="2"]')?.getAttribute("aria-pressed")).toBe("true");
    click(view, "Select 6m"); click(view, "Check answer");
    expect(view.querySelector(".feedback h2")?.textContent).toBe("Correct");
    expect(view.querySelectorAll(".answers .answer")).toHaveLength(2);
    expect(loadPracticeProgress().attempts).toHaveLength(2);
    expect(loadPracticeProgress().attempts.find((attempt) => attempt.attemptNumber === 2)).toMatchObject({ correct: true, assisted: true, attemptNumber: 2 });
    expect(skillEvidence(loadPracticeProgress()).find((entry) => entry.skill === "wait-reading"))
      .toMatchObject({ unassistedFirstAttempts: 1, unassistedCorrect: 0, retries: 1, accuracy: 0 });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(mount().querySelector(".feedback h2")?.textContent).toBe("Correct");
  });

  it("recognize-honors journey: a stale wrong pick keeps the exercise wrong, feedback teaches without naming the answer, un-picking corrects it", () => {
    const exercise = CURATED_EXERCISES.find((entry) => entry.id === "recognize-honors")!;
    const view = mount("recognize-honors");
    // Wrong tile first (index 0 is a suited tile).
    answerChoice(view, 0);
    click(view, "Check answer");
    let feedback = view.querySelector(".feedback")!;
    expect(feedback.querySelector("h2")?.textContent).toBe("Try again");
    expect(feedback.textContent).not.toContain(exercise.explanation);
    expect(feedback.textContent).toContain(exercise.hint);
    expect(feedback.textContent).toContain("1 pick does not belong");
    expect(feedback.textContent).toContain("Tap a picked tile again to un-pick it.");
    // Add exactly the correct set; the stale wrong pick still fails it.
    for (const index of exercise.expected) answerChoice(view, index);
    click(view, "Check answer");
    feedback = view.querySelector(".feedback")!;
    expect(feedback.querySelector("h2")?.textContent).toBe("Try again");
    expect(feedback.textContent).not.toContain(exercise.explanation);
    expect(feedback.textContent).toContain("1 pick does not belong");
    expect(feedback.textContent).toContain("0 picks are missing");
    expect(feedback.textContent).toContain("Tap a picked tile again to un-pick it.");
    // Un-pick the wrong tile; now the answer is correct and the
    // explanation becomes visible.
    answerChoice(view, 0);
    click(view, "Check answer");
    feedback = view.querySelector(".feedback")!;
    expect(feedback.querySelector("h2")?.textContent).toBe("Correct");
    expect(feedback.textContent).toContain(exercise.explanation);
  });

  it("counts immediately revealed explanation answers as assisted and prevents duplicate submit", () => {
    const view = mount("wait-tanki");
    view.querySelector<HTMLElement>(".practice-explanation summary")!.click();
    click(view, "Select 5m");
    const submit = [...view.querySelectorAll("button")].find((button) => button.textContent === "Check answer")!;
    submit.click(); submit.click();
    expect(loadPracticeProgress().attempts).toHaveLength(1);
    expect(loadPracticeProgress().attempts[0]).toMatchObject({ correct: true, assisted: true, attemptNumber: 1 });
    expect(skillEvidence(loadPracticeProgress()).find((entry) => entry.skill === "wait-reading")?.accuracy).toBeNull();
    click(view, "Next exercise");
    expect(view.dataset["exerciseId"]).toBe("wait-ryanmen");
  });

  it("allows direct category/exercise selection without prerequisites or automatic advancement", () => {
    const view = mount();
    const category = view.querySelector<HTMLSelectElement>('[aria-label="Practice category"]')!;
    expect(category.options).toHaveLength(8);
    category.value = "wait-reading"; category.dispatchEvent(new Event("change"));
    const exercise = view.querySelector<HTMLSelectElement>('[aria-label="Exercise"]')!;
    exercise.value = "wait-ryanmen"; exercise.dispatchEvent(new Event("change"));
    expect(view.dataset["exerciseId"]).toBe("wait-ryanmen");
    expect(view.querySelectorAll(".answers button")).toHaveLength(34);
    expect(loadPracticeProgress().attempts).toHaveLength(0);
  });

  it("starts due practice before unseen material while keeping every category selectable", () => {
    const progress: PracticeProgress = { schemaVersion: 1, attempts: [
      { schemaVersion: 1, taxonomyVersion: 1, id: "due-wait", exerciseId: "wait-tanki", exerciseVersion: 1,
        ruleset: { id: "openmahjong-riichi", version: 1 }, skill: "wait-reading", at: 1,
        correct: false, assisted: false, attemptNumber: 1, responseMs: 100 },
      { schemaVersion: 1, taxonomyVersion: 1, id: "not-due-scoring", exerciseId: "score-chiitoitsu", exerciseVersion: 1,
        ruleset: { id: "openmahjong-riichi", version: 1 }, skill: "scoring", at: 89_000_000,
        correct: true, assisted: false, attemptNumber: 1, responseMs: 100 },
    ] };
    const view = mount(undefined, { progress, now: () => 90_000_000 });
    expect(view.dataset["exerciseId"]).toBe("wait-tanki");
    click(view, "Recommended practice");
    expect(view.dataset["exerciseId"]).toBe("recognize-honors");
    const category = view.querySelector<HTMLSelectElement>('[aria-label="Practice category"]')!;
    category.value = "scoring"; category.dispatchEvent(new Event("change"));
    const exercise = view.querySelector<HTMLSelectElement>('[aria-label="Exercise"]')!;
    exercise.value = "score-chiitoitsu"; exercise.dispatchEvent(new Event("change"));
    expect(view.dataset["exerciseId"]).toBe("score-chiitoitsu");
  });

  it("keeps account-owned progress out of guest storage and restores an owner-scoped session", () => {
    const guest = JSON.stringify({ schemaVersion: 1, attempts: [] });
    localStorage.setItem(PRACTICE_STORAGE_KEY, guest);
    let account: PracticeProgress = { schemaVersion: 1, attempts: [] };
    const view = mount("score-chiitoitsu", { progress: account, persistLocally: false,
      sessionKey: "account-a:session", onChangeProgress: (value) => { account = value; } });
    number(view, 1600); click(view, "Check answer");
    expect(account.attempts).toHaveLength(1);
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBe(guest);
    expect(localStorage.getItem(PRACTICE_SESSION_KEY)).toBeNull();
    expect(mount(undefined, { progress: account, persistLocally: false,
      sessionKey: "account-a:session" }).querySelector(".feedback h2")?.textContent).toBe("Correct");
    const other = mount("score-chiitoitsu", { progress: { schemaVersion: 1, attempts: [] },
      persistLocally: false, sessionKey: "account-b:session" });
    expect(other.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(other.querySelector(".feedback")).toBeNull();
  });

  it("rejects a missing numeric answer without inventing an attempt", () => {
    const view = mount("score-chiitoitsu"); click(view, "Check answer");
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("whole number");
    expect(loadPracticeProgress().attempts).toHaveLength(0);
  });

  it("retains app-owned saved decisions after answers and exercise changes", () => {
    const openSaved = vi.fn();
    const renderSupplement = () => {
      const details = document.createElement("details"); details.className = "saved-reviews";
      const summary = document.createElement("summary"); summary.textContent = "Saved decisions (1)";
      const open = document.createElement("button"); open.textContent = "Open saved decision";
      open.addEventListener("click", openSaved); details.append(summary, open); return details;
    };
    const view = mount("wait-ryanmen", { renderSupplement });
    expect(view.querySelectorAll(".saved-reviews")).toHaveLength(1);
    click(view, "Select 3m"); click(view, "Check answer");
    expect(view.querySelector(".saved-reviews summary")?.textContent).toBe("Saved decisions (1)");
    click(view, "Select 6m"); click(view, "Check answer");
    expect(view.querySelectorAll(".saved-reviews")).toHaveLength(1);
    click(view, "Next exercise");
    expect(view.dataset["exerciseId"]).toBe("wait-tanki");
    expect(view.querySelectorAll(".saved-reviews")).toHaveLength(1);
    click(view, "Open saved decision");
    expect(openSaved).toHaveBeenCalledOnce();
    const category = view.querySelector<HTMLSelectElement>('[aria-label="Practice category"]')!;
    category.value = "scoring"; category.dispatchEvent(new Event("change"));
    expect(view.querySelectorAll(".saved-reviews")).toHaveLength(1);
  });

  for (const exercise of CURATED_EXERCISES) {
    it(`${exercise.id} accepts its independently authored answer through the actual controls`, () => {
      const view = mount(exercise.id); correctAnswer(view, exercise);
      expect(view.querySelector(".feedback h2")?.textContent).toBe("Correct");
      expect(view.dataset["exerciseId"]).toBe(exercise.id);
      expect(loadPracticeProgress().attempts[0]).toMatchObject({ exerciseId: exercise.id, correct: true });
    });
  }
});

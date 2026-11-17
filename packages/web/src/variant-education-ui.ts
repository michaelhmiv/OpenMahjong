import {
  parseCounts,
  variantAdapter,
  type Tile,
  type VariantId,
} from "@openmahjong/engine";
import {
  VARIANT_LESSONS,
  VARIANT_RELEASES,
  variantLessons,
  type VariantLesson,
  type VariantQuestion,
} from "./education/variant-content.js";
import { mcrPatternGuide } from "./education/mcr-guide.js";
import {
  lessonStep,
  type VariantLearningProgress,
} from "./education/variant-progress.js";
import { trackLessonCompleted, trackLessonStarted } from "./analytics.js";
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const b = el("button", text, "primary");
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
export function mountVariantEducation(
  container: HTMLElement,
  options: {
    variant: VariantId;
    lessonId?: string;
    practice?: boolean;
    initialTopic?: string;
    progress: VariantLearningProgress;
    onProgress: (p: VariantLearningProgress) => void;
    renderTile: (tile: Tile) => HTMLElement;
    onBack: () => void;
    onPlay: () => void;
  },
): { destroy(): void } {
  const resolvedLesson =
    VARIANT_LESSONS.find(
      (l) => l.id === options.lessonId && l.variant === options.variant,
    ) ?? variantLessons(options.variant)[0];
  if (!resolvedLesson)
    throw new Error("Compatible variant content is unavailable");
  const lesson: VariantLesson = resolvedLesson;
  if (!options.practice) trackLessonStarted(lesson.id);
  let progress = options.progress,
    step = progress.active[lesson.id]?.step ?? 0,
    chosen: number | undefined,
    checked = false,
    correct = false,
    alive = true;
  const questions = variantLessons(options.variant).flatMap((l) =>
    l.questions.map((q) => ({ lesson: l, question: q })),
  );
  let practiceIndex = Math.max(
    0,
    questions.findIndex((row) => row.lesson.id === options.initialTopic),
  );
  const shell = el("div", "", "learning-shell variant-education"),
    header = el("header"),
    main = el("main", "", "variant-education-content");
  main.tabIndex = 0;
  main.setAttribute(
    "aria-label",
    options.practice ? "Variant practice" : "Variant tutorial",
  );
  const back = button("‹", options.onBack);
  back.setAttribute("aria-label", "Back");
  header.append(back, el("h1", options.practice ? "Practice" : lesson.title));
  shell.append(header, main);
  container.replaceChildren(shell);
  function persist(next: VariantLearningProgress): void {
    progress = next;
    options.onProgress(next);
  }
  function tiles(q: VariantQuestion): HTMLElement {
    const row = el("div", "", "variant-example-tiles");
    if (!q.tiles) return row;
    const inventory = variantAdapter(options.variant).inventory();
    parseCounts(q.tiles).forEach((count, type) => {
      for (let c = 0; c < count; c++)
        row.append(
          options.renderTile(
            inventory.find((t) => t.type === type && t.id % 4 === c)!,
          ),
        );
    });
    return row;
  }
  function quiz(q: VariantQuestion, owner: VariantLesson): void {
    main.append(el("h2", q.prompt), tiles(q));
    const group = el("div", "", "variant-answers");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Answer choices");
    q.choices.forEach((choice, index) => {
      const b = button(choice, () => {
        chosen = index;
        checked = false;
        render();
      });
      b.setAttribute("aria-pressed", String(chosen === index));
      group.append(b);
    });
    main.append(group);
    const feedback = el("p", "", "card");
    feedback.setAttribute("role", "status");
    const check = button("Check answer", () => {
      if (chosen === undefined) return;
      correct = chosen === q.answer;
      checked = true;
      const assisted = progress.attempts.some((a) => a.questionId === q.id);
      persist({
        ...progress,
        attempts: [
          ...progress.attempts,
          {
            id: crypto.randomUUID(),
            questionId: q.id,
            profileId: owner.profileId,
            contentVersion: 1 as const,
            correct,
            assisted,
            at: Date.now(),
          },
        ].slice(-2000),
      });
      render();
    });
    check.disabled = chosen === undefined || (checked && correct);
    main.append(check);
    if (checked) {
      feedback.textContent = `${correct ? "Correct." : "Try again."} ${q.explanation}`;
      main.append(feedback);
    }
    if (checked && correct)
      main.append(
        button(options.practice ? "Next exercise" : "Continue", () => {
          chosen = undefined;
          checked = false;
          if (options.practice)
            practiceIndex = (practiceIndex + 1) % questions.length;
          else {
            step++;
            persist(lessonStep(progress, lesson, step));
          }
          render();
        }),
      );
  }
  function render(): void {
    if (!alive) return;
    main.replaceChildren();
    main.scrollTop = 0;
    main.append(
      el(
        "p",
        `${VARIANT_RELEASES.find((v) => v.id === options.variant)?.name ?? options.variant} · ${options.variant === "hong-kong" ? "Clear Chapter preset" : "Recorded rules profile"}`,
        "dim",
      ),
    );
    if (options.practice) {
      // Same two-step picker grammar as Riichi Practice
      // (.practice-selectors: a category select, then an exercise
      // select within it) — here the category is the lesson.
      const currentRow = questions[practiceIndex]!;
      const selectors = el("div", "", "practice-selectors");
      const lessonLabel = el("label", "Lesson");
      const lessonPicker = el("select");
      lessonPicker.setAttribute("aria-label", "Practice lesson");
      for (const l of variantLessons(options.variant)) {
        const option = el("option", l.title);
        option.value = l.id;
        lessonPicker.append(option);
      }
      lessonPicker.value = currentRow.lesson.id;
      lessonPicker.addEventListener("change", () => {
        const first = questions.findIndex(
          (row) => row.lesson.id === lessonPicker.value,
        );
        if (first >= 0) practiceIndex = first;
        chosen = undefined;
        checked = false;
        render();
      });
      lessonLabel.append(lessonPicker);
      const exerciseLabel = el("label", "Exercise");
      const exercisePicker = el("select");
      exercisePicker.setAttribute("aria-label", "Practice exercise");
      questions.forEach((row, i) => {
        if (row.lesson.id !== currentRow.lesson.id) return;
        const option = el("option", row.question.prompt);
        option.value = String(i);
        exercisePicker.append(option);
      });
      exercisePicker.value = String(practiceIndex);
      exercisePicker.addEventListener("change", () => {
        practiceIndex = Number(exercisePicker.value);
        chosen = undefined;
        checked = false;
        render();
      });
      exerciseLabel.append(exercisePicker);
      selectors.append(lessonLabel, exerciseLabel);
      main.append(
        selectors,
        el(
          "p",
          "These are authored, checked exercises. A coach preference from your game is not used as a right-or-wrong answer.",
          "dim",
        ),
      );
      quiz(currentRow.question, currentRow.lesson);
      return;
    }
    if (step === 0) {
      for (const paragraph of lesson.paragraphs)
        main.append(el("p", paragraph));
      if (lesson.id === "mcr-families") {
        const reference = el("section"),
          search = el("input");
        search.type = "search";
        search.placeholder = "Find a pattern";
        search.setAttribute("aria-label", "Search the 81 MCR patterns");
        const rows = el("div");
        const drawReference = () => {
          rows.replaceChildren();
          for (const p of mcrPatternGuide().filter((p) =>
            `${p.name} ${p.family} ${p.description}`
              .toLowerCase()
              .includes(search.value.toLowerCase()),
          )) {
            const d = el("details");
            d.append(
              el("summary", `${p.name} · ${p.units} fan`),
              el("p", p.family, "dim"),
              el("p", p.description),
              el("p", p.restrictions),
            );
            rows.append(d);
          }
        };
        search.addEventListener("input", drawReference);
        reference.append(el("h2", "All 81 scoring patterns"), search, rows);
        drawReference();
        main.append(reference);
      }
      main.append(
        button("Check understanding", () => {
          step = 1;
          persist(lessonStep(progress, lesson, step));
          render();
        }),
      );
      return;
    }
    if (step <= lesson.questions.length) {
      main.append(
        el("p", `Question ${step} of ${lesson.questions.length}`, "dim"),
      );
      quiz(lesson.questions[step - 1]!, lesson);
      return;
    }
    if (!progress.completed.some((c) => c.lessonId === lesson.id)) {
      persist({
        ...progress,
        completed: [
          ...progress.completed,
          {
            lessonId: lesson.id,
            version: 1,
            profileId: lesson.profileId,
            at: Date.now(),
          },
        ],
      });
      trackLessonCompleted(lesson.id);
    }
    main.append(
      el("h2", "Lesson complete"),
      el(
        "p",
        "Both checks have been answered correctly. Earlier incorrect or assisted attempts remain in your learning record.",
      ),
      button("Back to Learn", options.onBack),
      button("Start guided play", options.onPlay),
      button("Restart lesson", () => {
        step = 0;
        chosen = undefined;
        checked = false;
        persist(lessonStep(progress, lesson, 0));
        render();
      }),
    );
  }
  render();
  return {
    destroy() {
      alive = false;
      container.replaceChildren();
    },
  };
}

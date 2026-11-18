import {
  variantAdapter,
  type Tile,
  type VariantId,
} from "@openmahjong/engine";
import { expandNotation } from "./education/notation.js";
import {
  VARIANT_LESSONS,
  VARIANT_RELEASES,
  variantLessonQuestions,
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
import { tileIndexEl } from "./tile-index.js";
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
    /** Starts guided play for the track. Optional: a training-only
     *  track (American) has no game to start, and its completion
     *  screen omits the button when no handler is given. */
    onPlay?: () => void;
    /** The tile inventory pictured faces resolve against. Defaults
     *  to the variant adapter's inventory; a track with no engine
     *  adapter (American, training only) supplies its own. */
    inventory?: readonly Tile[];
    /** The track name shown over the lesson. Defaults to the
     *  variant release name; a track with no release entry supplies
     *  its own. */
    displayName?: string;
  },
): { destroy(): void } {
  const inventory: readonly Tile[] =
    options.inventory ?? variantAdapter(options.variant).inventory();
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
    picks = new Set<number>(),
    wrongChoices = new Set<number>(),
    checked = false,
    correct = false,
    alive = true;
  // Practice draws only from lessons the player has completed. A
  // review-driven entry (initialTopic) also includes its own lesson,
  // so a saved decision can always send the player to its questions.
  const completedIds = new Set(progress.completed.map((c) => c.lessonId));
  const practicePool = variantLessons(options.variant)
    .filter(
      (l) => completedIds.has(l.id) || l.id === options.initialTopic,
    )
    .flatMap((l) =>
      variantLessonQuestions(l).map((q) => ({ lesson: l, question: q })),
    );
  const questions = options.practice
    ? practicePool
    : variantLessons(options.variant).flatMap((l) =>
        variantLessonQuestions(l).map((q) => ({ lesson: l, question: q })),
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
  function resetAnswer(): void {
    chosen = undefined;
    picks = new Set();
    wrongChoices = new Set();
    checked = false;
    correct = false;
  }
  // Corner-index reveals on teaching rows (guided-play package),
  // keyed per lesson, step, row and position. Check rows are never
  // tappable into revealing an answer — the no-leak law: indices
  // there appear only once the answer is in and correct.
  const indexRevealed = new Set<string>();
  function tilesRow(
    notation?: string,
    mode: "plain" | "teach" | "answered" = "plain",
    rowKey = "",
  ): HTMLElement {
    const row = el("div", "", "variant-example-tiles");
    if (!notation) return row;
    // Rows render in the order the notation names the tiles — the
    // same order tile-pick keys index (see education/notation.ts).
    const faces = tileFaces(notation);
    faces.forEach((face, pos) => {
      const faceEl = options.renderTile(face);
      // Group segmentation: a visible gap where the face changes, so
      // a learner segments a row into its groups by eye instead of
      // counting tiles off one unbroken string.
      if (pos > 0 && face.type !== faces[pos - 1]!.type)
        faceEl.classList.add("variant-group-start");
      const key = `${lesson.id}:${step}:${rowKey}:${pos}`;
      if (mode === "answered" || (mode === "teach" && indexRevealed.has(key))) {
        const ix = tileIndexEl(face);
        if (ix) faceEl.append(ix);
      }
      if (mode === "teach") {
        faceEl.classList.add("stripinspect");
        faceEl.setAttribute("role", "button");
        faceEl.setAttribute("aria-label", `Inspect tile ${pos + 1}`);
        faceEl.addEventListener("click", () => {
          if (indexRevealed.has(key)) indexRevealed.delete(key);
          else indexRevealed.add(key);
          render();
        });
      }
      row.append(faceEl);
    });
    return row;
  }
  /** The expanded tile faces of a notation string, in the order the
   * notation names them — the order every row renders in and every
   * tile-pick key indexes. */
  function tileFaces(notation: string): Tile[] {
    return expandNotation(notation, inventory);
  }
  function advance(continueLabel: string, next: () => void): void {
    main.append(button(continueLabel, () => {
      resetAnswer();
      next();
      render();
    }));
  }
  function quiz(q: VariantQuestion, owner: VariantLesson): void {
    main.append(el("h2", q.prompt));
    if (q.kind === "tile-pick") {
      const row = el("div", "", "variant-example-tiles variant-tile-pick");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Tiles to pick from");
      const pickFaces = tileFaces(q.tiles);
      pickFaces.forEach((face, index) => {
        const b = el("button", "", "variant-tile-choice");
        b.type = "button";
        // Group segmentation, as in teaching rows: a gap where the
        // face changes, so the row reads as groups, not a string.
        if (index > 0 && face.type !== pickFaces[index - 1]!.type)
          b.classList.add("variant-group-start");
        b.setAttribute("aria-pressed", String(picks.has(index)));
        b.setAttribute("aria-label", `Tile ${index + 1}`);
        const faceEl = options.renderTile(face);
        // Answered and correct: the faces may now carry their
        // corner indices. Before that, never (the no-leak law).
        if (checked && correct) {
          const ix = tileIndexEl(face);
          if (ix) faceEl.append(ix);
        }
        b.append(faceEl);
        b.addEventListener("click", () => {
          if (checked && correct) return;
          if (picks.has(index)) picks.delete(index);
          else picks.add(index);
          checked = false;
          render();
        });
        row.append(b);
      });
      main.append(row);
    } else {
      main.append(tilesRow(q.tiles, checked && correct ? "answered" : "plain", "q"));
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
        b.disabled = wrongChoices.has(index);
        group.append(b);
      });
      main.append(group);
    }
    const feedback = el("p", "", "card");
    feedback.setAttribute("role", "status");
    const check = button("Check answer", () => {
      const isCorrect =
        q.kind === "tile-pick"
          ? picks.size === q.picks.length &&
            q.picks.every((p) => picks.has(p))
          : chosen === q.answer;
      correct = isCorrect;
      checked = true;
      if (!correct && q.kind === "choice" && chosen !== undefined)
        wrongChoices.add(chosen);
      const assisted = progress.attempts.some((a) => a.questionId === q.id);
      persist({
        ...progress,
        attempts: [
          ...progress.attempts,
          {
            id: crypto.randomUUID(),
            questionId: q.id,
            profileId: owner.profileId,
            contentVersion: 2 as const,
            correct,
            assisted,
            at: Date.now(),
          },
        ].slice(-2000),
      });
      render();
    });
    check.disabled =
      (q.kind === "tile-pick" ? picks.size === 0 : chosen === undefined) ||
      (checked && correct);
    main.append(check);
    if (checked) {
      if (correct) {
        feedback.textContent = `Correct. ${q.explanation}`;
      } else if (q.kind === "tile-pick") {
        // No membership counts while the question is open (the
        // no-leak law, Nov 18, 2026 hardening): exact belong/missing
        // counts are a membership oracle — submitting one tile and
        // reading "0 picks do not belong" certifies that tile, so
        // every multi-tile pick was solvable by elimination with no
        // understanding. A wrong set now earns the hint only.
        feedback.textContent =
          `Try again. ${q.hint} ` +
          "Tap a picked tile again to un-pick it.";
      } else {
        feedback.textContent = `Try again. ${q.hint}`;
      }
      main.append(feedback);
    }
    if (checked && correct)
      advance(options.practice ? "Next exercise" : "Continue", () => {
        if (options.practice)
          practiceIndex = (practiceIndex + 1) % questions.length;
        else {
          step++;
          persist(lessonStep(progress, lesson, step));
        }
      });
  }
  function mcrReference(): HTMLElement {
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
    return reference;
  }
  function render(): void {
    if (!alive) return;
    main.replaceChildren();
    main.scrollTop = 0;
    main.append(
      el(
        "p",
        options.displayName ??
          VARIANT_RELEASES.find((v) => v.id === options.variant)?.name ??
          options.variant,
        "dim",
      ),
    );
    if (options.practice) {
      if (questions.length === 0) {
        main.append(
          el(
            "p",
            "Finish a lesson first — its questions appear here for practice.",
          ),
          button("Back to Learn", options.onBack),
        );
        return;
      }
      // Same two-step picker grammar as Riichi Practice
      // (.practice-selectors: a category select, then an exercise
      // select within it) — here the category is the lesson.
      const currentRow = questions[practiceIndex]!;
      const selectors = el("div", "", "practice-selectors");
      const lessonLabel = el("label", "Lesson");
      const lessonPicker = el("select");
      lessonPicker.setAttribute("aria-label", "Practice lesson");
      for (const l of variantLessons(options.variant)) {
        if (!questions.some((row) => row.lesson.id === l.id)) continue;
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
        resetAnswer();
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
        resetAnswer();
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
    if (step < lesson.steps.length) {
      const current = lesson.steps[step]!;
      main.append(
        el("p", `Step ${step + 1} of ${lesson.steps.length}`, "dim"),
      );
      if (current.text) main.append(el("p", current.text));
      // A step carrying a question is a check: its pictured tiles
      // stay plain until the answer is in. Teaching steps are
      // tap-to-inspect.
      const rowMode = current.question ? "plain" : "teach";
      if (current.tiles) main.append(tilesRow(current.tiles, rowMode, "tiles"));
      if (current.hand) main.append(tilesRow(current.hand, rowMode, "hand"));
      if (current.question) {
        quiz(current.question, lesson);
      } else {
        advance("Continue", () => {
          step++;
          persist(lessonStep(progress, lesson, step));
        });
      }
      return;
    }
    if (!progress.completed.some((c) => c.lessonId === lesson.id)) {
      persist({
        ...progress,
        completed: [
          ...progress.completed,
          {
            lessonId: lesson.id,
            version: 2,
            profileId: lesson.profileId,
            at: Date.now(),
          },
        ],
      });
      trackLessonCompleted(lesson.id);
    }
    main.append(
      el("h2", "Lesson complete"),
      el("p", `You finished “${lesson.title}”.`),
    );
    if (lesson.id === "mcr-families") main.append(mcrReference());
    main.append(button("Back to Learn", options.onBack));
    // A training-only track has no guided play to start; the button
    // exists only when the caller wires one.
    if (options.onPlay) main.append(button("Start guided play", options.onPlay));
    main.append(
      button("Restart lesson", () => {
        step = 0;
        resetAnswer();
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

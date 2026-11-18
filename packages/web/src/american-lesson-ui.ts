/**
 * American training — the lesson runner wiring.
 *
 * The card-view surfaces (PR #81) left a registration seam in
 * education/american.ts: the Learn section renders the eleven lesson
 * rows from the registry alone, and a tap calls the mounter
 * registered there. This module is that mounter. It runs the
 * American lessons (education/american-lessons.ts, registered in
 * VARIANT_LESSONS like every other track) through the shared variant
 * step-runner, adapting the runner's progress to the American
 * store's shape ({completed, activeId?} under
 * openmahjong.american-learning.v1), which is all the Learn section
 * reads.
 *
 * Two seams are deliberate. The runner resolves pictured tiles
 * through the variant adapter's inventory; American has no adapter —
 * an adapter is a playable game's rules, and this track is training
 * only — so the mounter supplies AMERICAN_TILE_INVENTORY instead.
 * And the runner's completion screen offers "Start guided play"
 * only when a caller wires it; there is no American game to start,
 * so none is wired.
 */
import type { Tile, VariantId } from "@openmahjong/engine";
import {
  AMERICAN_PROGRESS_KEY,
  AMERICAN_TILE_INVENTORY,
  readAmericanProgress,
  registerAmericanLessonMounter,
  type AmericanLessonMounter,
} from "./education/american.js";
import { AMERICAN_LESSONS } from "./education/american-lessons.js";
import {
  emptyVariantProgress,
  type VariantLearningProgress,
} from "./education/variant-progress.js";
import { mountVariantEducation } from "./variant-education-ui.js";

/** The lessons' variant tag. The VariantId union names the three
 *  playable variants and deliberately does not gain a fourth —
 *  "american" exists only as lesson content (the same cast the
 *  lesson factory in american-lessons.ts carries). */
const AMERICAN_VARIANT = "american" as VariantId;

const byId = new Map(AMERICAN_LESSONS.map((l) => [l.id, l]));

/** The runner's working progress, seeded from the American store.
 *  The store keeps completions only, so attempts start empty and an
 *  unfinished lesson restarts at its first step — the store's shape
 *  has no step to resume from. */
function seedProgress(): VariantLearningProgress {
  const stored = readAmericanProgress();
  return {
    ...emptyVariantProgress(),
    completed: stored.completed
      .filter((id) => byId.has(id))
      .map((id) => ({
        lessonId: id,
        version: 2 as const,
        profileId: byId.get(id)!.profileId,
        at: Date.now(),
      })),
  };
}

/** Translate the runner's progress into the American store's shape
 *  and write it. Completions are written in curriculum order;
 *  activeId names the mounted lesson while it is unfinished and
 *  part-way in, and clears when it completes. */
function writeProgress(
  progress: VariantLearningProgress,
  currentLessonId: string,
): void {
  const completed = AMERICAN_LESSONS.filter((l) =>
    progress.completed.some((c) => c.lessonId === l.id),
  ).map((l) => l.id);
  const lesson = byId.get(currentLessonId);
  const active = progress.active[currentLessonId];
  const activeId =
    lesson &&
    active &&
    !completed.includes(currentLessonId) &&
    active.step < lesson.steps.length
      ? currentLessonId
      : undefined;
  try {
    localStorage.setItem(
      AMERICAN_PROGRESS_KEY,
      JSON.stringify({
        completed,
        ...(activeId ? { activeId } : {}),
      }),
    );
  } catch {
    /* Device-local progress; a lost write loses nothing else. */
  }
}

export function createAmericanLessonMounter(
  renderTile: (tile: Tile) => HTMLElement,
): AmericanLessonMounter {
  return (container, options) => {
    let progress = seedProgress();
    // Mark the opened lesson in progress at once, so the Learn
    // section's row state is right even if the learner backs out
    // before the first step lands.
    const lesson = byId.get(options.lessonId);
    if (lesson && !progress.completed.some((c) => c.lessonId === lesson.id)) {
      progress = {
        ...progress,
        active: {
          ...progress.active,
          [lesson.id]: {
            step: 0,
            version: 2,
            profileId: lesson.profileId,
            at: Date.now(),
          },
        },
      };
      writeProgress(progress, lesson.id);
    }
    return mountVariantEducation(container, {
      variant: AMERICAN_VARIANT,
      lessonId: options.lessonId,
      progress,
      onProgress: (next) => {
        progress = next;
        writeProgress(next, options.lessonId);
      },
      renderTile,
      onBack: options.onBack,
      inventory: AMERICAN_TILE_INVENTORY,
      displayName: "American",
      // No onPlay: there is no American game to start.
    });
  };
}

/** Register the American lesson mounter behind the Learn section's
 *  seam. Called by the App at construction, with the app's own tile
 *  renderer. */
export function registerAmericanLessons(
  renderTile: (tile: Tile) => HTMLElement,
): void {
  registerAmericanLessonMounter(createAmericanLessonMounter(renderTile));
}

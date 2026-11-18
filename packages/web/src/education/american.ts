/**
 * American training — the Learn section's registration seam.
 *
 * American is a training-only track (brief-american-training-v1):
 * lessons and the Practice Card, no game. This module is the seam
 * between the card-view surfaces (the Learn section, the card
 * screens) and the lesson content: it owns the track's identity —
 * the eleven lesson titles from the brief, in order — the progress
 * store's shape, and the mounter registry the lesson runner
 * registers into. The Learn section renders from AMERICAN_LESSONS
 * alone, so the list entry point exists before any lesson content
 * lands; tapping a row calls the registered mounter, if one is
 * registered, with the lesson id.
 */
import { buildTileSet, type Tile } from "@openmahjong/engine";

export const AMERICAN_SECTION_ID = "american";
export const AMERICAN_SECTION_NAME = "American";

/** The one factual line under the section head (approved rendering
 * 01): what the track is, stated plainly. */
export const AMERICAN_TRAINING_LINE =
  "Training only: lessons and a practice card. There is no American game to play.";

export interface AmericanLessonRef {
  readonly id: string;
  readonly title: string;
}

/** The eleven lessons of the brief's curriculum, in order. Ids are
 * the track's stable lesson ids; content registers against them. */
export const AMERICAN_LESSONS: readonly AmericanLessonRef[] = [
  { id: "am-set", title: "Meet the American set" },
  { id: "am-card", title: "The card" },
  { id: "am-practice-card", title: "Our Practice Card" },
  { id: "am-setup", title: "Setup" },
  { id: "am-charleston", title: "The Charleston" },
  { id: "am-picking", title: "Picking a hand" },
  { id: "am-playing", title: "Playing the hand" },
  { id: "am-jokers", title: "Jokers" },
  { id: "am-defense", title: "Defense" },
  { id: "am-scoring", title: "Winning and scoring" },
  { id: "am-drills", title: "Table drills" },
];

// ---------------------------------------------------------------------------
// Tile inventory — the faces the lessons picture. American is a
// training-only track: there is no engine adapter for it (an adapter
// is a playable game's rules), so the lesson runner cannot resolve
// pictured tiles through variantAdapter(). The lessons picture only
// the standard 34 faces, so the inventory is the standard tile set
// with the riichi red-five marking removed — American faces are
// plain. The lesson mounter passes this to the runner, and the
// notation audit (test/lesson-notation.test.ts) resolves American
// notations against this same inventory, exactly as the runner does.
// ---------------------------------------------------------------------------

export const AMERICAN_TILE_INVENTORY: readonly Tile[] = buildTileSet().map(
  (t) => ({ ...t, red: false }),
);

// ---------------------------------------------------------------------------
// Progress — device-local, like the variant tracks' store. The
// lesson runner writes this shape; the Learn section only reads it.
// ---------------------------------------------------------------------------

export const AMERICAN_PROGRESS_KEY = "openmahjong.american-learning.v1";

export interface AmericanProgress {
  readonly completed: readonly string[];
  readonly activeId?: string;
}

export const EMPTY_AMERICAN_PROGRESS: AmericanProgress = { completed: [] };

export function parseAmericanProgress(raw: unknown): AmericanProgress {
  if (!raw || typeof raw !== "object") return EMPTY_AMERICAN_PROGRESS;
  const value = raw as { completed?: unknown; activeId?: unknown };
  return {
    completed: Array.isArray(value.completed)
      ? value.completed.filter((x): x is string => typeof x === "string")
      : [],
    ...(typeof value.activeId === "string"
      ? { activeId: value.activeId }
      : {}),
  };
}

export function readAmericanProgress(
  storage: Pick<Storage, "getItem"> = localStorage,
): AmericanProgress {
  try {
    return parseAmericanProgress(
      JSON.parse(storage.getItem(AMERICAN_PROGRESS_KEY) ?? "null"),
    );
  } catch {
    return EMPTY_AMERICAN_PROGRESS;
  }
}

// ---------------------------------------------------------------------------
// Lesson mounter registry — the lesson runner registers its mount
// function here; app.ts mounts it into the "american-lesson" screen
// when a lesson row is tapped. Until content registers, rows render
// (the list is the entry point) and taps have nowhere to go.
// ---------------------------------------------------------------------------

export interface AmericanLessonMountOptions {
  readonly lessonId: string;
  readonly onBack: () => void;
}

export type AmericanLessonMounter = (
  container: HTMLElement,
  options: AmericanLessonMountOptions,
) => { destroy(): void };

let mounter: AmericanLessonMounter | null = null;

export function registerAmericanLessonMounter(
  fn: AmericanLessonMounter | null,
): void {
  mounter = fn;
}

export function americanLessonMounter(): AmericanLessonMounter | null {
  return mounter;
}

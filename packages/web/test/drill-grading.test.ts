// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { tileTypeName, variantAdapter } from "@openmahjong/engine";
import {
  VARIANT_LESSONS,
  variantLessonQuestions,
  type VariantLesson,
  type VariantTilePickQuestion,
} from "../src/education/variant-content.js";
import { expandNotation } from "../src/education/notation.js";
import { AMERICAN_TILE_INVENTORY } from "../src/education/american.js";
import { mountVariantEducation } from "../src/variant-education-ui.js";
import {
  emptyVariantProgress,
  type VariantLearningProgress,
} from "../src/education/variant-progress.js";

/**
 * Regression coverage for the Nov 18, 2026 face-drill defect (re-panel
 * summary §6 #1): shuffled drill rows rendered in canonical type order
 * while their answer keys indexed the authored notation order, so the
 * visibly correct tile was graded wrong and the "Correct" feedback
 * taught a false face. The guards below pin the invariant from three
 * sides: the expansion every row renders through preserves the
 * authored order; every tile-pick key points at the face its prompt
 * actually names, in the rendered row; and the position a drill's
 * explanation names agrees with the face rendered at that position.
 */

/** Independent authored-order tokenizer. Deliberately does NOT use the
 * production parser, so a production regression cannot hide itself. */
function authoredTypes(notation: string): number[] {
  const out: number[] = [];
  let digits: number[] = [];
  for (const ch of notation.trim()) {
    if (ch >= "0" && ch <= "9") {
      digits.push(ch.charCodeAt(0) - 48);
      continue;
    }
    const base = ch === "m" ? 0 : ch === "p" ? 9 : ch === "s" ? 18 : 27;
    for (const d of digits)
      out.push(ch === "z" ? base + d - 1 : base + (d === 0 ? 5 : d) - 1);
    digits = [];
  }
  return out;
}

const WIND_TYPES: Record<string, number> = {
  East: 27,
  South: 28,
  West: 29,
  North: 30,
};
const SUIT_BASE: Record<string, number> = {
  characters: 0,
  circles: 9,
  bamboo: 18,
};
function faceTypeFromName(name: string): number | undefined {
  const suited = /^(\d) of (characters|circles|bamboo)$/.exec(name);
  if (suited) return SUIT_BASE[suited[2]!]! + Number(suited[1]) - 1;
  const wind = /^(East|South|West|North)( wind)?$/.exec(name);
  if (wind) return WIND_TYPES[wind[1]!];
  return undefined;
}

/** The inventory the runner resolves this lesson's faces against:
 *  the variant adapter's for the playable tracks; American is
 *  training-only, has no adapter, and its mounter supplies
 *  AMERICAN_TILE_INVENTORY instead. */
function lessonInventory(lesson: VariantLesson) {
  return (lesson.variant as string) === "american"
    ? AMERICAN_TILE_INVENTORY
    : variantAdapter(lesson.variant).inventory();
}

/** The face types a tile-pick's key selects, in the rendered row. */
function keyedTypes(
  lesson: VariantLesson,
  q: VariantTilePickQuestion,
): number[] {
  const faces = expandNotation(q.tiles, lessonInventory(lesson));
  return q.picks.map((p) => faces[p]!.type);
}

/** Waits drills: the completing faces, taken from each question's own
 * explanation (which names them in words). Keyed by question id so a
 * new waits drill fails here until it is audited and added. */
const WAITS_KEYS: Record<string, number[]> = {
  "hk-waits-pick": [1, 4], // 2m, 5m
  "hk-transfer-waits": [3, 6], // 4m, 7m
  "tw-wait-pick": [11, 14], // 3p, 6p
  "mcr-wait-pick": [19, 22], // 2s, 5s
  "mcr-edge-wait-pick": [20], // 3s
};

/** American drills (brief-american-training-v1): the track names its
 *  suits Craks, Dots and Bams, and two of its drills are judgment
 *  picks whose key is the plan the lesson states, taken from each
 *  question's own explanation. Keyed by question id, like the waits
 *  drills, so a new one fails here until it is audited and added. */
const AM_SUIT_BASE: Record<string, number> = {
  Craks: 0,
  Dots: 9,
  Bams: 18,
};
const AM_DRAGON_TYPES: Record<string, number> = {
  white: 31,
  green: 32,
  red: 33,
};
const AM_WORD_NUMBERS: Record<string, number> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
  sevens: 7,
  eights: 8,
  nines: 9,
};
const JUDGMENT_KEYS: Record<string, number[]> = {
  "am-pass-evens": [1, 12, 23], // 2m, 4p, 6s — the even singletons
  "am-charleston-drill": [4, 6, 8], // 5m, 7m, 9m — the odd Craks singletons
};

function expectedKeyedTypes(
  lesson: VariantLesson,
  q: VariantTilePickQuestion,
): number[] {
  const row = expandNotation(q.tiles, lessonInventory(lesson)).map(
    (f) => f.type,
  );
  const positionsOf = (pred: (t: number) => boolean) =>
    row.filter(pred).sort((a, b) => a - b);
  let m: RegExpExecArray | null;
  if ((m = /Tap the (East|South|West|North) wind/.exec(q.prompt)))
    return [WIND_TYPES[m[1]!]!];
  if (q.prompt.includes("Tap the seat wind the dealer holds")) return [27];
  if ((m = /Tap the (\d) of (characters|circles|bamboo)/.exec(q.prompt)))
    return [SUIT_BASE[m[2]!]! + Number(m[1]) - 1];
  if (q.prompt.includes("Tap every wind tile"))
    return positionsOf((t) => t >= 27 && t <= 30);
  if (q.prompt.includes("Tap every dragon tile"))
    return positionsOf((t) => t >= 31 && t <= 33);
  if (q.prompt.includes("Tap every honor tile"))
    return positionsOf((t) => t >= 27);
  if (q.prompt.includes("form a triplet")) {
    const counts = new Map<number, number>();
    for (const t of row) counts.set(t, (counts.get(t) ?? 0) + 1);
    const triple = [...counts].find(([, c]) => c === 3);
    if (triple) return [triple[0], triple[0], triple[0]];
  }
  if (q.prompt.includes("form a quad")) {
    const counts = new Map<number, number>();
    for (const t of row) counts.set(t, (counts.get(t) ?? 0) + 1);
    const quad = [...counts].find(([, c]) => c === 4);
    if (quad) return [quad[0], quad[0], quad[0], quad[0]];
  }
  // American track: its own suit names and drill phrasings.
  if ((m = /Tap the pair of (East|South|West|North) winds/.exec(q.prompt)))
    return positionsOf((t) => t === WIND_TYPES[m[1]!]!);
  if ((m = /Tap the (white|green|red) dragon/.exec(q.prompt)))
    return [AM_DRAGON_TYPES[m[1]!]!];
  if ((m = /Tap the (\d) of (Craks|Dots|Bams)/.exec(q.prompt)))
    return [AM_SUIT_BASE[m[2]!]! + Number(m[1]) - 1];
  if ((m = /Tap every (\d) of (Craks|Dots|Bams)/.exec(q.prompt)))
    return positionsOf((t) => t === AM_SUIT_BASE[m[2]!]! + Number(m[1]) - 1);
  if (
    (m = /Tap every tile of the kong of (\w+) of (Craks|Dots|Bams)/.exec(
      q.prompt,
    ))
  )
    return positionsOf(
      (t) => t === AM_SUIT_BASE[m[2]!]! + AM_WORD_NUMBERS[m[1]!]! - 1,
    );
  if ((m = /A (\d) of (Craks|Dots|Bams) has been discarded/.exec(q.prompt)))
    return positionsOf((t) => t === AM_SUIT_BASE[m[2]!]! + Number(m[1]) - 1);
  if (q.prompt.includes("even number in a suit"))
    return positionsOf((t) => t < 27 && (t % 9) % 2 === 1);
  if (/tap every wind/i.test(q.prompt))
    return positionsOf((t) => t >= 27 && t <= 30);
  const waits = WAITS_KEYS[q.id];
  if (waits) return [...waits].sort((a, b) => a - b);
  const judgment = JUDGMENT_KEYS[q.id];
  if (judgment) return [...judgment].sort((a, b) => a - b);
  throw new Error(
    `Unaudited tile-pick ${q.id} in ${lesson.id}: classify its key in drill-grading.test.ts`,
  );
}

describe("drill rows render in authored notation order", () => {
  it("expands every lesson row exactly as its notation names it", () => {
    for (const lesson of VARIANT_LESSONS) {
      const inventory = lessonInventory(lesson);
      const notations = lesson.steps.flatMap((s) =>
        [s.tiles, s.hand, s.question?.tiles].filter(
          (n): n is string => typeof n === "string",
        ),
      );
      for (const notation of notations) {
        expect(
          expandNotation(notation, inventory).map((f) => f.type),
          `${lesson.id}: ${notation}`,
        ).toEqual(authoredTypes(notation));
      }
    }
  });
});

describe("every tile-pick key names the face its prompt asks for", () => {
  it("grades the visibly correct face in every variant lesson", () => {
    let audited = 0;
    for (const lesson of VARIANT_LESSONS) {
      for (const q of variantLessonQuestions(lesson)) {
        if (q.kind !== "tile-pick") continue;
        audited++;
        expect(
          [...keyedTypes(lesson, q)].sort((a, b) => a - b),
          `${lesson.id} :: ${q.id} (${q.prompt})`,
        ).toEqual(expectedKeyedTypes(lesson, q));
      }
    }
    // The audit must actually cover the drill set, not silently skip it.
    expect(audited).toBeGreaterThanOrEqual(20);
  });

  it("explanations name the face actually rendered at the named position", () => {
    const POSITION: Record<string, (len: number) => number> = {
      first: () => 0,
      second: () => 1,
      third: () => 2,
      fourth: () => 3,
      fifth: () => 4,
      last: (len) => len - 1,
      middle: (len) => Math.floor(len / 2),
    };
    let checked = 0;
    for (const lesson of VARIANT_LESSONS) {
      for (const q of variantLessonQuestions(lesson)) {
        if (q.kind !== "tile-pick" || q.picks.length !== 1) continue;
        const m =
          /The (first|second|third|fourth|fifth|last|middle) tile(?: in the row)? is (?:the )?(.+?)(?:\.| —|,)/.exec(
            q.explanation,
          );
        if (!m) continue;
        const face = faceTypeFromName(m[2]!.trim());
        if (face === undefined) continue;
        const row = expandNotation(q.tiles, lessonInventory(lesson)).map(
          (f) => f.type,
        );
        const pos = POSITION[m[1]!]!(row.length);
        checked++;
        expect(row[pos], `${q.id}: explanation position`).toBe(face);
        expect(q.picks, `${q.id}: key position`).toEqual([pos]);
      }
    }
    // All twelve single-face drills of the playable tracks carry a
    // positional explanation, and registering the American track
    // added a thirteenth (am-north-wind) that this guard now covers.
    expect(checked).toBe(13);
  });
});

describe("drill grading in the mounted lesson UI", () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement("div");
    document.body.append(root);
  });

  function mountAt(
    variant: "hong-kong" | "taiwanese",
    lesson: VariantLesson,
    questionId: string,
  ): void {
    const stepIndex = lesson.steps.findIndex(
      (s) => s.question?.id === questionId,
    );
    if (stepIndex < 0) throw new Error(`No step carries ${questionId}`);
    const progress: VariantLearningProgress = {
      ...emptyVariantProgress(),
      active: {
        [lesson.id]: {
          step: stepIndex,
          version: 2,
          profileId: lesson.profileId,
          at: 0,
        },
      },
    };
    mountVariantEducation(root, {
      variant,
      lessonId: lesson.id,
      progress,
      onProgress: () => {},
      renderTile: (tile) => {
        const span = document.createElement("span");
        span.textContent = tileTypeName(tile.type);
        return span;
      },
      onBack: () => {},
      onPlay: () => {},
    });
  }

  function renderedRow(): string[] {
    return [...root.querySelectorAll<HTMLButtonElement>(".variant-tile-choice")].map(
      (b) => b.textContent,
    );
  }
  function tapFace(name: string): void {
    const b = [...root.querySelectorAll<HTMLButtonElement>(".variant-tile-choice")].find(
      (b) => b.textContent === name,
    );
    if (!b) throw new Error(`No rendered tile ${name}`);
    b.click();
  }
  function check(): string {
    const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Check answer",
    );
    if (!b) throw new Error("No Check answer button");
    b.click();
    return root.querySelector('[role="status"]')?.textContent ?? "";
  }

  it("hk-char-row-9: the rendered row is the authored shuffled row and its visible 9 grades correct", () => {
    const lesson = VARIANT_LESSONS.find((l) => l.id === "hk-tiles")!;
    mountAt("hong-kong", lesson, "hk-char-row-9");
    expect(renderedRow()).toEqual(["7m", "2m", "9m", "4m"]);
    tapFace("7m");
    expect(check()).toMatch(/^Try again\./);
    // Un-pick the wrong tile, then tap the visibly correct face.
    tapFace("7m");
    tapFace("9m");
    expect(check()).toMatch(/^Correct\. The third tile is the 9 of characters\./);
  });

  it("tw wind drills: steps 10 and 11 render different rows and each visible wind grades correct", () => {
    const lesson = VARIANT_LESSONS.find((l) => l.id === "tw-tiles")!;
    mountAt("taiwanese", lesson, "tw-wind-pick-east");
    expect(renderedRow()).toEqual(["W", "N", "S", "E"]);
    tapFace("E");
    expect(check()).toMatch(/^Correct\./);

    document.body.replaceChildren();
    root = document.createElement("div");
    document.body.append(root);
    mountAt("taiwanese", lesson, "tw-wind-pick-south");
    expect(renderedRow()).toEqual(["N", "W", "E", "S"]);
    tapFace("S");
    expect(check()).toMatch(/^Correct\./);
  });

  it("tw-dealer-wind-pick: the visible East — not the visible North — is the dealer's wind", () => {
    const lesson = VARIANT_LESSONS.find((l) => l.id === "tw-profile")!;
    mountAt("taiwanese", lesson, "tw-dealer-wind-pick");
    expect(renderedRow()).toEqual(["W", "S", "N", "E"]);
    tapFace("N");
    expect(check()).toMatch(/^Try again\./);
    tapFace("N");
    tapFace("E");
    expect(check()).toMatch(/^Correct\. The last tile in the row is East/);
  });
});

/**
 * The tutorial (slice-2 brief §9): eleven short lessons that teach
 * riichi on the real table against the real engine. Panel lessons
 * (drills, choices, worked examples) and seeded table scenarios share
 * one controller; the scenarios run through LessonScene, a
 * deterministic replay driver over the engine — the same trick
 * GameRunner plays for real games — so a lesson position is a real
 * position, never a mock.
 *
 * Copy law (brief §9): lesson text is informational, one line per
 * idea, no slogans. Progress persists locally for guests and rides
 * the account settings blob (namespaced key) when signed in.
 *
 * Content version 4 (lesson rebuild brief v2, PR E, 2026-11-17):
 * the riichi repairs from the beginner panel — completed tile
 * reading in TU-1, the table tour in TU-3, signalled scene changes,
 * stated riichi stakes, TU-8's worked score breakdown, and TU-9's
 * single furiten statement. The lessons are written for a player
 * who has never seen a mahjong tile. Every thing is shown, named
 * in plain words, and read aloud before any step asks for it, and
 * no term is used before the step that teaches it — the term
 * order is audited by test/tutorial-terms.test.ts.
 *
 * Lesson fix round (2026-11-17): wrong-answer feedback is hint-only
 * in every lesson — it points at what to look at and never states
 * the correct answer while the question is open, at any attempt
 * count (guarded by test/tutorial-leaks.test.ts). TU-1 gains
 * shuffled face-mastery drills for all nine characters and all
 * four winds; TU-7 teaches that yaku stack; TU-8 gains a second
 * worked hand (fu itemised part by part) and transfer checks on
 * pictured hands never used in teaching, their answers verified
 * against the engine scorer by test/tutorial-transfer.test.ts.
 * New steps are appended at the ends of their lessons, so existing
 * step indices — and saved mid-lesson progress — are unchanged.
 */

import {
  Game,
  type CallAction,
  type CallContext,
  type GameEvent,
  type GameLength,
  type GameResult,
  type PlayerView,
  type Policy,
  type TileType,
  type TurnAction,
  type TurnContext,
} from "@openmahjong/engine";
import { createAiPolicy, waitsFast } from "@openmahjong/ai";
import { tileName } from "@openmahjong/coach";
import type { ChiHint } from "./model.js";

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

import { MODULES, moduleDef, type ModuleDef, type ModuleId } from "./education/curriculum.js";
export { MODULES, moduleDef, type ModuleDef, type ModuleId } from "./education/curriculum.js";

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

import {
  mergeProgress, parseSavedLesson, parseSceneDecision, parseTutorialProgress,
  MAX_LESSON_DECISIONS,
  type SavedLessonState, type SceneDecision, type TutorialProgress,
} from "./education/lesson-progress.js";
export { mergeProgress, type SavedLessonState, type TutorialProgress } from "./education/lesson-progress.js";

export const TUTORIAL_SETTINGS_KEY = "openmahjong.tutorial.v1";
const TUTORIAL_LOCAL_KEY = TUTORIAL_SETTINGS_KEY;
export const EMPTY_PROGRESS: TutorialProgress = { done: [], active: null };

function lessonBounds(id: ModuleId) {
  const steps = stepsFor(id);
  return { stepCount: steps.length,
    seeds: steps.flatMap((step) => step.kind === "scene" ? [step.seed] : []) };
}

export function parseProgress(raw: unknown): TutorialProgress {
  return parseTutorialProgress(raw, lessonBounds);
}

export function loadTutorialProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(TUTORIAL_LOCAL_KEY);
    return raw ? parseProgress(JSON.parse(raw)) : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveTutorialProgress(progress: TutorialProgress): void {
  try {
    localStorage.setItem(TUTORIAL_LOCAL_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked: progress lives in memory for the session.
  }
}

// ---------------------------------------------------------------------------
// LessonScene — a seeded scenario on the real engine
// ---------------------------------------------------------------------------

export type SceneStop =
  | {
      readonly kind: "turn";
      readonly view: PlayerView;
      readonly ctx: TurnContext;
      readonly oracle: TurnAction;
    }
  | {
      readonly kind: "call";
      readonly view: PlayerView;
      readonly ctx: CallContext;
      readonly oracle: CallAction;
      readonly ponDecidable: boolean;
      readonly chiDecidable: boolean;
    }
  | { readonly kind: "gameEnd"; readonly result: GameResult };

export type { SceneDecision } from "./education/lesson-progress.js";

function assertTurnDecision(action: SceneDecision, view: PlayerView, ctx: TurnContext): asserts action is TurnAction {
  switch (action.type) {
    case "discard": {
      if (!view.hand.some((tile) => tile.id === action.tileId) ||
        (view.players[view.seat]?.riichi && action.tileId !== ctx.drawnTile?.id) ||
        (action.riichi && !ctx.riichiDiscardIds.includes(action.tileId))) break;
      return;
    }
    case "tsumo": if (ctx.canTsumo) return; break;
    case "kyuushu": if (ctx.canKyuushu) return; break;
    case "ankan": if (ctx.ankanOptions.includes(action.tileType)) return; break;
    case "shouminkan": if (ctx.shouminkanOptions.includes(action.tileType)) return; break;
  }
  throw new Error("Invalid lesson turn decision");
}

function assertCallDecision(action: SceneDecision, ctx: CallContext): asserts action is CallAction {
  switch (action.type) {
    case "pass": return;
    case "ron": if (ctx.canRon) return; break;
    case "pon": if (ctx.phase === "call" && ctx.canPon) return; break;
    case "daiminkan": if (ctx.phase === "call" && ctx.canKan) return; break;
    case "chi":
      if (ctx.phase === "call" && ctx.chiOptions.some((option) =>
        option[0] === action.tileIds[0] && option[1] === action.tileIds[1])) return;
      break;
  }
  throw new Error("Invalid lesson call decision");
}

class SceneSuspend {
  constructor(readonly stop: SceneStop) {}
}

/**
 * Drives one seeded hand/game exactly as the client's GameRunner
 * does: seat 0's decisions are recorded; every advance replays the
 * game from the seed, consuming recorded decisions, and suspends at
 * seat 0's next unrecorded decision with the full view + context.
 * The other seats are the real CPU policy (one shared instance, the
 * AiDriver shape), so the scenario trajectory is fixed by the seed.
 */
export class LessonScene {
  readonly seed: string;
  readonly length: GameLength;
  decisions: SceneDecision[] = [];
  events: readonly GameEvent[] = [];
  chiHints = new Map<number, ChiHint>();
  stop: SceneStop | null = null;

  constructor(seed: string, length: GameLength = "east") {
    this.seed = seed;
    this.length = length;
    this.replay();
  }

  static restore(
    seed: string,
    decisions: readonly SceneDecision[],
    length: GameLength = "east",
  ): LessonScene {
    if (decisions.length > MAX_LESSON_DECISIONS) throw new Error("Lesson decision log is too long");
    const parsed = decisions.map((decision) => parseSceneDecision(decision));
    if (parsed.some((decision) => decision === null)) throw new Error("Invalid lesson decision log");
    const scene = new LessonScene(seed, length);
    scene.decisions = parsed as SceneDecision[];
    scene.replay();
    return scene;
  }

  /** The oracle's action at the current stop (what the CPU policy
   *  would play from this exact position). */
  get oracleAction(): SceneDecision | null {
    return this.stop && this.stop.kind !== "gameEnd" ? this.stop.oracle : null;
  }

  /** Apply a decision at the current stop and replay to the next. */
  act(action: SceneDecision): void {
    if (!this.stop || this.stop.kind === "gameEnd") {
      throw new Error("LessonScene.act with no pending decision");
    }
    const parsed = parseSceneDecision(action);
    if (!parsed) throw new Error("Invalid lesson action");
    if (this.decisions.length >= MAX_LESSON_DECISIONS) throw new Error("Lesson decision log is too long");
    if (this.stop.kind === "turn") assertTurnDecision(parsed, this.stop.view, this.stop.ctx);
    else assertCallDecision(parsed, this.stop.ctx);
    const previous = { stop: this.stop, events: this.events, hints: this.chiHints };
    this.decisions.push(parsed);
    try { this.replay(); } catch (error) {
      this.decisions.pop();
      this.stop = previous.stop;
      this.events = previous.events;
      this.chiHints = previous.hints;
      throw error;
    }
  }

  /** Let the oracle play the current stop. */
  auto(): void {
    const action = this.oracleAction;
    if (!action) return;
    this.act(action);
  }

  private replay(): void {
    const oracle = createAiPolicy();
    const shared = createAiPolicy();
    let cursor = 0;
    const hints = new Map<number, ChiHint>();
    let lastChi: { tileIds: readonly [number, number] } | null = null;
    let game: Game;
    let scanned = 0;
    const scan = () => {
      for (; scanned < game.events.length; scanned++) {
        const ev = game.events[scanned]!;
        if (ev.type === "call" && ev["kind"] === "chi" && lastChi) {
          hints.set(ev.seq, { tileIds: lastChi.tileIds });
          lastChi = null;
        }
      }
    };
    const asks = new Map<string, number>();
    const seat0: Policy = {
      turn: (view, ctx) => {
        scan();
        asks.clear();
        const recorded = this.decisions[cursor];
        if (recorded) {
          cursor++;
          assertTurnDecision(recorded, view, ctx);
          return recorded;
        }
        throw new SceneSuspend({ kind: "turn", view, ctx, oracle: oracle.turn(view, ctx) });
      },
      call: (view, ctx) => {
        scan();
        const key = `${ctx.tile.id}:${ctx.fromSeat}:${ctx.phase}`;
        const askCount = asks.get(key) ?? 0;
        asks.set(key, askCount + 1);
        const recorded = this.decisions[cursor];
        if (recorded) {
          cursor++;
          assertCallDecision(recorded, ctx);
          if (recorded.type === "chi") lastChi = { tileIds: recorded.tileIds };
          return recorded;
        }
        throw new SceneSuspend({
          kind: "call",
          view,
          ctx,
          oracle: oracle.call(view, ctx),
          ponDecidable: ctx.phase === "call" && (ctx.callStage ? ctx.callStage === "pon-kan" : askCount === 0),
          chiDecidable:
            ctx.phase === "call" &&
            ctx.chiOptions.length > 0 &&
            (ctx.callStage ? ctx.callStage === "chi" : (askCount > 0 || (!ctx.canPon && !ctx.canKan))),
        });
      },
    };
    const others: Policy = {
      turn: (view, ctx) => {
        scan();
        return shared.turn(view, ctx);
      },
      call: (view, ctx) => {
        scan();
        const action = shared.call(view, ctx);
        if (action.type === "chi") lastChi = { tileIds: action.tileIds };
        return action;
      },
    };
    game = new Game({
      seed: this.seed,
      length: this.length,
      policies: [seat0, others, others, others],
    });
    this.stop = null;
    try {
      const result = game.run();
      this.stop = { kind: "gameEnd", result };
    } catch (e) {
      if (e instanceof SceneSuspend) this.stop = e.stop;
      else throw e;
    } finally {
      scan();
      this.events = [...game.events];
      this.chiHints = hints;
    }
    if (cursor !== this.decisions.length) throw new Error("Lesson decision log has unused actions");
  }
}

// ---------------------------------------------------------------------------
// Shared helpers for the module state machines
// ---------------------------------------------------------------------------

/** Waits of a 13-tile closed position, as plain tile names. */
export function waitNames(view: PlayerView): string[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of view.hand) counts[t.type]!++;
  const visible = new Array<number>(34).fill(0);
  for (const p of view.players) {
    for (const d of p.discards) if (!d.called) visible[d.tile.type]!++;
    for (const m of p.melds) for (const t of m.tiles) visible[t.type]!++;
  }
  for (const ind of view.doraIndicators) visible[ind.type]!++;
  const ownedMeldCounts = new Array<number>(34).fill(0);
  for (const meld of view.melds) for (const tile of meld.tiles) ownedMeldCounts[tile.type]!++;
  return waitsFast(counts, visible, view.melds.length, ownedMeldCounts).map((w) => tileName(w.type as TileType));
}

export function joinTileNames(names: readonly string[]): string {
  const parts = names.map((n) => `the ${n}`);
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Did seat 0 win a hand anywhere in these events? */
export function seat0Won(events: readonly GameEvent[]): boolean {
  return events.some((ev) => ev.type === "win" && Number(ev["seat"]) === 0);
}

/** The most recent win event in the log, if any. */
export function lastWinEvent(
  events: readonly GameEvent[],
): GameEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.type === "win") return events[i]!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lesson controller — the module state machines
// ---------------------------------------------------------------------------

export type LessonAction =
  | { readonly kind: "continue" }
  | { readonly kind: "back" }
  | { readonly kind: "drill"; readonly index: number }
  | { readonly kind: "choice"; readonly index: number }
  | { readonly kind: "tile"; readonly tileId: number }
  | { readonly kind: "button"; readonly id: string };

export interface LessonButton {
  readonly label: string;
  readonly cls: string;
  readonly id: string;
  /** Tile faces shown beside the label, in display order — a chi
   *  option's resulting set (issue #35: prose labels like "Chi — 2 of
   *  characters + 3 of characters" burst out of the pill at phone
   *  width). `side` marks the called tile, which sits sideways in the
   *  meld. Faces carry tile ids so a red five renders as itself. */
  readonly faces?: readonly { readonly id: number; readonly side?: boolean }[];
}

export interface LessonChoice {
  readonly label: string;
  readonly tiles?: readonly number[];
}

export interface LessonView {
  readonly lab: string;
  readonly text: string;
  readonly note: string | null;
  readonly strip: readonly number[] | null;
  readonly drill: { readonly tiles: readonly number[]; readonly found: readonly number[] } | null;
  readonly choices: readonly LessonChoice[] | null;
  readonly buttons: readonly LessonButton[];
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly canBack: boolean;
  readonly usesTable: boolean;
  readonly highlightRiichi: boolean;
  readonly acceptsTiles: boolean;
  readonly done: boolean;
}

type StepDef =
  | {
      readonly kind: "info";
      readonly text: string | ((c: LessonController) => string);
      readonly strip?: readonly number[];
    }
  | {
      readonly kind: "drill";
      readonly text: string;
      readonly tiles: readonly number[];
      readonly targets: readonly number[];
      readonly wrongNote: string;
    }
  | {
      readonly kind: "choice";
      readonly text: string | ((c: LessonController) => string);
      readonly strip?: readonly number[];
      readonly options:
        | readonly LessonChoice[]
        | ((c: LessonController) => readonly LessonChoice[]);
      readonly correct: number | ((c: LessonController) => number);
      readonly wrongNote: string | ((c: LessonController, i: number) => string);
      /** When set, a correct pick is confirmed visibly — this note
       * is shown and the step waits for Continue — instead of the
       * lesson silently moving on (TU-10, PR E item 8). */
      readonly correctNote?: string;
    }
  | {
      readonly kind: "scene";
      readonly seed: string;
      readonly text: string | ((c: LessonController) => string);
      readonly enter?: (c: LessonController) => void;
      readonly gate: (c: LessonController, a: LessonAction) => boolean;
      readonly buttons?: (c: LessonController) => readonly LessonButton[];
      readonly acceptsTiles?: boolean;
      readonly highlightRiichi?: boolean;
    };

const CONTINUE: LessonButton = { label: "Continue", cls: "primary", id: "continue" };
const BACK: LessonButton = { label: "Back", cls: "ghost tut-back", id: "back" };
const WIND_WORD: Record<number, string> = { 27: "East", 28: "South", 29: "West", 30: "North" };

/** Keep the correct answer at index 1 without duplicate labels at lower bounds. */
export function distinctQuizValues(answer: number, gap: number, minimum: number): readonly number[] {
  return [answer - gap >= minimum ? answer - gap : answer + 2 * gap, answer, answer + gap];
}

function stepsFor(id: ModuleId): readonly StepDef[] {
  switch (id) {
    case "tu1":
      return [
        { kind: "info", text: "Mahjong is played with tiles. A tile's face tells you what it is: this face shows five circles, so this tile is the 5 of dots.", strip: [13] },
        { kind: "info", text: "Tiles come in three suits — three groups of tiles that share one kind of face. The first suit is dots, numbered 1 to 9. Read a dots tile by counting its circles: the number of circles is the tile's number.", strip: [9, 10, 11, 12, 13, 14, 15, 16, 17] },
        { kind: "drill", text: "Tap every dots tile — the tiles whose faces are made of circles.", tiles: [2, 19, 9, 27, 13, 5, 17, 22, 11, 15, 31, 8], targets: [2, 4, 6, 8, 9], wrongNote: "Not that one — a dots tile's face is circles. Count the circles to read its number." },
        { kind: "info", text: "The second suit is bamboo, numbered 1 to 9. Read a bamboo tile by counting its green sticks: the number of sticks is the tile's number. One exception: the 1 of bamboo, first in this row, is a picture of a bird — it has no sticks to count.", strip: [18, 19, 20, 21, 22, 23, 24, 25, 26] },
        { kind: "drill", text: "Tap every bamboo tile — the tiles with the green sticks.", tiles: [2, 15, 19, 8, 22, 27, 21, 9, 25, 20, 31, 5], targets: [2, 4, 6, 8, 9], wrongNote: "Not that one — bamboo tiles are the green sticks." },
        { kind: "info", text: "The third suit is characters, numbered 1 to 9. A characters tile has a two-part face: the dark character on top is the number, and the red character below is the suit's mark — it means ten thousand, and it is the same on every characters tile. The top characters are numbers written in Chinese: one line is 1, two lines are 2, three lines are 3. This row runs 1 to 9, left to right.", strip: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
        { kind: "info", text: "Here are all nine characters tiles again, labelled in order: 1, 2, 3, 4, 5, 6, 7, 8, 9, left to right. To read a characters tile, look only at the small dark character on top — that character is the number. The red mark below is the same on all nine, so it never tells you the number. For 1, 2, and 3 you can count the lines; for the rest, match the top character against this labelled row until the faces are familiar.", strip: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
        { kind: "info", text: "Two characters faces are easy to mix up: the 6 and the 9. Here they are side by side — the 6 on the left, the 9 on the right. Compare only the top characters: the 6's top character ends in two separate short legs at the bottom, while the 9's top character is one long stroke that bends down and ends in a hook, with nothing separate below it. No drill in this lesson uses a 6 or a 9 until you have seen them side by side like this.", strip: [5, 8] },
        { kind: "drill", text: "Tap every characters tile — the two-part faces with the red mark at the bottom.", tiles: [10, 4, 16, 30, 1, 24, 8, 27, 6, 20, 14, 3], targets: [1, 4, 6, 8, 11], wrongNote: "Not that one — a characters tile has two parts: a dark number character on top and the red mark below it." },
        { kind: "info", text: "Seven tiles belong to no suit. They are honors, and they have no numbers. Four of them are winds, named for the compass points: East, South, West, and North. Each wind's face is a single dark character. This row shows them in that order: East, South, West, North.", strip: [27, 28, 29, 30] },
        { kind: "drill", text: "Tap the East wind — the first of the four wind faces in the row you were just shown, in the order East, South, West, North.", tiles: [29, 27, 31, 28, 13, 30], targets: [1], wrongNote: "Not that one — the winds in order are East, South, West, North, and East is the first face in that row." },
        { kind: "drill", text: "Tap the North wind — the last of the four wind faces in that row.", tiles: [28, 33, 30, 27, 29], targets: [2], wrongNote: "Not that one — the winds in order are East, South, West, North, and North is the last face in that row." },
        { kind: "info", text: "The other three honors are dragons. The red dragon's face is a red character. The green dragon's face is a green character. The white dragon's face is blank, inside a frame.", strip: [31, 32, 33] },
        { kind: "drill", text: "Tap every honor tile — the winds and the dragons.", tiles: [27, 3, 28, 15, 29, 19, 33, 23, 8, 11, 7, 22], targets: [0, 2, 4, 6], wrongNote: "Not that one — honors are the winds and the dragons. They have no numbers." },
        { kind: "info", text: "The 1 and the 9 of each suit have a name: terminals. They are the tiles at the two ends of a suit. This row shows all six: the 1 and the 9 of characters, of dots, and of bamboo.", strip: [0, 8, 9, 17, 18, 26] },
        { kind: "info", text: "Every numbered tile from 2 to 8 is a simple. Simples are the middle tiles of a suit — every suited tile that is not a terminal.", strip: [10, 11, 12, 13, 14, 15, 16] },
        { kind: "drill", text: "Tap every terminal tile — the 1s and the 9s.", tiles: [0, 13, 26, 2, 8, 24, 9, 21, 5, 10, 25, 27], targets: [0, 2, 4, 6], wrongNote: "Not that one — a terminal is only the 1 or the 9 of a suit." },
        { kind: "info", text: "There are four copies of every tile: 34 kinds of tile, four copies each, 136 tiles in all. The four copies of a kind are identical, so any copy can stand in for another." },
        { kind: "info", text: "One 5 in each suit is printed on a red-tinted tile instead of a plain one. It is still a 5 of its suit in every way, but it is worth a bonus when it ends up in a winning hand. That bonus is explained in 'Ways to win'." },
        { kind: "info", text: "Tiles also have short written codes. You will see them wherever the app names a tile in text — in tile labels for screen readers, and in Practice. A suited tile's code is its number plus a suit letter: m for characters, p for dots, s for bamboo. So 3m is the 3 of characters, 3p is the 3 of dots, and 3s is the 3 of bamboo. The winds are E, S, W, and N, for East, South, West, and North. The dragons are Wh for the white dragon, Gr for the green dragon, and Rd for the red dragon. A red five's code adds the letter r: 5pr is the red 5 of dots." },
        { kind: "info", text: "The rest of this lesson practises reading faces one at a time, out of order. Each row below shows all nine characters tiles in a shuffled order — not the taught row order — and each drill asks for one number. Read each face by its top character alone." },
        { kind: "drill", text: "Tap the 7 of characters.", tiles: [3, 6, 0, 8, 5, 2, 7, 1, 4], targets: [1], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. The red mark below is the same on every characters tile." },
        { kind: "drill", text: "Tap the 4 of characters.", tiles: [8, 2, 5, 3, 0, 7, 4, 6, 1], targets: [3], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. The red mark below is the same on every characters tile." },
        { kind: "drill", text: "Tap the 9 of characters.", tiles: [1, 4, 7, 0, 3, 8, 6, 2, 5], targets: [5], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. The red mark below is the same on every characters tile. Remember the side-by-side step: compare the bottom of the top character." },
        { kind: "drill", text: "Tap the 5 of characters.", tiles: [6, 1, 8, 3, 4, 0, 7, 2, 5], targets: [4], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. The red mark below is the same on every characters tile." },
        { kind: "drill", text: "Tap the 8 of characters.", tiles: [2, 7, 4, 1, 6, 0, 5, 3, 8], targets: [1], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. The red mark below is the same on every characters tile." },
        { kind: "drill", text: "Tap the 3 of characters.", tiles: [7, 5, 1, 8, 2, 4, 0, 6, 3], targets: [4], wrongNote: "Not that one — for the smallest numbers you can count the lines in the top character. Compare the face with the labelled row from earlier in this lesson." },
        { kind: "drill", text: "Tap the 6 of characters.", tiles: [4, 0, 6, 2, 8, 5, 1, 7, 3], targets: [5], wrongNote: "Not that one — look only at the dark character on top and compare it with the labelled row from earlier in this lesson. Remember the side-by-side step: compare the bottom of the top character." },
        { kind: "drill", text: "Tap the 2 of characters.", tiles: [5, 3, 7, 1, 0, 8, 4, 2, 6], targets: [3], wrongNote: "Not that one — for the smallest numbers you can count the lines in the top character. Compare the face with the labelled row from earlier in this lesson." },
        { kind: "drill", text: "Tap the 1 of characters.", tiles: [8, 6, 3, 5, 1, 7, 2, 0, 4], targets: [7], wrongNote: "Not that one — for the smallest numbers you can count the lines in the top character. Compare the face with the labelled row from earlier in this lesson." },
        { kind: "info", text: "The same practice for the winds: each row shows the wind faces in a shuffled order, and each drill names one wind. Match the name to the face." },
        { kind: "drill", text: "Tap the South wind.", tiles: [29, 31, 28, 30, 27], targets: [2], wrongNote: "Not that one — picture the row of the four wind faces from earlier in this lesson, in the order they were taught, and match the face against it." },
        { kind: "drill", text: "Tap the West wind.", tiles: [27, 30, 33, 29, 28], targets: [3], wrongNote: "Not that one — picture the row of the four wind faces from earlier in this lesson, in the order they were taught, and match the face against it." },
        { kind: "drill", text: "Tap the North wind.", tiles: [28, 30, 27, 29], targets: [1], wrongNote: "Not that one — picture the row of the four wind faces from earlier in this lesson, in the order they were taught, and match the face against it." },
        { kind: "drill", text: "Tap the East wind.", tiles: [30, 28, 27, 29], targets: [2], wrongNote: "Not that one — picture the row of the four wind faces from earlier in this lesson, in the order they were taught, and match the face against it." },
      ];
    case "tu2":
      return [
        { kind: "info", text: "You hold 13 tiles. A hand wins when it becomes 14 tiles arranged in one particular shape. This lesson names the parts of that shape, one at a time." },
        { kind: "info", text: "The shape is built from groups of three tiles: sets. One kind of set is a sequence — three tiles in a row in one suit. This is a sequence: 3, 4, 5 of dots.", strip: [11, 12, 13] },
        { kind: "info", text: "The other kind of set is a triplet — three copies of the same tile. This is a triplet: three 9s of bamboo.", strip: [26, 26, 26] },
        { kind: "info", text: "The last part of the shape is a pair — two copies of the same tile. This is a pair: two 5s of dots. A winning hand has exactly one pair.", strip: [13, 13] },
        { kind: "info", text: "Put the parts together: a complete hand is four sets and a pair, 14 tiles in all. This hand is complete — four sets, and the two 5s of dots are its pair.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
        {
          kind: "choice",
          text: "Which of these is a set?",
          options: [
            { label: "3 · 4 · 5 of dots", tiles: [11, 12, 13] },
            { label: "3 · 5 · 7 of dots", tiles: [11, 13, 15] },
            { label: "9 · 9 of characters", tiles: [8, 8] },
            { label: "4 · 5 of dots", tiles: [12, 13] },
          ],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "Those skip a number — a sequence is three in a row, with no gaps."
              : i === 2
                ? "That is a pair — two copies of the same tile. A pair is part of the shape, but it is not a set."
                : "That is only two tiles — a set has three tiles.",
        },
        {
          kind: "choice",
          text: "Which hand is complete?",
          options: [
            { label: "Four sets and a pair", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
            { label: "Four sets and a single", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13] },
            { label: "Five sets, no pair", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 4, 5, 6] },
            { label: "Three sets and two pairs", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13, 5, 5] },
          ],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "Count the tiles in that row — a complete hand has one more tile than that."
              : i === 2
                ? "Count the groups in that row, then count its tiles: a complete hand needs one part that this row leaves no room for."
                : "Count the groups and count the tiles in that row — compare both counts with the shape taught at the start of this lesson.",
        },
        { kind: "info", text: "Two more shapes also win. Seven pairs: seven different pairs and nothing else. Thirteen orphans: one of every terminal and every honor, with one of them twice, as the pair. Most winning hands use the standard shape — four sets and a pair — so that shape comes first." },
      ];
    case "tu3":
      return [
        { kind: "info", text: "Your hand is at the bottom of the table, and the other three players sit around it. A turn works like this: you draw one tile — take it from the face-down tiles — and then you discard one tile: tap a tile in your hand to throw it away. Drawing and then discarding keeps your hand at 13 tiles while you build toward four sets and a pair. The table itself is in front of you as you read. Each player has a name chip showing a wind — East, South, West, or North: that wind is the player's seat wind, the wind of the seat they are sitting in. Your chip reads 'East · You', so your seat wind is East for this hand. The label in the middle of the table, 'East 1', names the round and the hand: the East round, hand 1. The face-down tiles are the wall, the tiles everyone draws from, and the number beside 'Wall' is how many tiles are left in it. In the middle sits one face-up tile under the label DORA: that tile is the dora indicator — it marks a bonus tile, and a later lesson explains how it works. Beside it, the honba counter ('0 honba') is a bonus counter explained in 'Points and rounds'. The open area in front of each player is their pond, where their discards will lie face up. Every player starts a game with 25,000 points, shown on their chip." },
        {
          kind: "scene",
          seed: "om-tu3",
          text: (c) => {
            const stop = c.scene?.stop;
            if ((c.counters["discards"] ?? 0) === 0) {
              return "This is a real hand, on the real table. The other players take their turns by themselves. You have drawn a tile: tap any tile in your hand to discard it. Any tile in your hand is accepted here — there is no wrong discard in this step. Watch two things as you play: your pond, the face-up discards piling up in front of you, and the wall count in the middle of the table, which falls as tiles are drawn. Make six discards.";
            }
            if (stop?.kind === "turn" && stop.ctx.drawnTile) {
              return `You drew the ${tileName(stop.ctx.drawnTile.type)}. Tap a tile in your hand to discard it.`;
            }
            return "Tap a tile in your hand to discard it.";
          },
          enter: (c) => c.autoToTurn(),
          acceptsTiles: true,
          gate: (c, a) => {
            if (a.kind !== "tile") return false;
            c.scene!.act({ type: "discard", tileId: a.tileId });
            c.counters["discards"] = (c.counters["discards"] ?? 0) + 1;
            if ((c.counters["discards"] ?? 0) >= 6) return true;
            c.autoToTurn();
            return false;
          },
        },
        { kind: "info", text: "Draw, discard, repeat — that is the whole turn, and it is what just happened: you drew and discarded six times. Each time, your pond grew by one tile and the wall count in the middle fell as the four players drew. Your discarded tiles stay face up in front of you, in the order you discarded them: that area is your pond. All four ponds are face up for everyone to see, and later lessons will read them." },
      ];
    case "tu4":
      return [
        { kind: "info", text: "Tiles reach your hand by drawing. But sometimes another player discards a tile that completes a set in your hand. When that happens, you can claim the discard at once, instead of waiting to draw the tile yourself. Claiming a discard is a call. The completed set is placed face up beside your hand, and your hand is open from then on: everyone can see that set." },
        { kind: "info", text: "The first call is chi. Chi claims a discard from the player on your left — only from that player — to complete a sequence. If you hold the 2 and 3 of dots, and the player on your left discards the 4 of dots, chi takes it, and you have the sequence 2, 3, 4 at once.", strip: [10, 11, 12] },
        {
          kind: "scene",
          seed: "om-tu4chi-5",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "call") {
              return `New example — this scene starts a new position on purpose: a different hand and a different wall count from the step before. The player on your left has discarded the ${tileName(stop.ctx.tile.type)}. It completes a sequence with two tiles in your hand. Tap Chi to claim it and finish the sequence now, instead of waiting to draw that tile yourself. In a real game you could also tap Pass and let it go by.`;
            }
            return "New example — this scene starts a new position on purpose. Watch the player on your left — a discard you can use is coming.";
          },
          enter: (c) =>
            c.autoTo(
              (s) => s.kind === "call" && s.chiDecidable && s.ctx.chiOptions.length > 0,
            ),
          buttons: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind !== "call") return [];
            const btns: LessonButton[] = stop.ctx.chiOptions.map((opt, i) => {
              // The option is the resulting set as tile faces: the
              // called tile plus the two hand tiles, in sequence
              // order, the called tile sideways (issue #35).
              const called = stop.ctx.tile;
              const faces = [called, ...opt.map((id) => stop.view.hand.find((t) => t.id === id)!)]
                .sort((a, b) => a.type - b.type)
                .map((t) => ({ id: t.id, ...(t.id === called.id ? { side: true } : {}) }));
              return { label: "Chi", cls: "primary", id: `chi:${i}`, faces };
            });
            btns.push({ label: "Pass", cls: "ghost", id: "pass" });
            return btns;
          },
          gate: (c, a) => {
            if (a.kind !== "button") return false;
            if (a.id === "pass") {
              c.note = "Passing is allowed in a real game. Here, take the chi so you can see what it does.";
              return false;
            }
            if (a.id.startsWith("chi:")) {
              const stop = c.scene!.stop;
              if (stop?.kind !== "call") return false;
              const opt = stop.ctx.chiOptions[Number(a.id.slice(4))]!;
              c.scene!.act({ type: "chi", tileIds: opt });
              return true;
            }
            return false;
          },
        },
        { kind: "info", text: "The second call is pon. Pon claims any player's discard to complete a triplet. If you hold two copies of a tile and any opponent discards the third copy, pon takes it at once, and the triplet is placed face up beside your hand.", strip: [13, 13] },
        {
          kind: "scene",
          seed: "om-tu4pon-24",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "call") {
              return `New example — this scene starts a new position on purpose: a different hand from the chi scene, and the set you made there is gone. Another player has discarded the ${tileName(stop.ctx.tile.type)}, and you hold two copies of it. Tap Pon to claim it and complete the triplet now, instead of waiting to draw the third copy yourself. In a real game you could also tap Pass.`;
            }
            return "New example — this scene starts a new position on purpose. Watch the discards — a tile you hold two copies of is coming.";
          },
          enter: (c) =>
            c.autoTo((s) => s.kind === "call" && s.ponDecidable && s.ctx.canPon),
          buttons: () => [
            { label: "Pon", cls: "primary", id: "pon" },
            { label: "Pass", cls: "ghost", id: "pass" },
          ],
          gate: (c, a) => {
            if (a.kind !== "button") return false;
            if (a.id === "pass") {
              c.note = "Passing is allowed in a real game. Here, take the pon so you can see what it does.";
              return false;
            }
            if (a.id === "pon") {
              c.scene!.act({ type: "pon" });
              return true;
            }
            return false;
          },
        },
        { kind: "info", text: "The third call is kan: a set of four copies of the same tile. You can call kan on a discard when you hold the other three copies, or declare kan from four copies in your own hand — declaring it yourself keeps your hand closed. After a kan you draw an extra tile, because the set of four leaves your hand one tile short." },
        {
          kind: "scene",
          seed: "om-tu4kan-29",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "call") {
              return `New example — this scene starts a new position on purpose: a different hand from the pon scene. Another player has discarded the ${tileName(stop.ctx.tile.type)}, and you hold the other three copies. Tap Kan to claim it and complete the set of four. You then draw an extra tile, because a set of four leaves your hand one tile short. In a real game you could also tap Pass.`;
            }
            return "New example — this scene starts a new position on purpose. Watch the discards — a tile you hold three copies of is coming.";
          },
          enter: (c) =>
            c.autoTo((s) => s.kind === "call" && s.ponDecidable && s.ctx.canKan),
          buttons: () => [
            { label: "Kan", cls: "primary", id: "kan" },
            { label: "Pass", cls: "ghost", id: "pass" },
          ],
          gate: (c, a) => {
            if (a.kind !== "button") return false;
            if (a.id === "pass") {
              c.note = "Passing is allowed in a real game. Here, take the kan so you can see what it does.";
              return false;
            }
            if (a.id === "kan") {
              c.scene!.act({ type: "daiminkan" });
              // The replacement (rinshan) draw and its discard play
              // out automatically — the lesson is the declaration.
              let guard = 0;
              while (c.scene!.stop?.kind === "turn" && guard++ < 3) c.scene!.auto();
              return true;
            }
            return false;
          },
        },
        { kind: "info", text: "A kan also turns a new tile face up on the table: a dora indicator. It marks a bonus tile, a dora. For a suited tile, the dora is the next number up in the same suit — an indicator showing the 3 of dots makes the 4 of dots a dora. Each dora in a winning hand adds to the hand's score. The red-tinted 5s from the first lesson are always dora, indicator or not." },
        { kind: "info", text: "Chi, pon, and a kan called on a discard all open your hand: the set sits face up where everyone can see it. An open hand cannot use every way of winning — some of the winning patterns taught in 'Ways to win' need a closed hand. A kan declared from four copies in your own hand is the exception: it keeps your hand closed." },
      ];
    case "tu5":
      return [
        { kind: "info", text: "When a hand is one tile away from the complete shape — four sets and a pair — the hand is ready. Ready has a name: tenpai. The tiles that would complete the hand are its waits. This hand is tenpai: it is waiting on the 5 of dots to make its pair.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13] },
        { kind: "info", text: "A tenpai hand wins when one of its waits arrives. If you draw the wait yourself, the win is tsumo. If another player discards the wait and you claim that discard, the win is ron. The next two scenes show one of each: first a tsumo, then a ron." },
        {
          kind: "scene",
          seed: "om-tu5a-99",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "turn" && stop.ctx.canTsumo) {
              return `You drew the ${tileName(stop.ctx.drawnTile!.type)} — it is one of your waits, and your hand is complete. Tap Tsumo to win the hand. One thing has already happened in this hand: you declared riichi. Riichi is a declaration you make on a ready, closed hand: you pay a 1,000-point stake at the moment you declare, and your hand is locked from then on — the next lesson, 'Riichi', teaches it in full. That payment is why your score is 24,000, and the stake stick sits in the middle of the table. Winning collects the stake back.`;
            }
            return "Your hand is tenpai. The other players take their turns; watch what you draw.";
          },
          enter: (c) => c.autoTo((s) => s.kind === "turn" && s.ctx.canTsumo),
          acceptsTiles: true,
          buttons: () => [{ label: "Tsumo", cls: "primary", id: "tsumo" }],
          gate: (c, a) => {
            if (a.kind === "tile") {
              c.note = "You drew a winning tile — declare tsumo instead of discarding.";
              return false;
            }
            if (a.kind === "button" && a.id === "tsumo") {
              c.scene!.act({ type: "tsumo" });
              return true;
            }
            return false;
          },
        },
        { kind: "info", text: "That was tsumo: a win on a tile you drew yourself. When you win by tsumo, all three opponents pay you — here, each paid 6,000 — and your 1,000-point riichi stake came back to you on top, so you gained 19,000 points in all. The table has already set up the next hand, which is why the tiles in front of you are different." },
        { kind: "info", text: "One rule limits ron: furiten. If one of your waits is a tile you discarded earlier yourself — a tile now sitting in your own pond — then you are in furiten, and you cannot ron at all, not even on a different wait. You can still win by tsumo. Furiten ends when your waits change." },
        {
          kind: "scene",
          seed: "om-tu5b-4",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "call") {
              const waits = waitNames(stop.view);
              return `New example — the hand has changed on purpose: this is a different hand, set up to show a ron win. You are tenpai, waiting on ${joinTileNames(waits)}. Another player has just discarded one of your waits. Tap Ron to claim it and win the hand — only the player who discarded it pays you. In a real game you could tap Pass, but not here. As in the tsumo example, you declared riichi earlier in this hand and paid the 1,000-point stake then — that is why your score is 24,000, and the stake stick sits in the middle of the table. Winning collects the stake back.`;
            }
            return "New example — the hand has changed on purpose. You are tenpai. Watch the discards — one of your waits is coming.";
          },
          enter: (c) => c.autoTo((s) => s.kind === "call" && s.ctx.canRon),
          buttons: () => [
            { label: "Ron", cls: "primary", id: "ron" },
            { label: "Pass", cls: "ghost", id: "pass" },
          ],
          gate: (c, a) => {
            if (a.kind !== "button") return false;
            if (a.id === "pass") {
              c.note = "That was your winning tile. Passing is allowed in a real game — here, take the ron.";
              return false;
            }
            if (a.id === "ron") {
              c.scene!.act({ type: "ron" });
              return true;
            }
            return false;
          },
        },
        { kind: "info", text: "That was ron: a win on another player's discard. Only the player who discarded the winning tile pays you — here South paid 2,900 — and your 1,000-point riichi stake came back to you on top, so you gained 3,900 points in all. The other two players paid nothing. The table has already set up the next hand, which is why the tiles in front of you are different." },
      ];
    case "tu6":
      return [
        { kind: "info", text: "Riichi is a declaration you make while discarding, when your hand is tenpai and still closed — you have made no calls. Declaring riichi pays a stake of 1,000 points at once: the points leave your score and sit on the table as a stake stick, and the next player to win a hand collects every stake on the table. After that, your hand is locked: on each of your turns you discard the tile you drew, unless that tile wins the hand or can form a kan with copies already in your hand. In exchange, riichi itself counts as a way to score — a pattern in its own right, taught in 'Ways to win' — so a hand that has declared riichi can always win, by tsumo or by ron. You need at least 1,000 points to declare, and at least four tiles left to draw." },
        {
          kind: "scene",
          seed: "om-tu6-1420",
          text: "This hand is tenpai and closed, and it is your turn. One tile in your hand is marked: it is the discard that keeps the hand tenpai. Tap the marked tile: tapping it discards the tile and declares riichi with that discard, and the 1,000-point stake is paid at that moment — your score drops by 1,000 and the stake stick appears in the middle of the table. Any other discard would leave the hand more than one tile from complete, and riichi needs a tenpai hand.",
          acceptsTiles: true,
          highlightRiichi: true,
          gate: (c, a) => {
            if (a.kind !== "tile") return false;
            const stop = c.scene!.stop;
            if (stop?.kind !== "turn") return false;
            if (stop.ctx.riichiDiscardIds.includes(a.tileId)) {
              c.scene!.act({ type: "discard", tileId: a.tileId, riichi: true });
              c.counters["eventsAtRiichi"] = c.scene!.events.length;
              return true;
            }
            c.note = "That tile is not one of the marked discards — it would leave you more than one tile from complete, and riichi needs a tenpai hand.";
            return false;
          },
        },
        {
          kind: "scene",
          seed: "om-tu6-1420",
          text: (c) => {
            const evs = c.scene?.events ?? [];
            const from = c.counters["eventsAtRiichi"] ?? 0;
            const won = evs.slice(from).some((ev) => ev.type === "win" && Number(ev["seat"]) === 0);
            const drawEnd = evs.slice(from).find((ev) => ev.type === "hand-end" && ev["reason"] === "exhaustive-draw");
            const ended = evs.slice(from).some((ev) => ev.type === "hand-end");
            if (won) return "You won the hand. Your 1,000-point stake comes back to you, on top of the winnings.";
            if (drawEnd) {
              // Reconciled against the scene's actual events (seed
              // om-tu6-1420, driven 2026-11-17): after your riichi,
              // one other player declared riichi too; the wall ran
              // out with seats 0, 2, 3 tenpai, so the one player who
              // was not tenpai paid 1,000 to each of them.
              const tenpai = (drawEnd["tenpai"] as readonly number[] | undefined) ?? [];
              const youTenpai = tenpai.includes(0);
              const othersRiichi = evs.slice(from).filter((ev) => ev.type === "riichi").length;
              const stakes = 1 + othersRiichi;
              return `The rest of the hand played out by itself, and the table has moved on to the next hand — the hand in front of you is a new one. Nobody won that hand: the wall ran out, so it ended in a draw. ${othersRiichi === 1 ? "One other player also declared riichi after you" : `${othersRiichi} other players also declared riichi after you`}, so ${stakes} riichi stakes of 1,000 points sit on the table; they stay there, and the next player to win a hand collects them. At a drawn hand, the players who were tenpai share 3,000 points paid by the players who were not tenpai. ${youTenpai ? "You were tenpai, so you received 1,000 of it — that is why your score is back at 25,000 even though you paid the 1,000 stake." : "You were not tenpai, so you received none of it."} The player in the East seat was tenpai too, so the East seat stays with the same player for the next hand and the honba counter rose by one.`;
            }
            if (ended) return "The hand ended without your win. The stake stays on the table: the next player to win a hand collects it.";
            return "After riichi, you discard each tile you draw, unless it wins the hand. The rest of this hand plays out by itself — watch how it ends.";
          },
          enter: (c) => {
            const from = c.counters["eventsAtRiichi"] ?? 0;
            let guard = 0;
            while (
              c.scene!.stop?.kind !== "gameEnd" &&
              !c.scene!.events.slice(from).some((ev) => ev.type === "hand-end") &&
              guard++ < 60
            ) {
              c.scene!.auto();
            }
          },
          gate: (_c, a) =>
            a.kind === "continue" || (a.kind === "button" && a.id === "continue"),
          buttons: () => [CONTINUE],
        },
      ];
    case "tu7":
      return [
        { kind: "info", text: "A complete shape is not enough to win. The hand must also contain at least one yaku — a scoring pattern in the tiles. Each yaku is worth han, the units a hand's value is counted in; the next lesson turns han into points. Dora are not yaku: each dora adds 1 han as a bonus, but a hand with dora and no yaku still cannot win. This lesson introduces the patterns a beginner meets first.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
        { kind: "info", text: "Riichi — 1 han. The declaration from the Riichi lesson is itself a yaku: a closed hand that declares riichi has its pattern, and can win by tsumo or by ron. Furiten still limits ron.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 13, 13] },
        { kind: "info", text: "Tanyao — 1 han. Every tile in the hand is a simple: no terminals and no honors anywhere in the hand.", strip: [2, 3, 4, 12, 13, 14, 21, 22, 23, 20, 20, 20, 5, 5] },
        { kind: "info", text: "Yakuhai — 1 han for a triplet or kan of dragons, of the round wind, or of your own seat wind — the wind of the seat you are sitting in. A triplet that is both the round wind and your seat wind counts twice: 2 han.", strip: [33, 33, 33, 1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13] },
        {
          kind: "choice",
          text: "Which yaku does this hand have?",
          strip: [33, 33, 33, 1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13],
          options: [{ label: "Yakuhai" }, { label: "Tanyao" }, { label: "Riichi" }, { label: "Pinfu" }],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "The red dragons are honors — tanyao allows none."
              : i === 2
                ? "Riichi is a declaration made during play, not a pattern you can see in these tiles. Look at the triplet in this hand, and at what kind of tile it is made of."
                : "Pinfu is all sequences — this hand contains a triplet, so look again at what that triplet is made of.",
        },
        { kind: "info", text: "Pinfu — 1 han, closed hands only. All four sets are sequences, the pair is not a dragon or a scoring wind, and the hand waits on a tile that completes a sequence from either end.", strip: [1, 2, 3, 12, 13, 14, 21, 22, 23, 24, 25, 26, 19, 19] },
        {
          kind: "choice",
          text: "Which yaku does this hand have?",
          strip: [2, 3, 4, 13, 13, 13, 20, 21, 22, 23, 24, 25, 1, 1],
          options: [{ label: "Pinfu" }, { label: "Tanyao" }, { label: "Yakuhai" }, { label: "Toitoi" }],
          correct: 1,
          wrongNote: (_c, i) =>
            i === 0
              ? "Pinfu is all sequences — this hand has a triplet of the 5 of dots."
              : i === 2
                ? "Look for a triplet of dragons or of a scoring wind in this hand — then check what kinds of tiles make up the rest of the hand."
                : "That pattern needs every set to be a triplet — this hand is mostly sequences. Check what kinds of tiles make up the whole hand instead.",
        },
        { kind: "info", text: "Toitoi — 2 han. All four sets are triplets or kans, plus the pair. No sequences anywhere.", strip: [2, 2, 2, 13, 13, 13, 22, 22, 22, 31, 31, 31, 7, 7] },
        { kind: "info", text: "Chiitoitsu — 2 han, closed hands only. Seven different pairs instead of the standard shape. Four identical tiles count as one pair, not two.", strip: [1, 1, 4, 4, 11, 11, 15, 15, 20, 20, 24, 24, 28, 28] },
        { kind: "info", text: "A hand can hold more than one yaku at once, and then the han add up — the yaku stack. This hand is closed and all sequences, and every tile is a simple: it is read aloud as 2, 3, 4 of characters; 3, 4, 5 of dots; 6, 7, 8 of dots; 2, 3, 4 of bamboo; and a pair of 5s of characters. Counted out: pinfu — 1 han, for the all-sequence closed hand with a two-sided wait — and tanyao — 1 han, because every tile is a simple. Stacked, the hand is worth 2 han.", strip: [1, 2, 3, 11, 12, 13, 14, 15, 16, 19, 20, 21, 4, 4] },
        {
          kind: "choice",
          text: "How many han is this hand worth in all? One triplet in it was called with pon, so the hand is open. It is read aloud as: three 2s of dots, three 4s of bamboo, three 6s of characters, three 8s of bamboo, and a pair of 3s of dots.",
          strip: [10, 10, 10, 21, 21, 21, 5, 5, 5, 25, 25, 25, 11, 11],
          options: [{ label: "1 han" }, { label: "2 han" }, { label: "3 han" }, { label: "5 han" }],
          correct: 2,
          wrongNote: "Count the patterns one at a time and add their values together. First check what kinds of tiles the hand is made of, then check the shape of its sets — an open hand can still hold both of those patterns.",
        },
      ];
    case "tu8":
      return [
        { kind: "info", text: "A winning hand is paid in points, and the points come from two numbers. Han counts the hand's value: each yaku gives han, and each dora adds 1 han. Fu are minipoints from the hand's shape — its triplets, its pair, its wait, and how it was won. Each extra han roughly doubles what the hand pays. This lesson wins a real hand, then reads the numbers off that win." },
        {
          kind: "scene",
          seed: "om-tu5a-261",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "turn" && stop.ctx.canTsumo) {
              return "New example — the hand has changed on purpose: a different hand from the last lesson. You have already declared riichi in this hand and paid the 1,000-point stake at that moment — that is why your score is 24,000, and the stake stick sits in the middle of the table. You drew a winning tile. Tap Tsumo to win the hand, and watch what it pays.";
            }
            return "New example — the hand has changed on purpose. This hand is one tile from complete. Watch your draws: a winning tile is coming, and the questions after it are about what the win pays.";
          },
          enter: (c) => c.autoTo((s) => s.kind === "turn" && s.ctx.canTsumo),
          acceptsTiles: true,
          buttons: () => [{ label: "Tsumo", cls: "primary", id: "tsumo" }],
          gate: (c, a) => {
            if (a.kind === "tile") {
              c.note = "You drew a winning tile — declare tsumo instead of discarding.";
              return false;
            }
            if (a.kind === "button" && a.id === "tsumo") {
              c.scene!.act({ type: "tsumo" });
              return true;
            }
            return false;
          },
        },
        {
          kind: "info",
          text: (c) => c.winBreakdown(),
        },
        {
          kind: "choice",
          text: "How many han was your hand?",
          options: (c) => {
            const han = c.winHan();
            return distinctQuizValues(han, 1, 1).map((v) => ({ label: `${v} han` }));
          },
          correct: 1,
          wrongNote: "Use the breakdown on the step before this one — tap Back to see it again. It lists every part of this same win's han, line by line, and gives the total.",
        },
        {
          kind: "choice",
          text: "How many fu — minipoints — did it have?",
          options: (c) => {
            const fu = c.winFu();
            return distinctQuizValues(fu, 10, 0).map((v) => ({ label: `${v} fu` }));
          },
          correct: 1,
          wrongNote: "Use the breakdown two steps back — tap Back twice to see it again. It states this same win's fu and where the number comes from.",
        },
        {
          kind: "choice",
          text: "How many points did you gain?",
          options: (c) => {
            const total = c.winGained();
            return [total - 1000, total, total + 1000].map((v) => ({
              label: `${Math.max(100, v).toLocaleString("en-US")} points`,
            }));
          },
          correct: 1,
          wrongNote: "Use the breakdown three steps back — tap Back to return to it. It adds up this same win: what each opponent paid, plus the riichi stake that came back to you.",
        },
        { kind: "info", text: "One player in each hand is the dealer: the player sitting in the East seat for that hand. A dealer's win pays more — on a dealer tsumo, all three opponents pay the dealer rate — and a dealer also pays more when another player wins by tsumo. All payments round up to the next 100 points." },
        { kind: "info", text: "If the dealer wins a hand, or a hand is drawn with the dealer tenpai, the same dealer deals the next hand, and the honba count rises by one. Honba are a bonus counter: each honba adds 300 points to the next winning hand. An East-only game runs from East 1 to East 4; an East/South game continues through South 4. A game ends early if any player's score falls below zero." },
        { kind: "info", text: "New example — a second worked hand, counted in full on the next step. This hand is closed, and it had declared riichi. It is read aloud as: three 2s of characters; 3, 4, 5 of characters; 6, 7, 8 of dots; three 9s of bamboo; and a pair of white dragons. It won by ron — on a discard — when the white dragon arrived: the hand had been waiting on that one tile alone to complete its pair. You sit in the South seat, so you are not the dealer. There are no dora in the hand and no honba.", strip: [1, 1, 1, 2, 3, 4, 14, 15, 16, 26, 26, 26, 31, 31] },
        { kind: "info", text: "Here is that hand counted out in full. Han first: riichi — 1 han, for the declaration. No other pattern is in the hand, and there are no dora, so the hand is 1 han in all. Now the fu, part by part. Every hand starts with a base of 20 fu. Winning by ron with a closed hand adds 10 fu. A closed triplet of simples adds 4 fu: the three 2s of characters. A closed triplet of terminals adds 8 fu: the three 9s of bamboo. A pair of dragons adds 2 fu. Waiting on one tile alone — the pair tile — adds 2 fu. The sequences add nothing. The parts add to 46 fu, and fu always round up to the next ten, so the hand counts as 50 fu. At 1 han and 50 fu, a win by ron for a player who is not the dealer pays 1,600 points, and the player who discarded the winning tile pays all of it." },
        {
          kind: "choice",
          text: "How many han was the worked hand?",
          options: [{ label: "1 han" }, { label: "2 han" }, { label: "3 han" }, { label: "4 han" }],
          correct: 0,
          wrongNote: "Use the breakdown on the step before this one — tap Back to see it again. It lists every part of this same hand's han, line by line, and gives the total.",
        },
        {
          kind: "choice",
          text: "How many fu did the worked hand have, after rounding?",
          options: [{ label: "30 fu" }, { label: "40 fu" }, { label: "50 fu" }, { label: "60 fu" }],
          correct: 2,
          wrongNote: "Use the breakdown two steps back — tap Back to see it again. It adds this same hand's fu part by part, then rounds the total up.",
        },
        {
          kind: "choice",
          text: "What does the worked hand pay, and who pays it?",
          options: [
            { label: "800 points from the discarder" },
            { label: "1,600 points from the discarder" },
            { label: "1,600 points split among all three opponents" },
            { label: "3,200 points from the discarder" },
          ],
          correct: 1,
          wrongNote: "Use the breakdown three steps back — tap Back to return to it. It ends with this same hand's payment and who pays it. Remember also how a win by ron is paid, from earlier in this lesson.",
        },
        { kind: "info", text: "New example — now count a hand yourself, one that has not been counted for you. This hand is closed, and it had declared riichi. You sit in the East seat, so you are the dealer. It is read aloud as: 2, 3, 4 of characters; 3, 4, 5 of dots; 6, 7, 8 of dots; 2, 3, 4 of bamboo; and a pair of 5s of characters. It won by ron when the 2 of characters arrived, completing the first sequence; the hand had also been waiting on the 5 of characters at the other end of that sequence. There are no dora in the hand and no honba.", strip: [1, 2, 3, 11, 12, 13, 14, 15, 16, 19, 20, 21, 4, 4] },
        {
          kind: "choice",
          text: "How many han is this hand? Count every pattern in it, and add them together.",
          options: [{ label: "1 han" }, { label: "2 han" }, { label: "3 han" }, { label: "4 han" }],
          correct: 2,
          wrongNote: "Count the patterns in the pictured hand one at a time, using the values taught in 'Ways to win'. Check the declaration described above, the shape of the sets and the wait, and what kinds of tiles the hand is made of — then add the values together, because patterns stack.",
        },
        {
          kind: "choice",
          text: "How many fu does this hand have?",
          options: [{ label: "20 fu" }, { label: "40 fu" }, { label: "30 fu" }, { label: "50 fu" }],
          correct: 2,
          wrongNote: "Build the fu from the parts, as the worked hand showed: start with the base, then add for how the hand was won, its triplets, its pair, and its wait — a hand of sequences with none of those additions stays low. Then round up to the nearest ten.",
        },
        {
          kind: "choice",
          text: "What does this hand pay, and who pays it?",
          options: [
            { label: "2,900 points from the discarder" },
            { label: "11,600 points from the discarder" },
            { label: "5,800 points from the discarder" },
            { label: "5,800 points split among all three opponents" },
          ],
          correct: 2,
          wrongNote: "Use your han and fu counts for this hand, and the payment rules from earlier in this lesson: on a win by ron one player pays the whole amount, and a dealer's win pays at the higher rate.",
        },
        { kind: "info", text: "That hand, counted out: riichi — 1 han; pinfu — 1 han, for the all-sequence closed hand with a wait at either end of a sequence; and tanyao — 1 han, because every tile is a simple. Stacked, 3 han. The fu are 30 fu: the base 20, plus 10 for winning by ron with a closed hand, with no triplet, pair, or wait additions — and a closed all-sequence hand won by ron is counted at 30 fu. At 3 han and 30 fu, a dealer's win by ron pays 5,800 points, all from the player who discarded the winning tile." },
        { kind: "info", text: "New example — another hand to count yourself. This hand is closed, and it had not declared riichi. You sit in the South seat, so you are not the dealer; the round wind is East. It is read aloud as: 2, 3, 4 of characters; 3, 4, 5 of dots; three 6s of bamboo; three South winds; and a pair of 4s of bamboo. It won by tsumo — you drew the 4 of bamboo yourself, completing the pair; the hand had been waiting on that one tile alone. There are no dora in the hand and no honba.", strip: [1, 2, 3, 11, 12, 13, 23, 23, 23, 28, 28, 28, 21, 21] },
        {
          kind: "choice",
          text: "How many han is this hand? Count every pattern in it, and add them together.",
          options: [{ label: "1 han" }, { label: "2 han" }, { label: "3 han" }, { label: "4 han" }],
          correct: 1,
          wrongNote: "Count the patterns in the pictured hand one at a time. Check how the hand was won and whether the hand is closed, and look at the triplet of winds: compare it with your own seat wind and with the round wind, using the values taught in 'Ways to win'. Then add the values together.",
        },
        {
          kind: "choice",
          text: "How many fu does this hand have?",
          options: [{ label: "30 fu" }, { label: "50 fu" }, { label: "40 fu" }, { label: "60 fu" }],
          correct: 2,
          wrongNote: "Build the fu from the parts, as the worked hand showed: start with the base, then add for how the hand was won, each triplet — noting whether its tiles are simples or honors — the pair, and the wait. Then round the total up to the nearest ten.",
        },
        {
          kind: "choice",
          text: "What does this hand pay, and who pays it?",
          options: [
            { label: "700 points from every opponent" },
            { label: "1,300 points from every opponent" },
            { label: "1,300 points from the dealer and 700 points from each of the other two opponents" },
            { label: "700 points from the dealer and 1,300 points from each of the other two opponents" },
          ],
          correct: 2,
          wrongNote: "Use your han and fu counts for this hand: on a win by tsumo every opponent pays, and the share paid by the dealer follows the dealer rate explained earlier in this lesson.",
        },
        { kind: "info", text: "That hand, counted out: winning on your own draw with a closed hand — 1 han; and a triplet of your own seat wind — 1 han, because the three South winds match the South seat you are sitting in. Stacked, 2 han. The fu, part by part: base 20; winning by tsumo adds 2; a closed triplet of simples adds 4 — the three 6s of bamboo; a closed triplet of honors adds 8 — the three South winds; waiting on one tile alone adds 2. The parts add to 36 fu, rounded up to 40 fu. At 2 han and 40 fu, a win by tsumo for a player who is not the dealer pays 1,300 points from the dealer and 700 points from each of the other two opponents." },
        { kind: "info", text: "New example — one more hand to count yourself. This hand is closed, and it had not declared riichi. You sit in the East seat, so you are the dealer. It is read aloud as: 3, 4, 5 of characters; three 8s of characters; 5, 6, 7 of dots; 6, 7, 8 of bamboo; and a pair of 5s of dots. It won by tsumo — you drew the 5 of dots yourself, completing the pair; the hand had been waiting on that one tile alone. There are no dora in the hand and no honba.", strip: [2, 3, 4, 7, 7, 7, 13, 14, 15, 23, 24, 25, 13, 13] },
        {
          kind: "choice",
          text: "How many han is this hand? Count every pattern in it, and add them together.",
          options: [{ label: "1 han" }, { label: "2 han" }, { label: "3 han" }, { label: "5 han" }],
          correct: 1,
          wrongNote: "Count the patterns in the pictured hand one at a time. Check what kinds of tiles the hand is made of, and how the hand was won with a closed hand — then add the values together, because patterns stack.",
        },
        {
          kind: "choice",
          text: "How many fu does this hand have?",
          options: [{ label: "20 fu" }, { label: "30 fu" }, { label: "40 fu" }, { label: "50 fu" }],
          correct: 1,
          wrongNote: "Build the fu from the parts, as the worked hand showed: start with the base, then add for how the hand was won, its triplet, its pair, and its wait. Then round the total up to the nearest ten.",
        },
        {
          kind: "choice",
          text: "What does this hand pay, and who pays it?",
          options: [
            { label: "500 points from each opponent" },
            { label: "1,000 points from each opponent" },
            { label: "2,000 points from each opponent" },
            { label: "3,000 points from each opponent" },
          ],
          correct: 1,
          wrongNote: "Use your han and fu counts for this hand: on a win by tsumo every opponent pays, and a dealer's win is paid at the higher rate by all three.",
        },
        { kind: "info", text: "That hand, counted out: every tile is a simple — 1 han; and winning on your own draw with a closed hand — 1 han. Stacked, 2 han. The fu, part by part: base 20; winning by tsumo adds 2; a closed triplet of simples adds 4 — the three 8s of characters; waiting on one tile alone adds 2. The parts add to 28 fu, rounded up to 30 fu. At 2 han and 30 fu, a dealer's win by tsumo pays 1,000 points from each opponent. Counting a new hand is the whole skill of this lesson: read the tiles, count the patterns and add them, build the fu part by part and round up, then turn the two numbers into who pays what." },
      ];
    case "tu9":
      return [
        { kind: "info", text: "Points are lost by dealing in: discarding the tile that completes another player's tenpai hand. That player wins by ron, and the player who discarded pays for the whole hand. The danger is sharpest after an opponent declares riichi — their hand is tenpai, and any of their waits that you discard can cost you the hand. Declaring riichi costs the player who declares a 1,000-point stake, paid at once, so their score drops by 1,000 the moment they declare. This lesson practices the safest answer." },
        {
          kind: "scene",
          seed: "om-tu9-2",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind !== "turn") return "Watch the table — a riichi is coming.";
            const threat = stop.view.players.find((p) => p.seat !== 0 && p.riichi);
            if (!threat) return "Watch the table — a riichi is coming.";
            const wind = WIND_WORD[threat.seatWind] ?? "";
            // Hint-only at every attempt count (fix round, 2026-11-17):
            // an earlier version listed the safe tiles in the learner's
            // hand after two misses, printing the answer while the
            // question was still open. The text points at the pond and
            // the rule; it never names which hand tiles match it. The
            // no-leak guard in test/tutorial-leaks.test.ts drives two
            // misses here and asserts no safe tile is named.
            return `${wind} has declared riichi, so ${wind}'s hand is tenpai. ${wind} paid the 1,000-point stake to declare, which is why ${wind}'s score stands at ${threat.score.toLocaleString("en-US")}. Discard a tile from ${wind}'s pond — the tiles ${wind} has already thrown away, face up in front of them. Those tiles are safe against ${wind}: if any tile ${wind} is waiting for is in ${wind}'s own pond, ${wind} cannot win by ron at all — and a tile sitting in their own pond can never be the tile they take from you. Another opponent might still be waiting on them.`;
          },
          enter: (c) =>
            c.autoTo((s) => {
              if (s.kind !== "turn") return false;
              const threat = s.view.players.find((p) => p.seat !== 0 && p.riichi);
              if (!threat) return false;
              return new Set(threat.discards.map((d) => d.tile.type)).size >= 3;
            }),
          acceptsTiles: true,
          gate: (c, a) => {
            if (a.kind !== "tile") return false;
            const stop = c.scene!.stop;
            if (stop?.kind !== "turn") return false;
            const threat = stop.view.players.find((p) => p.seat !== 0 && p.riichi);
            if (!threat) return false;
            const tile = stop.view.hand.find((t) => t.id === a.tileId);
            if (!tile) return false;
            if (threat.discards.some((d) => d.tile.type === tile.type)) {
              c.scene!.act({ type: "discard", tileId: a.tileId });
              return true;
            }
            c.counters["misses"] = (c.counters["misses"] ?? 0) + 1;
            c.note = `The ${tileName(tile.type)} is not in ${WIND_WORD[threat.seatWind]}'s pond — it could be their winning tile.`;
            return false;
          },
        },
        { kind: "info", text: "The tiles in a riichi player's own pond are genbutsu, and they are safe against that player. The reason is furiten, the rule from 'Ready and winning', stated one way everywhere: if any tile a player is waiting for is in their own pond, that player cannot win by ron at all — on any discard, from any player. A tile from their pond is therefore never a tile they can take from you. Sometimes none of your tiles are in the riichi player's pond: then no discard is completely safe. You choose between discarding the tile that seems least likely to be their wait and accepting the risk, or breaking up your own hand — discarding tiles it needed — to reach a safer tile on a later turn. And the guarantee has a limit: genbutsu safety covers only that one riichi player. Another opponent could still be waiting on the same tile, and the riichi player can still win by drawing their wait. Whether defense is worth it depends on the score, the round, and how close your own hand is." },
      ];
    case "tu10":
      return [
        { kind: "info", text: "American mahjong is a different game played with a similar set of tiles. This lesson lists the differences only. Everything in the other lessons is riichi." },
        { kind: "info", text: "No jokers. American sets include joker tiles, which can stand for other tiles. Riichi has no jokers: every tile is itself, and the full set is the 136 tiles from the first lesson." },
        { kind: "info", text: "No Charleston. American play begins with the Charleston, a passing of tiles between players. Riichi has no passing: you are dealt 13 tiles, and the hand begins." },
        { kind: "info", text: "No annual card. In American mahjong, the winning hands are printed on a card that is published each year. Riichi has no card: any hand with the complete shape and a yaku wins, and the yaku are the patterns from 'Ways to win'." },
        {
          kind: "choice",
          text: "What takes the place of the annual card here?",
          options: [
            { label: "A different card each season" },
            { label: "Scoring patterns — yaku — built from any tiles" },
            { label: "Jokers" },
            { label: "The dealer's choice each hand" },
          ],
          correct: 1,
          wrongNote: "There is no card at all here, and nothing about what a winning hand must contain changes from year to year or from hand to hand. Think back to the 'Ways to win' lesson: what must every winning hand contain?",
          correctNote: "Correct — that is the right answer. There is no card at all: riichi's scoring patterns are the yaku, built from any tiles, and they do not change from year to year.",
        },
        { kind: "info", text: "When the American variant arrives it will have its own lessons. Everything before this lesson was riichi." },
      ];
    case "tu11":
      // TU-11 is a real guided game, launched and completed by the
      // App; it has no panel steps.
      return [];
  }
}

const SCENE_MODULES: ReadonlySet<ModuleId> = new Set(["tu3", "tu4", "tu5", "tu6", "tu8", "tu9"]);

/**
 * The state a step was in when it was entered, captured after its
 * enter hook ran. Back restores one of these: the scene is rebuilt
 * by deterministic replay of the decision log as it stood at that
 * step's entry, so a redone step replaces its earlier decisions
 * instead of appending to them.
 */
interface StepSnapshot {
  readonly scene: {
    readonly seed: string;
    readonly length: GameLength;
    readonly decisions: readonly SceneDecision[];
  } | null;
  readonly counters: Readonly<Record<string, number>>;
}

export class LessonController {
  readonly moduleId: ModuleId;
  readonly def: ModuleDef;
  readonly steps: readonly StepDef[];
  stepIndex = 0;
  scene: LessonScene | null = null;
  counters: Record<string, number> = {};
  found: number[] = [];
  note: string | null = null;
  /** A choice step with a correctNote waits here after a correct
   * pick, showing the confirmation until Continue. */
  choiceConfirmed = false;
  done = false;
  private snapshots = new Map<number, StepSnapshot>();

  constructor(moduleId: ModuleId, saved?: SavedLessonState | null) {
    this.moduleId = moduleId;
    this.def = moduleDef(moduleId);
    this.steps = stepsFor(moduleId);
    const validSaved = parseSavedLesson(saved, lessonBounds);
    if (validSaved && validSaved.module === moduleId &&
      (!SCENE_MODULES.has(moduleId) || validSaved.scene !== null)) {
      try {
        if (validSaved.scene) {
          this.scene = LessonScene.restore(validSaved.scene.seed, validSaved.scene.decisions);
        }
        if (moduleId === "tu8" && validSaved.step >= 2 &&
          (!this.scene || !lastWinEvent(this.scene.events))) {
          throw new Error("Scoring questions require the demonstrated win");
        }
        this.stepIndex = validSaved.step;
        this.counters = { ...validSaved.counters };
        const step = this.steps[this.stepIndex];
        this.found = step?.kind === "drill"
          ? validSaved.found.filter((index) => step.targets.includes(index)) : [];
        if (this.stepIndex >= this.steps.length) this.done = true;
      } catch {
        // A current-engine or legal-action mismatch restarts only this lesson.
        // Previously completed modules remain in the separate progress record.
        this.scene = null;
        this.stepIndex = 0;
        this.note = "This saved lesson could not be resumed. The lesson has restarted.";
      }
    }
    if (!this.scene && SCENE_MODULES.has(moduleId)) {
      const firstScene = this.steps.find((s) => s.kind === "scene");
      if (firstScene && firstScene.kind === "scene") {
        this.scene = new LessonScene(firstScene.seed);
      }
    }
    this.enterStep();
    // A lesson resumed from saved progress can only go back as far
    // as this entry point — earlier step-entry states were never
    // recorded, so Back stays unavailable until the next advance.
    if (!this.done) this.recordSnapshot();
  }

  get step(): StepDef | null {
    return this.steps[this.stepIndex] ?? null;
  }

  get usesTable(): boolean {
    return SCENE_MODULES.has(this.moduleId);
  }

  /** Run the current step's enter hook (scene auto-advance). */
  private enterStep(): void {
    const step = this.step;
    if (!step) {
      this.done = true;
      return;
    }
    if (step.kind === "scene") {
      if (!this.scene || this.scene.seed !== step.seed) {
        this.scene = new LessonScene(step.seed);
      }
      step.enter?.(this);
    }
  }

  private advance(): void {
    this.stepIndex++;
    this.found = [];
    this.note = null;
    this.choiceConfirmed = false;
    if (this.stepIndex >= this.steps.length) {
      this.done = true;
      return;
    }
    this.enterStep();
    this.recordSnapshot();
  }

  /** Capture the current step's entry state for a later Back. */
  private recordSnapshot(): void {
    this.snapshots.set(this.stepIndex, {
      scene: this.scene
        ? {
            seed: this.scene.seed,
            length: this.scene.length,
            decisions: [...this.scene.decisions],
          }
        : null,
      counters: { ...this.counters },
    });
  }

  /** Whether Back can leave the current step. */
  get canBack(): boolean {
    return !this.done && this.stepIndex > 0 && this.snapshots.has(this.stepIndex - 1);
  }

  /**
   * Return to the previous step's entry state: drills come back
   * un-answered, scene steps replay to the decision log as it stood
   * when the step was entered. Snapshots past the target are
   * discarded, so redoing the step records a fresh entry state and
   * the saved decision log never grows duplicates.
   */
  goBack(): void {
    if (!this.canBack) return;
    const target = this.stepIndex - 1;
    const snap = this.snapshots.get(target)!;
    for (const key of [...this.snapshots.keys()]) {
      if (key > target) this.snapshots.delete(key);
    }
    this.stepIndex = target;
    this.counters = { ...snap.counters };
    this.found = [];
    this.note = null;
    this.choiceConfirmed = false;
    this.scene = snap.scene
      ? LessonScene.restore(snap.scene.seed, snap.scene.decisions, snap.scene.length)
      : null;
    // No enterStep(): the snapshot was taken after the enter hook
    // ran, and replay reproduces its stop exactly.
  }

  // -- scene driving helpers (used by the step definitions) -----------

  /** Auto-play the scene until the stop satisfies `pred`. */
  autoTo(pred: (s: SceneStop) => boolean, cap = 200): void {
    let guard = 0;
    while (this.scene && guard++ < cap) {
      const stop = this.scene.stop;
      if (!stop || stop.kind === "gameEnd" || pred(stop)) return;
      this.scene.auto();
    }
  }

  /** Auto-play call windows until a turn decision is pending. */
  autoToTurn(): void {
    this.autoTo((s) => s.kind === "turn");
  }

  // -- TU-8 quiz facts, read off the real win event --------------------

  private winEvent(): GameEvent | null {
    return this.scene ? lastWinEvent(this.scene.events) : null;
  }

  winHan(): number {
    const event = this.winEvent();
    if (!event) throw new Error("No recorded win for this scoring question");
    return Number(event["han"]);
  }

  winFu(): number {
    const event = this.winEvent();
    if (!event) throw new Error("No recorded win for this scoring question");
    return Number(event["fu"]);
  }

  winGained(): number {
    const ev = this.winEvent();
    if (!ev) throw new Error("No recorded win for this scoring question");
    const payments = (ev["payments"] as readonly { amount: number }[] | undefined) ?? [];
    return (
      payments.reduce((sum, p) => sum + p.amount, 0) +
      Number(ev["stickPoints"] ?? 0)
    );
  }

  /**
   * TU-8's worked breakdown (PR E item 5): the seeded win counted
   * out in full — every yaku line, the dora line, the han total,
   * the fu, the payments, and the riichi stake coming back — read
   * off the real win event, so the numbers the questions ask for
   * are the numbers this step shows.
   */
  winBreakdown(): string {
    const ev = this.winEvent();
    if (!ev) throw new Error("No recorded win for the score breakdown");
    const glosses: Record<string, string> = {
      riichi: "Riichi — the declaration made with a discard in this hand",
      ippatsu: "Ippatsu — winning within one turn of declaring riichi",
      "menzen-tsumo": "Menzen tsumo — winning on your own draw with a closed hand",
      chiitoitsu: "Chiitoitsu — seven pairs",
      pinfu: "Pinfu — an all-sequence closed hand",
      tanyao: "Tanyao — every tile a simple",
    };
    const details = (ev["yakuDetails"] as readonly { id: string; name: string; han: number }[] | undefined) ?? [];
    const lines = details.map((y) => `${glosses[y.id] ?? y.name} — ${y.han} han.`);
    const dora = Number(ev["dora"] ?? 0);
    if (dora > 0) lines.push(`Dora — ${dora} han: each dora in the hand adds 1 han.`);
    const han = Number(ev["han"]);
    const fu = Number(ev["fu"]);
    const fuLine = details.some((y) => y.id === "chiitoitsu")
      ? `The fu are ${fu}: a seven-pairs hand is always counted as ${fu} fu.`
      : `The hand's shape — its sets, its pair, its wait, and how it was won — gives ${fu} fu.`;
    // Was the winner the dealer of the hand this win ended?
    const events = this.scene?.events ?? [];
    const winIndex = events.lastIndexOf(ev);
    let dealerLine = "";
    for (let i = winIndex - 1; i >= 0; i--) {
      if (events[i]!.type === "hand-start") {
        if (Number(events[i]!["dealer"]) === Number(ev["seat"])) {
          dealerLine = "You sat in the East seat for this hand, so the win pays the higher rate for that seat — the steps after these questions explain that rate. ";
        }
        break;
      }
    }
    const payments = (ev["payments"] as readonly { amount: number }[] | undefined) ?? [];
    const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsLine =
      ev["winType"] === "tsumo" && payments.length === 3 && payments.every((p) => p.amount === payments[0]!.amount)
        ? `On a tsumo win every opponent pays: each of the three paid you ${payments[0]!.amount.toLocaleString("en-US")} points, ${paidTotal.toLocaleString("en-US")} in all.`
        : ev["winType"] === "tsumo"
          ? `On a tsumo win every opponent pays: the three payments add to ${paidTotal.toLocaleString("en-US")} points.`
          : `The player who discarded the winning tile paid you ${paidTotal.toLocaleString("en-US")} points.`;
    const sticks = Number(ev["stickPoints"] ?? 0);
    const stakeLine =
      sticks === 1000
        ? "Your 1,000-point riichi stake came back to you on top of the payments."
        : sticks > 0
          ? `${sticks.toLocaleString("en-US")} points of riichi stakes sitting on the table came to you on top of the payments.`
          : "";
    return `Here is that win, counted out in full. ${lines.join(" ")} That makes ${han} han in all. ${fuLine} ${dealerLine}${paymentsLine}${stakeLine ? ` ${stakeLine}` : ""} You gained ${this.winGained().toLocaleString("en-US")} points in all. The table has already set up the next hand, so count from this breakdown rather than from the tiles in front of you — the questions that follow ask for these same numbers.`;
  }

  // -- view -------------------------------------------------------------

  view(): LessonView {
    const step = this.step;
    const base = {
      lab: this.def.title.toUpperCase(),
      note: this.note,
      stepIndex: Math.min(this.stepIndex, this.steps.length - 1),
      stepCount: this.steps.length,
      canBack: this.canBack,
      usesTable: this.usesTable,
      done: this.done,
    };
    if (this.done || !step) {
      return {
        ...base,
        text: "",
        strip: null,
        drill: null,
        choices: null,
        buttons: [],
        highlightRiichi: false,
        acceptsTiles: false,
      };
    }
    switch (step.kind) {
      case "info":
        return {
          ...base,
          text: typeof step.text === "function" ? step.text(this) : step.text,
          strip: step.strip ?? null,
          drill: null,
          choices: null,
          buttons: this.canBack ? [BACK, CONTINUE] : [CONTINUE],
          highlightRiichi: false,
          acceptsTiles: false,
        };
      case "drill": {
        const remaining = step.targets.length - this.found.length;
        return {
          ...base,
          text: step.text,
          strip: null,
          drill: { tiles: step.tiles, found: [...this.found] },
          choices: null,
          buttons: this.canBack ? [BACK] : [],
          highlightRiichi: false,
          acceptsTiles: false,
          note:
            this.note ??
            (this.found.length > 0
              ? `${this.found.length} of ${step.targets.length} found`
              : null),
        };
      }
      case "choice":
        if (this.choiceConfirmed) {
          return {
            ...base,
            text: typeof step.text === "function" ? step.text(this) : step.text,
            strip: step.strip ?? null,
            drill: null,
            choices: null,
            buttons: this.canBack ? [BACK, CONTINUE] : [CONTINUE],
            highlightRiichi: false,
            acceptsTiles: false,
          };
        }
        return {
          ...base,
          text: typeof step.text === "function" ? step.text(this) : step.text,
          strip: step.strip ?? null,
          drill: null,
          choices:
            typeof step.options === "function" ? step.options(this) : step.options,
          buttons: this.canBack ? [BACK] : [],
          highlightRiichi: false,
          acceptsTiles: false,
        };
      case "scene": {
        const stepButtons = step.buttons?.(this) ?? [];
        return {
          ...base,
          text: typeof step.text === "function" ? step.text(this) : step.text,
          strip: null,
          drill: null,
          choices: null,
          buttons: this.canBack ? [BACK, ...stepButtons] : stepButtons,
          highlightRiichi: step.highlightRiichi ?? false,
          acceptsTiles: step.acceptsTiles ?? false,
        };
      }
    }
  }

  // -- input --------------------------------------------------------------

  handle(action: LessonAction): void {
    if (this.done) return;
    // Back is the runner's own navigation, never a step gate: it is
    // intercepted before any step sees the action.
    if (action.kind === "back" || (action.kind === "button" && action.id === "back")) {
      this.goBack();
      return;
    }
    const step = this.step;
    if (!step) return;
    switch (step.kind) {
      case "info": {
        if (action.kind === "continue" || (action.kind === "button" && action.id === "continue")) {
          this.advance();
        }
        return;
      }
      case "drill": {
        if (action.kind !== "drill") return;
        if (this.found.includes(action.index)) return;
        if (step.targets.includes(action.index)) {
          this.found = [...this.found, action.index];
          this.note = null;
          if (this.found.length >= step.targets.length) this.advance();
        } else {
          this.note = step.wrongNote;
        }
        return;
      }
      case "choice": {
        if (this.choiceConfirmed) {
          if (action.kind === "continue" || (action.kind === "button" && action.id === "continue")) {
            this.advance();
          }
          return;
        }
        if (action.kind !== "choice") return;
        const correct =
          typeof step.correct === "function" ? step.correct(this) : step.correct;
        if (action.index === correct) {
          if (step.correctNote) {
            this.choiceConfirmed = true;
            this.note = step.correctNote;
          } else {
            this.advance();
          }
        } else {
          this.note =
            typeof step.wrongNote === "function"
              ? step.wrongNote(this, action.index)
              : step.wrongNote;
        }
        return;
      }
      case "scene": {
        if (step.gate(this, action)) this.advance();
        return;
      }
    }
  }

  serialize(): SavedLessonState {
    return {
      module: this.moduleId,
      moduleVersion: this.def.version,
      step: this.stepIndex,
      scene: this.scene
        ? { seed: this.scene.seed, decisions: [...this.scene.decisions] }
        : null,
      counters: { ...this.counters },
      found: [...this.found],
    };
  }
}

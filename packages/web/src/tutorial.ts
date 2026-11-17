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
      readonly text: string;
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
        { kind: "info", text: "There are 34 kinds of tile, with 4 copies of each — 136 tiles in the wall." },
        { kind: "info", text: "Three suits — characters, dots, and bamboo — are numbered 1 to 9.", strip: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
        { kind: "drill", text: "Tap the bamboo tiles.", tiles: [2, 15, 19, 8, 22, 27, 21, 9, 25, 20, 31, 5], targets: [2, 4, 6, 8, 9], wrongNote: "Not that one — bamboo tiles are the green sticks." },
        { kind: "drill", text: "Tap the dot tiles.", tiles: [10, 4, 16, 20, 14, 30, 17, 3, 24, 0, 1, 32], targets: [0, 2, 4, 6], wrongNote: "Not that one — dot tiles are the circles." },
        { kind: "info", text: "Winds and dragons are honors. Honors have no numbers and never form sequences.", strip: [27, 28, 29, 30, 31, 32, 33] },
        { kind: "drill", text: "Tap the honor tiles.", tiles: [27, 3, 28, 15, 29, 19, 33, 23, 8, 11, 7, 22], targets: [0, 2, 4, 6], wrongNote: "Not that one — honors are the winds and dragons." },
        { kind: "drill", text: "Tap the terminal tiles — the 1s and 9s.", tiles: [0, 13, 26, 2, 8, 24, 9, 21, 5, 10, 25, 27], targets: [0, 2, 4, 6], wrongNote: "Not that one — terminals are only the 1 and the 9 of a suit." },
        { kind: "info", text: "Tiles 2 to 8 are simples. One 5 in each suit is red — a red five is a bonus dora, worth extra when you win with it." },
      ];
    case "tu2":
      return [
        { kind: "info", text: "The standard complete shape is four sets and a pair — 14 tiles before any extra tiles for kans. Winning also requires a yaku, explained in Ways to win.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
        { kind: "info", text: "A set is a sequence in one suit (3-4-5), a triplet of the same tile, or a declared four-tile kan.", strip: [11, 12, 13, 26, 26, 26] },
        {
          kind: "choice",
          text: "Which of these is a set?",
          options: [
            { label: "3 · 4 · 5 of dots", tiles: [11, 12, 13] },
            { label: "3 · 5 · 7 of dots", tiles: [11, 13, 15] },
            { label: "9 · 9 of characters", tiles: [8, 8] },
          ],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "Those skip a number — a sequence is three in a row."
              : "That is a pair. A hand needs exactly one pair, plus four sets.",
        },
        {
          kind: "choice",
          text: "Which hand is complete?",
          options: [
            { label: "Four sets and a pair", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
            { label: "Four sets and a single", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13] },
            { label: "Five sets, no pair", tiles: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 4, 5, 6] },
          ],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "That is 13 tiles — one short. A complete hand has 14."
              : "Five sets leave no pair. The shape is four sets and a pair.",
        },
        { kind: "info", text: "Two special shapes also win: seven different pairs, and thirteen orphans (one of every terminal and honor, plus a pair). The standard shape comes first — it is most hands you will ever hold." },
      ];
    case "tu3":
      return [
        { kind: "info", text: "Your hand is at the bottom. On your turn you draw one tile, then discard one tile." },
        {
          kind: "scene",
          seed: "om-tu3",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "turn" && stop.ctx.drawnTile) {
              return `You drew the ${tileName(stop.ctx.drawnTile.type)}. Discard one tile.`;
            }
            return "Discard one tile.";
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
        { kind: "info", text: "Draw, discard, repeat — that is the whole turn. The tiles you discard form your pond, face up in front of you." },
      ];
    case "tu4":
      return [
        { kind: "info", text: "Calling claims another player's discard to finish a set. The set is placed face up — and your hand is open from then on." },
        {
          kind: "scene",
          seed: "om-tu4chi-5",
          text: "Watch the discards. A tile you can use is coming.",
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
        { kind: "info", text: "Chi takes a discard only from the player on your left, and only to finish a sequence. The called tile turns sideways in your new set." },
        {
          kind: "scene",
          seed: "om-tu4pon-24",
          text: "Watch the discards. A tile you can use is coming.",
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
        { kind: "info", text: "Pon takes any player's discard to finish a triplet. It is faster than drawing the third tile yourself — and it opens your hand." },
        {
          kind: "scene",
          seed: "om-tu4kan-29",
          text: "Watch the discards. A tile you can use is coming.",
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
        { kind: "info", text: "Kan is four of a kind: take a replacement draw and reveal another dora indicator. Chi, pon, and open kan open the hand; a concealed kan keeps it closed. Opening prevents riichi and can change the hand's yaku or value." },
      ];
    case "tu5":
      return [
        { kind: "info", text: "A hand one tile away from a complete shape is ready — tenpai. Its completing tiles are waits. A legal win still needs a yaku, and ron has furiten restrictions." },
        {
          kind: "scene",
          seed: "om-tu5a-99",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "turn" && stop.ctx.canTsumo) {
              return "You drew a winning tile. Declare tsumo.";
            }
            return "Your hand is ready. Watch what you draw.";
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
        { kind: "info", text: "Tsumo — you drew the winning tile yourself. Every other player pays you." },
        {
          kind: "scene",
          seed: "om-tu5b-4",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "call") {
              const waits = waitNames(stop.view);
              return `You are ready, waiting on ${joinTileNames(waits)}. A winning tile was just discarded.`;
            }
            return "You are ready. Watch the discards.";
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
        { kind: "info", text: "Ron — you won on another player's discard. Only the player who discarded pays." },
      ];
    case "tu6":
      return [
        { kind: "info", text: "Riichi declares your closed hand ready. In OpenMahjong you need at least 1,000 points and four tiles left in the live wall. Pay a 1,000-point stake when you declare." },
        {
          kind: "scene",
          seed: "om-tu6-1420",
          text: "Discard the tile that keeps you ready, and declare riichi with it.",
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
            c.note = "That discard leaves you more than one tile from ready — riichi needs a ready hand.";
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
            const ended = evs.slice(from).some((ev) => ev.type === "hand-end");
            if (won) return "You won the hand. The 1,000 points come back to you with the winnings.";
            if (ended) return "The hand ended without your win. The next winner collects the riichi sticks; a drawn hand carries them forward.";
            return "After riichi, discard what you draw unless you win or declare a permitted concealed kan. That kan must preserve the waits and hand structure.";
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
        { kind: "info", text: "A complete hand still needs a yaku — a scoring pattern — to win. Dora add bonus han but are not a yaku. These are the beginner patterns.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 26, 13, 13] },
        { kind: "info", text: "Riichi — 1 han. Declare ready on a closed hand. The declaration supplies a yaku; you must still obey winning rules, including furiten for ron.", strip: [1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 13, 13] },
        { kind: "info", text: "Tanyao — 1 han. All simples: no terminals and no honors anywhere in the hand.", strip: [2, 3, 4, 12, 13, 14, 21, 22, 23, 20, 20, 20, 5, 5] },
        { kind: "info", text: "Yakuhai — 1 han for a triplet or kan of dragons, of the round wind, or of your own seat wind. A wind that is both round and seat scores twice.", strip: [33, 33, 33, 1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13] },
        {
          kind: "choice",
          text: "Which yaku does this hand have?",
          strip: [33, 33, 33, 1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13],
          options: [{ label: "Yakuhai" }, { label: "Tanyao" }, { label: "Riichi" }],
          correct: 0,
          wrongNote: (_c, i) =>
            i === 1
              ? "The red dragons are honors — tanyao allows none."
              : "Riichi is a declaration, not a shape. The built-in yaku here is the dragon triplet.",
        },
        {
          kind: "choice",
          text: "Which yaku does this hand have?",
          strip: [2, 3, 4, 13, 13, 13, 20, 21, 22, 23, 24, 25, 1, 1],
          options: [{ label: "Pinfu" }, { label: "Tanyao" }, { label: "Yakuhai" }],
          correct: 1,
          wrongNote: (_c, i) =>
            i === 0
              ? "Pinfu is all sequences — this hand has a triplet of 5 of dots."
              : "No dragon or wind triplet here. Every tile is a simple: tanyao.",
        },
        { kind: "info", text: "Pinfu — 1 han, closed only. All sequences, a pair that is not dragons or a scoring wind, and a two-sided wait.", strip: [1, 2, 3, 12, 13, 14, 21, 22, 23, 24, 25, 26, 19, 19] },
        { kind: "info", text: "Toitoi — 2 han. Four triplets or kans and a pair; sequences not allowed.", strip: [2, 2, 2, 13, 13, 13, 22, 22, 22, 31, 31, 31, 7, 7] },
        { kind: "info", text: "Chiitoitsu — 2 han, closed only. Seven different pairs instead of the standard shape; four identical tiles do not count as two pairs.", strip: [1, 1, 4, 4, 11, 11, 15, 15, 20, 20, 24, 24, 28, 28] },
      ];
    case "tu8":
      return [
        { kind: "info", text: "Points come from two numbers: han, from your yaku and dora, and fu, minipoints from the hand's shape. Each han roughly doubles the hand's value." },
        {
          kind: "scene",
          seed: "om-tu5a-261",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind === "turn" && stop.ctx.canTsumo) {
              return "You drew a winning tile. Declare tsumo, and watch what it pays.";
            }
            return "Watch your hand — a winning draw is coming.";
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
          kind: "choice",
          text: "How many han was your hand?",
          options: (c) => {
            const han = c.winHan();
            return distinctQuizValues(han, 1, 1).map((v) => ({ label: `${v} han` }));
          },
          correct: 1,
          wrongNote: "Count again from the winning hand: each yaku gives han, and dora add more.",
        },
        {
          kind: "choice",
          text: "How many fu — minipoints — did it have?",
          options: (c) => {
            const fu = c.winFu();
            return distinctQuizValues(fu, 10, 0).map((v) => ({ label: `${v} fu` }));
          },
          correct: 1,
          wrongNote: "Fu come from the shape: triplets, the pair, the wait, and how the hand was won.",
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
          wrongNote: "Add up the payments on the win: a tsumo collects from all three opponents.",
        },
        { kind: "info", text: "Dealer wins usually pay more at the same han and fu. For a dealer tsumo, all three opponents pay the dealer rate. Payments round up to the next 100 points." },
        { kind: "info", text: "An East-only game runs East 1 to East 4. East/South continues through South 4. Dealers can repeat on a win or a tenpai draw. OpenMahjong ends a game early if a score falls below zero." },
      ];
    case "tu9":
      return [
        { kind: "info", text: "Dealing into a ready hand — ron — is how points are lost. When another player declares riichi, defense starts: some of your tiles are provably safe." },
        {
          kind: "scene",
          seed: "om-tu9-2",
          text: (c) => {
            const stop = c.scene?.stop;
            if (stop?.kind !== "turn") return "Watch the table — a riichi is coming.";
            const threat = stop.view.players.find((p) => p.seat !== 0 && p.riichi);
            if (!threat) return "Watch the table — a riichi is coming.";
            const wind = WIND_WORD[threat.seatWind] ?? "";
            const base = `${wind} has declared riichi. Discard a tile from ${wind}'s pond — ${wind} cannot ron that tile, though another opponent might.`;
            if ((c.counters["misses"] ?? 0) >= 2) {
              const pond = new Set(threat.discards.map((d) => d.tile.type));
              const safe = [...new Set(stop.view.hand.map((t) => t.type))]
                .filter((ty) => pond.has(ty))
                .map((ty) => tileName(ty as TileType));
              return `${base} Safe in your hand: ${safe.join(", ")}.`;
            }
            return base;
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
        { kind: "info", text: "Tiles the riichi player has discarded are genbutsu — safe against that player's ron because of furiten. They may still be dangerous against others, and a furiten player can still tsumo. Folding can mean breaking your own hand; whether to fold depends on the position." },
      ];
    case "tu10":
      return [
        { kind: "info", text: "American mahjong is a different game played with a similar tile set. This lesson is the differences only — the American variant is not out yet." },
        { kind: "info", text: "No jokers. American sets include joker tiles that stand for other tiles; here every tile is itself, and the wall is 136 tiles." },
        { kind: "info", text: "No Charleston. American play starts by passing tiles between players; here you are dealt 13 tiles and the hand begins." },
        { kind: "info", text: "No annual card. American hands come from a card of set patterns published each year. Here, any hand with the winning shape and a yaku scores — the patterns are the yaku you have already learned." },
        {
          kind: "choice",
          text: "What takes the place of the annual card here?",
          options: [
            { label: "A different card each season" },
            { label: "Scoring patterns — yaku — built from any tiles" },
            { label: "Jokers" },
          ],
          correct: 1,
          wrongNote: "There is no card at all. The yaku are the patterns, and they do not change.",
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
          text: step.text,
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
        if (action.kind !== "choice") return;
        const correct =
          typeof step.correct === "function" ? step.correct(this) : step.correct;
        if (action.index === correct) {
          this.advance();
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

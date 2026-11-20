/** Analyze — two-scope post-game analysis (brief-analyze-v1, eval basis
 * D as ruled Nov 20, 2026). No UI, no second evaluator: grading calls
 * the shipped coach evaluators (the CPU policy's decision pipeline
 * opened up) on every seat's reconstructed position, exactly as the
 * design pass's staging script did for the staged game om-analyze-1.
 *
 * Eval basis D: per-move quality is the coach's raw chosen-vs-best gap
 * (shanten / unseen improving copies); the match spine is the score
 * trajectory. No win probability, no combined score.
 *
 * Taxonomy (design notes §4, grounded in the shipped evaluators):
 *  discard: best | better-shanten | equivalent | minor-miss | miss |
 *    blunder, from compareDiscards() — correct = best + equivalent +
 *    better-shanten; a miss for accuracy = minor-miss + miss + blunder.
 *  call / kan / riichi / win moments: best | miss | blunder per the
 *    moment rules in the design's data inventory.
 *  accuracy = correct / graded. One turn can carry two grades
 *  (discard + riichi, discard + win), so graded > decisions.
 *
 * Grades are outcome-blind: evaluators see only the view and context
 * of the decision itself. Scope is engine-v2 riichi — the shipped
 * evaluators return no grade for legacy (v1) or variant (v3) games,
 * and an incomplete archive is reported, never fabricated over. */
import {
  Game, buildTileSet, LIVE_WALL_SIZE,
  type CallAction, type CallContext, type GameEvent, type GameResult,
  type PlayerView, type Policy, type Seat, type SettlementEntry,
  type TileType,
  type TurnAction, type TurnContext, type Wall,
} from "@openmahjong/engine";
import { countsOfTiles, shantenFast } from "@openmahjong/ai";
import {
  adviseCall, adviseDiscard, adviseKan, adviseRiichi, adviseWin, compareDiscards,
  tileName as coachTileName,
  type TileRef,
} from "@openmahjong/coach";
import { validateSavedGame } from "./replay.js";
import { BoardTimeline } from "./board-review.js";
import type { ReviewDecision } from "./review.js";
import type { ChiHint } from "./model.js";

export type GradeClass =
  | "best" | "equivalent" | "better-shanten" | "minor-miss" | "miss" | "blunder";
export type GradeKind = "discard" | "call" | "kan" | "riichi" | "win";
export type BlunderCode =
  | "passed-ron" | "no-yaku-path" | "breaks-chiitoi" | "leader-late" | "declined-tsumo";

export interface WaitFact { readonly type: number; readonly name: string; readonly live: number }

export type GradeFact =
  | {
      readonly kind: "discard"; readonly grade: GradeClass;
      readonly tileId: number; readonly tileType: number; readonly tileName: string;
      readonly bestTileId: number; readonly bestTileType: number; readonly bestTileName: string;
      readonly shantenBefore: number | null;
      readonly shantenAfter: number; readonly bestShantenAfter: number;
      readonly shantenDifference: number;
      readonly improvingTotal: number; readonly bestImprovingTotal: number;
      readonly unseenImprovingDifference: number;
      readonly dangerDifference: number; readonly doraDiscardedDifference: number;
      readonly waits: readonly WaitFact[]; readonly bestWaits: readonly WaitFact[];
    }
  | {
      readonly kind: "call"; readonly grade: GradeClass; readonly blunder: BlunderCode | null;
      readonly tileType: number; readonly tileName: string;
      readonly chosenAction: string; readonly recommendedAction: string;
      readonly chosenChiTileIds: readonly number[] | null;
      readonly recommendedChiTileIds: readonly number[] | null;
      readonly shantenBefore: number;
      readonly chosenShantenAfter: number | null; readonly recommendedShantenAfter: number | null;
      readonly ronValue: number | null; readonly noYakuPath: boolean | null;
      readonly riichiThreat: boolean;
    }
  | {
      readonly kind: "kan"; readonly grade: GradeClass; readonly blunder: BlunderCode | null;
      readonly chosenAction: string; readonly chosenTileType: number; readonly chosenTileName: string;
      readonly recommended: { readonly kind: string; readonly tileType: number; readonly tileName: string } | null;
      readonly breaksChiitoi: boolean | null; readonly shantenNow: number;
    }
  | {
      readonly kind: "riichi"; readonly grade: GradeClass; readonly blunder: BlunderCode | null;
      readonly declared: boolean; readonly verdict: "declare" | "dama" | "either";
      readonly reasons: readonly string[];
      readonly tileId: number; readonly tileType: number; readonly tileName: string;
      readonly waits: readonly WaitFact[]; readonly liveTotal: number; readonly twoSided: boolean;
      readonly damaRon: number | null; readonly riichiRon: number | null;
      readonly placement: number; readonly behindLeader: number;
      readonly leadOverSecond: number; readonly lateGame: boolean;
    }
  | {
      readonly kind: "win"; readonly grade: GradeClass; readonly blunder: BlunderCode | null;
      readonly took: boolean; readonly verdict: "take" | "decline-defensible";
      readonly value: number; readonly valueHan: number; readonly valueYaku: readonly string[];
      readonly ceiling: number | null; readonly declineLive: number; readonly turnsRemaining: number;
    };

export interface GradedDecision {
  readonly position: ReviewDecision;
  readonly grades: readonly GradeFact[];
}

export interface KindTally {
  readonly total: number; readonly correct: number;
  readonly best: number; readonly equivalent: number; readonly betterShanten: number;
  readonly minorMiss: number; readonly miss: number; readonly blunder: number;
}

export interface SeatHandStats {
  readonly hands: number; readonly riichi: number; readonly dealIns: number;
  readonly handsWon: number; readonly winPoints: number;
  readonly tenpaiDraws: number; readonly exhaustiveDraws: number;
}

export interface SeatAnalysis {
  readonly seat: Seat;
  readonly decisions: number; readonly graded: number; readonly correct: number;
  readonly misses: number; readonly blunders: number;
  readonly accuracy: number | null;
  readonly byKind: Readonly<Record<GradeKind, KindTally>>;
  readonly avgShantenAfter: number | null; readonly avgImprovingTotal: number | null;
  readonly handStats: SeatHandStats;
}

export interface AnalyzeHandResultWin {
  readonly outcome: "win"; readonly winner: number; readonly winType: string;
  readonly fromSeat: number | null; readonly han: number; readonly fu: number;
  readonly yakumanMultiple: number; readonly yaku: readonly string[]; readonly points: number;
}
export interface AnalyzeHandResultDraw {
  readonly outcome: "drawn-hand"; readonly kind: string; readonly tenpai: readonly number[];
}
export interface AnalyzeHand {
  readonly index: number; readonly roundWind: number; readonly kyoku: number;
  readonly honba: number; readonly dealer: number;
  readonly startScores: readonly number[]; readonly endScores: readonly number[];
  readonly scoreDelta: readonly number[];
  readonly result: AnalyzeHandResultWin | AnalyzeHandResultDraw | null;
  readonly eventStart: number; readonly eventEnd: number;
}

export interface AnalyzeMoment {
  readonly eventIndex: number; readonly handIndex: number;
  readonly kind: "win" | "riichi" | "kan"; readonly seat: number;
  readonly winType?: string; readonly fromSeat?: number | null;
  readonly han?: number; readonly fu?: number; readonly yakumanMultiple?: number;
  readonly yaku?: readonly string[]; readonly points?: number;
  readonly double?: boolean; readonly kanKind?: string;
}

export interface AnalyzeSwing {
  readonly handIndex: number; readonly seat: number; readonly delta: number;
  readonly scoreDelta: readonly number[];
}

export interface AnalyzeData {
  readonly available: true;
  readonly timeline: BoardTimeline;
  readonly humanSeat: Seat;
  readonly seed: string;
  readonly length: "east" | "south";
  readonly decisions: readonly GradedDecision[];
  readonly totalDecisions: number; readonly totalGrades: number;
  readonly seats: readonly SeatAnalysis[];
  readonly overall: {
    readonly graded: number; readonly correct: number;
    readonly misses: number; readonly blunders: number; readonly accuracy: number | null;
  };
  readonly settlement: readonly SettlementEntry[];
  readonly finals: readonly number[];
  readonly hands: readonly AnalyzeHand[];
  /** Scores at game start, then after each hand: [hand + 1][seat]. */
  readonly trajectory: readonly (readonly number[])[];
  readonly swings: readonly AnalyzeSwing[];
  readonly missesList: readonly { readonly decision: GradedDecision; readonly grade: GradeFact }[];
  readonly moments: readonly AnalyzeMoment[];
  readonly winGrades: number; readonly tsumoOffered: number;
  readonly winsTotal: number; readonly ronWins: number;
}

export type AnalyzeResult =
  | AnalyzeData
  | { readonly available: false; readonly reason: "legacy-rules" | "variant-evaluator" | "incomplete" | "invalid" };

// ---------------------------------------------------------------------------
// All-seat replay (mirrors review.ts reconstructReview; the shipped
// review captures the human seat only, Analyze grades every seat).
// ---------------------------------------------------------------------------

class EndOfRecordedPrefix {}
const TURN_TYPES = new Set(["discard", "ankan", "shouminkan", "tsumo", "kyuushu"]);

function immutableSnapshot<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

interface AnalyzeReconstruction {
  readonly positions: ReviewDecision[];
  readonly events: readonly GameEvent[];
  readonly chiHints: ReadonlyMap<number, ChiHint>;
  readonly result: GameResult;
  readonly humanSeat: Seat;
  readonly seed: string;
  readonly length: "east" | "south";
}

function reconstructAllSeats(input: unknown): AnalyzeReconstruction | { reason: "legacy-rules" | "variant-evaluator" | "incomplete" | "invalid" } {
  let saved;
  try {
    saved = validateSavedGame(input);
  } catch {
    return { reason: "invalid" };
  }
  if (saved.v === 1) return { reason: "legacy-rules" };
  if (saved.v === 3) return { reason: "variant-evaluator" };
  const positions: ReviewDecision[] = [];
  let cursor = 0;
  let scanned = 0;
  let handIndex = -1;
  let lastChi: readonly [number, number] | undefined;
  const chiHints = new Map<number, ChiHint>();
  // The policies close over `holder.game`, which is set before run().
  const holder: { game: Game | null } = { game: null };
  const scan = () => {
    const g = holder.game!;
    for (; scanned < g.events.length; scanned++) {
      const event = g.events[scanned]!;
      if (event.type === "hand-start") handIndex++;
      if (event.type === "call" && event["kind"] === "chi" && lastChi) {
        chiHints.set(event.seq, { tileIds: lastChi });
        lastChi = undefined;
      }
    }
  };
  const take = () => {
    scan();
    if (cursor === saved.decisions.length) throw new EndOfRecordedPrefix();
    return saved.decisions[cursor++]!;
  };
  const capture = (position: {
    kind: "turn" | "call"; view: PlayerView;
    context: TurnContext | CallContext; action: TurnAction | CallAction;
  }) => {
    positions.push(immutableSnapshot({
      ...position,
      decisionIndex: cursor - 1, handIndex,
      eventSequence: holder.game!.events.length - 1,
      engineVersion: 2 as const, informationMode: "player-perspective" as const,
    }) as ReviewDecision);
  };
  const policy: Policy = {
    turn(view, context) {
      const action = take();
      if (!TURN_TYPES.has(action.type)) throw new Error(`Decision log desync at ${cursor - 1}: expected turn action`);
      capture({ kind: "turn", view, context, action: action as TurnAction });
      return action as TurnAction;
    },
    call(view, context) {
      const action = take();
      if (TURN_TYPES.has(action.type)) throw new Error(`Decision log desync at ${cursor - 1}: expected call action`);
      if (action.type === "chi") lastChi = action.tileIds;
      capture({ kind: "call", view, context, action: action as CallAction });
      return action as CallAction;
    },
  };
  // Committed walls (online records, issue #106) deal exactly as the
  //  server dealt them: the engine's createWall split — live wall
  //  first, dead wall last — over the canonical tile set.
  const committedWalls: readonly Wall[] | undefined = saved.walls?.map((ids) => {
    const byId = new Map(buildTileSet().map((t) => [t.id, t]));
    const tiles = ids.map((id) => byId.get(id)!);
    return { liveWall: tiles.slice(0, LIVE_WALL_SIZE), deadWall: tiles.slice(LIVE_WALL_SIZE) };
  });
  holder.game = new Game({
    seed: saved.seed, length: saved.length, policies: [policy, policy, policy, policy],
    ...(committedWalls ? { walls: committedWalls } : {}),
  });
  let result: GameResult;
  try {
    result = holder.game.run();
  } catch (error) {
    if (error instanceof EndOfRecordedPrefix) return { reason: "incomplete" };
    throw error;
  }
  if (cursor !== saved.decisions.length) return { reason: "invalid" };
  scan();
  return {
    positions, events: immutableSnapshot(holder.game.events), chiHints,
    result, humanSeat: saved.humanSeat, seed: saved.seed, length: saved.length,
  };
}

// ---------------------------------------------------------------------------
// Grading — the design staging script's taxonomy, verbatim in logic.
// ---------------------------------------------------------------------------

function tileName(type: number): string {
  try { return coachTileName(type as TileType); } catch { return `type ${type}`; }
}

function gradeDiscard(position: ReviewDecision): GradeFact | null {
  if (position.kind !== "turn" || position.action.type !== "discard") return null;
  const advice = adviseDiscard(position.view, position.context as TurnContext);
  const chosen = advice.options.find((o) => o.tileId === (position.action as { tileId: number }).tileId);
  if (!chosen) return null;
  const comp = compareDiscards(advice, position.action.tileId, advice.recommendation.tileId);
  const counts = countsOfTiles(position.view.hand);
  let shantenBefore: number | null = null;
  try { shantenBefore = shantenFast(counts, position.view.melds.length); } catch { shantenBefore = null; }
  let grade: GradeClass;
  if (comp.observation === "same-option") grade = "best";
  else if (comp.shantenDifference < 0) grade = "better-shanten";
  else if (comp.observation === "same-efficiency" || (comp.shantenDifference === 0 && comp.unseenImprovingDifference >= 0)) grade = "equivalent";
  else if (comp.observation === "fewer-unseen-improving-copies") grade = "minor-miss";
  else if (comp.shantenDifference === 1) grade = "miss";
  else grade = "blunder";
  return {
    kind: "discard", grade,
    tileId: chosen.tileId, tileType: chosen.tileType, tileName: tileName(chosen.tileType),
    bestTileId: advice.recommendation.tileId, bestTileType: advice.recommendation.tileType,
    bestTileName: tileName(advice.recommendation.tileType),
    shantenBefore, shantenAfter: chosen.shantenAfter, bestShantenAfter: advice.recommendation.shantenAfter,
    shantenDifference: comp.shantenDifference,
    improvingTotal: chosen.improvingTotal, bestImprovingTotal: advice.recommendation.improvingTotal,
    unseenImprovingDifference: comp.unseenImprovingDifference,
    dangerDifference: comp.heuristicDangerDifference,
    doraDiscardedDifference: comp.doraDiscardedDifference,
    waits: chosen.waits.map((w: TileRef) => ({ type: w.type, name: w.name, live: w.live })),
    bestWaits: advice.recommendation.waits.map((w: TileRef) => ({ type: w.type, name: w.name, live: w.live })),
  };
}

function sameChi(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (!a || !b) return false;
  return [...a].sort().join(",") === [...b].sort().join(",");
}

function gradeCall(position: ReviewDecision): GradeFact | null {
  if (position.kind !== "call") return null;
  const advice = adviseCall(position.view, position.context as CallContext);
  const rec = advice.recommendation;
  const a = position.action as CallAction;
  let matches = false;
  if (rec.action === "ron") matches = a.type === "ron";
  else if (rec.action === "pon") matches = a.type === "pon";
  else if (rec.action === "daiminkan") matches = a.type === "daiminkan";
  else if (rec.action === "chi") matches = a.type === "chi" && sameChi(rec.chiTileIds, a.tileIds);
  else matches = a.type === "pass";
  const chosenOpt = advice.options.find((o) =>
    (o.action === "ron" && a.type === "ron") || (o.action === "pon" && a.type === "pon") ||
    (o.action === "daiminkan" && a.type === "daiminkan") ||
    (o.action === "chi" && a.type === "chi" && sameChi(o.chiTileIds, a.tileIds)) ||
    (o.action === "pass" && a.type === "pass"));
  let grade: GradeClass = "best";
  let blunder: BlunderCode | null = null;
  if (!matches) {
    if (rec.action === "ron" && a.type === "pass") { grade = "blunder"; blunder = "passed-ron"; }
    else if (chosenOpt?.noYakuPath && rec.action === "pass") { grade = "blunder"; blunder = "no-yaku-path"; }
    else grade = "miss";
  }
  return {
    kind: "call", grade, blunder,
    tileType: advice.tileType, tileName: tileName(advice.tileType),
    chosenAction: a.type, recommendedAction: rec.action,
    chosenChiTileIds: a.type === "chi" ? a.tileIds : null,
    recommendedChiTileIds: rec.chiTileIds ?? null,
    shantenBefore: advice.shantenBefore,
    chosenShantenAfter: chosenOpt?.shantenAfter ?? null,
    recommendedShantenAfter: rec.shantenAfter,
    ronValue: rec.action === "ron" ? rec.win?.points ?? null : null,
    noYakuPath: chosenOpt?.noYakuPath ?? null,
    riichiThreat: advice.riichiThreat,
  };
}

function gradeKan(position: ReviewDecision): GradeFact | null {
  if (position.kind !== "turn") return null;
  const advice = adviseKan(position.view, position.context as TurnContext);
  if (!advice) return null;
  const a = position.action as TurnAction;
  if (a.type !== "ankan" && a.type !== "shouminkan") return null;
  const rec = advice.recommended;
  const matches = rec !== null && rec.kind === a.type && rec.tileType === a.tileType;
  const chosenOpt = advice.options.find((o) => o.kind === a.type && o.tileType === a.tileType);
  let grade: GradeClass = "best";
  let blunder: BlunderCode | null = null;
  if (!matches) {
    if (chosenOpt?.breaksChiitoi) { grade = "blunder"; blunder = "breaks-chiitoi"; }
    else grade = "miss";
  }
  return {
    kind: "kan", grade, blunder,
    chosenAction: a.type, chosenTileType: a.tileType, chosenTileName: tileName(a.tileType),
    recommended: rec ? { kind: rec.kind, tileType: rec.tileType, tileName: tileName(rec.tileType) } : null,
    breaksChiitoi: chosenOpt?.breaksChiitoi ?? null,
    shantenNow: advice.shantenNow,
  };
}

function gradeRiichi(position: ReviewDecision): GradeFact | null {
  if (position.kind !== "turn" || position.action.type !== "discard") return null;
  const grade = adviseRiichi(position.view, position.context as TurnContext);
  if (!grade) return null;
  const declared = position.action.riichi === true;
  let cls: GradeClass = "best";
  let blunder: BlunderCode | null = null;
  if (grade.verdict === "declare" && !declared) cls = "miss";
  else if (grade.verdict === "dama" && declared) {
    if (grade.reasons.includes("leader-late")) { cls = "blunder"; blunder = "leader-late"; }
    else cls = "miss";
  }
  return {
    kind: "riichi", grade: cls, blunder,
    declared, verdict: grade.verdict, reasons: [...grade.reasons],
    tileId: grade.tileId, tileType: grade.tileType, tileName: tileName(grade.tileType),
    waits: grade.waits.map((w) => ({ type: w.type, name: w.name, live: w.live })),
    liveTotal: grade.liveTotal, twoSided: grade.twoSided,
    damaRon: grade.damaRon?.points ?? null, riichiRon: grade.riichiRon?.points ?? null,
    placement: grade.placement, behindLeader: grade.behindLeader,
    leadOverSecond: grade.leadOverSecond, lateGame: grade.lateGame,
  };
}

function gradeWin(position: ReviewDecision): GradeFact | null {
  if (position.kind !== "turn") return null;
  const advice = adviseWin(position.view, position.context as TurnContext);
  if (!advice) return null;
  const took = position.action.type === "tsumo";
  let grade: GradeClass = "best";
  let blunder: BlunderCode | null = null;
  if (!took) {
    grade = advice.verdict === "decline-defensible" ? "miss" : "blunder";
    if (grade === "blunder") blunder = "declined-tsumo";
  }
  return {
    kind: "win", grade, blunder,
    took, verdict: advice.verdict,
    value: advice.value.points, valueHan: advice.value.han, valueYaku: [...advice.value.yaku],
    ceiling: advice.ceiling?.points ?? null, declineLive: advice.declineLive,
    turnsRemaining: advice.turnsRemaining,
  };
}

function gradePosition(position: ReviewDecision): GradeFact[] {
  const grades: GradeFact[] = [];
  const push = (fact: GradeFact | null) => { if (fact) grades.push(fact); };
  try {
    if (position.kind === "call") {
      push(gradeCall(position));
    } else if (position.action.type === "discard") {
      push(gradeDiscard(position));
      const ctx = position.context as TurnContext;
      if (ctx.riichiDiscardIds.length > 0) push(gradeRiichi(position));
      if (ctx.canTsumo) push(gradeWin(position));
    } else if (position.action.type === "ankan" || position.action.type === "shouminkan") {
      push(gradeKan(position));
    } else if (position.action.type === "tsumo") {
      push(gradeWin(position));
    }
  } catch {
    return grades;
  }
  return grades;
}

// ---------------------------------------------------------------------------
// Aggregation (mirrors the staging script's folds)
// ---------------------------------------------------------------------------

const GRADE_KINDS: readonly GradeKind[] = ["discard", "call", "kan", "riichi", "win"];
const CORRECT: ReadonlySet<GradeClass> = new Set(["best", "equivalent", "better-shanten"]);

function emptyTally(): KindTally {
  return { total: 0, correct: 0, best: 0, equivalent: 0, betterShanten: 0, minorMiss: 0, miss: 0, blunder: 0 };
}

function aggregateSeat(seat: number, decisions: readonly GradedDecision[], events: readonly GameEvent[], handsPlayed: number): SeatAnalysis {
  const mine = decisions.filter((d) => d.position.view.seat === seat);
  const flat = mine.flatMap((d) => d.grades);
  const byKind = {} as Record<GradeKind, KindTally>;
  for (const kind of GRADE_KINDS) {
    const of = flat.filter((g) => g.kind === kind);
    const count = (cls: GradeClass) => of.filter((g) => g.grade === cls).length;
    byKind[kind] = {
      total: of.length,
      correct: of.filter((g) => CORRECT.has(g.grade)).length,
      best: count("best"), equivalent: count("equivalent"), betterShanten: count("better-shanten"),
      minorMiss: count("minor-miss"), miss: count("miss"), blunder: count("blunder"),
    };
  }
  const correct = flat.filter((g) => CORRECT.has(g.grade)).length;
  const discards = flat.filter((g): g is Extract<GradeFact, { kind: "discard" }> => g.kind === "discard");
  let riichi = 0, dealIns = 0, handsWon = 0, winPoints = 0, tenpaiDraws = 0, exhaustiveDraws = 0;
  for (const e of events) {
    if (e.type === "riichi" && e["seat"] === seat) riichi++;
    if (e.type === "win") {
      if (e["winType"] === "ron" && e["fromSeat"] === seat) dealIns++;
      if (e["seat"] === seat) {
        handsWon++;
        const payments = (e["payments"] as readonly { amount: number }[] | undefined) ?? [];
        winPoints += payments.reduce((s, p) => s + p.amount, 0) + Number(e["stickPoints"] ?? 0);
      }
    }
    if (e.type === "drawn-hand" && e["kind"] === "exhaustive") {
      exhaustiveDraws++;
      if (((e["tenpai"] as readonly number[] | undefined) ?? []).includes(seat)) tenpaiDraws++;
    }
  }
  return {
    seat: seat as Seat,
    decisions: mine.length, graded: flat.length, correct,
    misses: flat.filter((g) => g.grade === "minor-miss" || g.grade === "miss").length,
    blunders: flat.filter((g) => g.grade === "blunder").length,
    accuracy: flat.length ? Math.round((1000 * correct) / flat.length) / 10 : null,
    byKind,
    avgShantenAfter: discards.length ? Math.round((discards.reduce((s, g) => s + g.shantenAfter, 0) / discards.length) * 100) / 100 : null,
    avgImprovingTotal: discards.length ? Math.round((discards.reduce((s, g) => s + g.improvingTotal, 0) / discards.length) * 10) / 10 : null,
    handStats: { hands: handsPlayed, riichi, dealIns, handsWon, winPoints, tenpaiDraws, exhaustiveDraws },
  };
}

function foldHands(events: readonly GameEvent[], finalScores: readonly number[]): AnalyzeHand[] {
  interface MutableHand {
    index: number; roundWind: number; kyoku: number; honba: number; dealer: number;
    startScores: number[]; result: AnalyzeHand["result"]; eventStart: number; eventEnd: number;
  }
  const partials: MutableHand[] = [];
  let cur: MutableHand | null = null;
  const running = [25000, 25000, 25000, 25000];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === "hand-start") {
      cur = {
        index: partials.length, roundWind: Number(e["roundWind"]), kyoku: Number(e["kyoku"]),
        honba: Number(e["honba"]), dealer: Number(e["dealer"]),
        startScores: [...running], result: null, eventStart: i, eventEnd: i,
      };
      partials.push(cur);
    } else if (e.type === "score") {
      const seat = Number(e["seat"]);
      running[seat] = (running[seat] ?? 0) + Number(e["delta"]);
    } else if (e.type === "win" && cur) {
      const payments = (e["payments"] as readonly { amount: number }[] | undefined) ?? [];
      const total = payments.reduce((s, p) => s + p.amount, 0) + Number(e["stickPoints"] ?? 0);
      cur.result = {
        outcome: "win", winner: Number(e["seat"]), winType: String(e["winType"]),
        fromSeat: e["fromSeat"] === undefined ? null : Number(e["fromSeat"]),
        han: Number(e["han"] ?? 0), fu: Number(e["fu"] ?? 0),
        yakumanMultiple: Number(e["yakumanMultiple"] ?? 0),
        yaku: [...((e["yaku"] as readonly string[] | undefined) ?? [])],
        points: total,
      };
    } else if (e.type === "drawn-hand" && cur) {
      cur.result = {
        outcome: "drawn-hand", kind: String(e["kind"]),
        tenpai: [...((e["tenpai"] as readonly number[] | undefined) ?? [])],
      };
    } else if (e.type === "hand-end" && cur) {
      cur.eventEnd = i;
    }
  }
  return partials.map((hand, i) => {
    const endScores = i + 1 < partials.length ? [...partials[i + 1]!.startScores] : [...finalScores];
    return {
      index: hand.index, roundWind: hand.roundWind, kyoku: hand.kyoku, honba: hand.honba,
      dealer: hand.dealer, startScores: hand.startScores, result: hand.result,
      eventStart: hand.eventStart,
      endScores,
      scoreDelta: endScores.map((s, j) => s - hand.startScores[j]!),
      eventEnd: hand.eventEnd || (i + 1 < partials.length ? partials[i + 1]!.eventStart - 1 : events.length - 1),
    };
  });
}

function foldMoments(events: readonly GameEvent[], hands: readonly AnalyzeHand[]): AnalyzeMoment[] {
  const moments: AnalyzeMoment[] = [];
  const handAt = (eventIndex: number): number => {
    let found = 0;
    for (const hand of hands) if (eventIndex >= hand.eventStart) found = hand.index;
    return found;
  };
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === "win") {
      const payments = (e["payments"] as readonly { amount: number }[] | undefined) ?? [];
      moments.push({
        eventIndex: i, handIndex: handAt(i), kind: "win", seat: Number(e["seat"]),
        winType: String(e["winType"]), fromSeat: e["fromSeat"] === undefined ? null : Number(e["fromSeat"]),
        han: Number(e["han"] ?? 0), fu: Number(e["fu"] ?? 0),
        yakumanMultiple: Number(e["yakumanMultiple"] ?? 0),
        yaku: [...((e["yaku"] as readonly string[] | undefined) ?? [])],
        points: payments.reduce((s, p) => s + p.amount, 0) + Number(e["stickPoints"] ?? 0),
      });
    } else if (e.type === "riichi") {
      moments.push({ eventIndex: i, handIndex: handAt(i), kind: "riichi", seat: Number(e["seat"]), double: e["double"] === true });
    } else if (e.type === "kan") {
      moments.push({ eventIndex: i, handIndex: handAt(i), kind: "kan", seat: Number(e["seat"]), kanKind: String(e["kind"]) });
    }
  }
  return moments;
}

// ---------------------------------------------------------------------------

export function buildAnalyze(input: unknown): AnalyzeResult {
  const recon = reconstructAllSeats(input);
  if ("reason" in recon) return { available: false, reason: recon.reason };
  const decisions: GradedDecision[] = recon.positions.map((position) => ({
    position, grades: gradePosition(position),
  }));
  const { events, result } = recon;
  const seats = [0, 1, 2, 3].map((seat) => aggregateSeat(seat, decisions, events, result.handsPlayed));
  const totalGrades = seats.reduce((s, x) => s + x.graded, 0);
  const totalCorrect = seats.reduce((s, x) => s + x.correct, 0);
  const hands = foldHands(events, result.scores);
  const trajectory: (readonly number[])[] = hands.length
    ? [[...hands[0]!.startScores], ...hands.map((h) => [...h.endScores])]
    : [[...result.scores]];
  const swings: AnalyzeSwing[] = hands
    .map((hand) => {
      let seat = 0, delta = 0;
      hand.scoreDelta.forEach((d, j) => { if (Math.abs(d) > Math.abs(delta)) { delta = d; seat = j; } });
      return { handIndex: hand.index, seat, delta, scoreDelta: hand.scoreDelta };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);
  const missesList = decisions.flatMap((decision) =>
    decision.grades
      .filter((g) => g.grade === "minor-miss" || g.grade === "miss" || g.grade === "blunder")
      .map((grade) => ({ decision, grade })),
  );
  const timeline = new BoardTimeline({
    review: Object.freeze({
      schemaVersion: 1 as const, engineVersion: 2 as const, complete: true,
      consumedDecisions: recon.positions.length,
      positions: Object.freeze([...recon.positions]),
      moments: Object.freeze([]),
    }),
    events: recon.events, chiHints: recon.chiHints, result: recon.result,
    humanSeat: recon.humanSeat,
  });
  return {
    available: true,
    timeline, humanSeat: recon.humanSeat, seed: recon.seed, length: recon.length,
    decisions, totalDecisions: decisions.length, totalGrades,
    seats,
    overall: {
      graded: totalGrades, correct: totalCorrect,
      misses: seats.reduce((s, x) => s + x.misses, 0),
      blunders: seats.reduce((s, x) => s + x.blunders, 0),
      accuracy: totalGrades ? Math.round((1000 * totalCorrect) / totalGrades) / 10 : null,
    },
    settlement: result.settlement, finals: result.scores,
    hands, trajectory, swings, missesList,
    moments: foldMoments(events, hands),
    winGrades: seats.reduce((s, x) => s + x.byKind.win.total, 0),
    tsumoOffered: recon.positions.filter((p) => p.kind === "turn" && (p.context as TurnContext).canTsumo).length,
    winsTotal: events.filter((e) => e.type === "win").length,
    ronWins: events.filter((e) => e.type === "win" && e["winType"] === "ron").length,
  };
}

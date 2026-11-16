/**
 * Seat drivers (brief §5 architecture seam): a driver is asked, given the
 * seat's public PlayerView and the engine's decision context, which legal
 * action to take. Two implementations ship in this PR:
 *
 * - HumanDriver — always returns PENDING; the runner turns that into a
 *   suspension and the UI collects the action from the player.
 * - TempAiDriver — TEMPORARY stand-in for the three AI seats. Simple
 *   efficiency-greedy heuristics on the engine's own shanten/ukeire
 *   (task-sanctioned floor: pass except ron/tsumo/riichi when legal; this
 *   adds pon/chi only when they strictly reduce shanten). packages/ai
 *   replaces it behind this same interface when it merges; nothing else
 *   in the client changes.
 *
 * Drivers never invent legality: contexts come from the engine, and the
 * engine throws on an illegal action, so a driver bug fails loudly in
 * tests rather than corrupting a game.
 */

import {
  TILE_TYPE_COUNT,
  doraFromIndicator,
  shanten,
  ukeire,
  type CallAction,
  type CallContext,
  type PlayerView,
  type TileType,
  type TurnAction,
  type TurnContext,
} from "@openmahjong/engine";

export const PENDING: unique symbol = Symbol("driver-pending");

export interface SeatDriver {
  readonly name: string;
  turn(view: PlayerView, ctx: TurnContext): TurnAction | typeof PENDING;
  call(view: PlayerView, ctx: CallContext): CallAction | typeof PENDING;
}

/** The human seat: every decision is collected through the UI. */
export class HumanDriver implements SeatDriver {
  readonly name = "human";
  turn(): typeof PENDING {
    return PENDING;
  }
  call(): typeof PENDING {
    return PENDING;
  }
}

function countsOf(types: readonly number[]): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const t of types) counts[t]!++;
  return counts;
}

/** Visible tile counts from a view: all ponds, all melds, dora indicators —
 *  everything ukeire may legitimately know beyond the viewer's own hand. */
function visibleCounts(view: PlayerView): number[] {
  const visible = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const p of view.players) {
    for (const d of p.discards) visible[d.tile.type]!++;
    for (const m of p.melds) for (const t of m.tiles) visible[t.type]!++;
  }
  for (const t of view.doraIndicators) visible[t.type]!++;
  return visible;
}

/** Rough tile-keeping value: dora are precious, pairs and connected simples
 *  are worth keeping. Used only to break ukeire ties. */
function keepValue(view: PlayerView, type: TileType, counts: readonly number[]): number {
  let v = 0;
  for (const ind of view.doraIndicators) {
    if (doraFromIndicator(ind.type) === type) v += 3;
  }
  if (counts[type]! >= 2) v += 2; // pair/triplet potential
  if (type < 27) {
    const rank = (type % 9) + 1;
    if (rank >= 2 && rank <= 8) v += 1; // simples connect better
    if ((rank > 1 && counts[type - 1]! > 0) || (rank < 9 && counts[type + 1]! > 0)) v += 1;
  }
  return v;
}

interface DiscardEval {
  readonly shanten: number;
  readonly accept: number;
  readonly waitTypes: number;
}

/** Memoisation for the pure hand-analysis functions: the same hand shapes
 *  recur constantly across a game, and ukeire is 34 shanten calls. */
const shantenCache = new Map<string, number>();
function shantenMemo(counts: readonly number[], melds: number): number {
  const key = `${melds}|${counts.join(",")}`;
  let v = shantenCache.get(key);
  if (v === undefined) {
    v = shanten(counts, melds);
    if (shantenCache.size > 20000) shantenCache.clear();
    shantenCache.set(key, v);
  }
  return v;
}

const evalCache = new Map<string, DiscardEval>();
function evalKey(after: readonly number[], melds: number, drew: boolean, visible: readonly number[]): string {
  return `${drew ? 1 : 0}|${melds}|${after.join(",")}|${visible.join(",")}`;
}

/**
 * Evaluate the hand after discarding one tile. After a draw the remainder
 * is a 13-shape and shanten/ukeire apply directly; after a pon/chi call
 * the remainder is a 12-shape, so the score is the best shanten reachable
 * after one more draw (min over all drawable types).
 */
function evalAfterDiscard(
  after: number[],
  melds: number,
  drewThisTurn: boolean,
  visible: readonly number[],
): DiscardEval {
  const key = evalKey(after, melds, drewThisTurn, visible);
  const hit = evalCache.get(key);
  if (hit) return hit;
  let result: DiscardEval;
  if (drewThisTurn) {
    const sh = shantenMemo(after, melds);
    if (sh > 2) {
      result = { shanten: sh, accept: 0, waitTypes: 0 };
    } else {
      const uk = ukeire(after, visible, melds);
      result = { shanten: sh, accept: uk.totalRemaining, waitTypes: uk.improving.length };
    }
  } else {
    let best = Infinity;
    for (let t = 0; t < TILE_TYPE_COUNT; t++) {
      if (after[t]! >= 4) continue;
      after[t]!++;
      const s = shantenMemo(after, melds);
      if (s < best) best = s;
      after[t]!--;
    }
    result = { shanten: best, accept: 0, waitTypes: 0 };
  }
  if (evalCache.size > 20000) evalCache.clear();
  evalCache.set(key, result);
  return result;
}

/**
 * TEMPORARY AI-seat driver — replaced by packages/ai behind this interface.
 * Efficiency-greedy: minimize shanten, maximize ukeire, keep valuable
 * tiles; ron/tsumo whenever legal; riichi on a reasonable wait; pon/chi
 * only when they strictly reduce shanten; never daiminkan/shouminkan/
 * kyuushu (all legal to decline).
 */
export class TempAiDriver implements SeatDriver {
  readonly name = "temporary-ai";

  /**
   * Ask tracking for the engine's two-pass call protocol (game.ts
   * resolveDiscardWindow): pon/kan are decided in a first pass, chi in a
   * second pass over an identical context shape — except when the seat
   * could not pon/kan, in which case its first ask IS the chi pass.
   * Returning the wrong pass's action makes the engine throw.
   */
  private callAsks = new Map<string, number>();

  turn(view: PlayerView, ctx: TurnContext): TurnAction {
    this.callAsks.clear();
    const me = view.players[view.seat]!;
    if (ctx.canTsumo) return { type: "tsumo" };
    if (me.riichi) {
      // The engine requires discarding the drawn tile in riichi.
      return { type: "discard", tileId: ctx.drawnTile!.id };
    }
    const handCounts = countsOf(view.hand.map((t) => t.type));
    if (ctx.ankanOptions.length > 0 && ctx.drawnTile) {
      const cur = shantenMemo(handCounts, view.melds.length);
      if (cur <= 1) return { type: "ankan", tileType: ctx.ankanOptions[0]! };
    }

    const visible = visibleCounts(view);
    const drewThisTurn = ctx.drawnTile !== null;
    let best: { tileId: number; score: number; riichi: boolean } | null = null;
    for (const tile of view.hand) {
      const after = [...handCounts];
      after[tile.type]!--;
      const ev = evalAfterDiscard(after, view.melds.length, drewThisTurn, visible);
      const keep = keepValue(view, tile.type, handCounts) + (tile.red ? 3 : 0);
      const canRiichi = ctx.riichiDiscardIds.includes(tile.id);
      const riichi =
        canRiichi && ev.shanten === 0 && (ev.waitTypes >= 2 || ev.accept >= 4);
      const score =
        -ev.shanten * 10000 + ev.accept * 10 + ev.waitTypes - keep + (riichi ? 5 : 0);
      if (!best || score > best.score) best = { tileId: tile.id, score, riichi };
    }
    if (!best) throw new Error("TempAiDriver: no discard candidate");
    return best.riichi
      ? { type: "discard", tileId: best.tileId, riichi: true }
      : { type: "discard", tileId: best.tileId };
  }

  call(view: PlayerView, ctx: CallContext): CallAction {
    if (ctx.canRon) return { type: "ron" };
    if (ctx.phase !== "call") return { type: "pass" };
    const askKey = `${view.seat}:${ctx.tile.id}:${ctx.fromSeat}`;
    const seen = this.callAsks.get(askKey) ?? 0;
    this.callAsks.set(askKey, seen + 1);
    const chiPass = seen >= 1 || (!ctx.canPon && !ctx.canKan);
    const handCounts = countsOf(view.hand.map((t) => t.type));
    const cur = shanten(handCounts, view.melds.length);
    if (chiPass) {
      // Chi pass: chi or pass only — pon/kan are no longer decidable.
      for (const option of ctx.chiOptions) {
        const after = [...handCounts];
        for (const id of option) {
          const t = view.hand.find((h) => h.id === id)!;
          after[t.type]!--;
        }
        if (shantenMemo(after, view.melds.length + 1) < cur) {
          return { type: "chi", tileIds: option };
        }
      }
      return { type: "pass" };
    }
    // Pon pass: pon or pass only — chi is decided later.
    if (ctx.canPon) {
      const after = [...handCounts];
      after[ctx.tile.type]! -= 2;
      if (shantenMemo(after, view.melds.length + 1) < cur) return { type: "pon" };
    }
    return { type: "pass" };
  }
}

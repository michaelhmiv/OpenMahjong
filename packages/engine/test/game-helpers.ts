/**
 * Test helpers for the game state machine: scripted walls (exact hands and
 * draw sequences) and composable policies.
 */

import {
  buildTileSet,
  parseCounts,
  type Policy,
  type Tile,
  type TileType,
  type TurnAction,
  type CallAction,
  type PlayerView,
  type TurnContext,
  type CallContext,
  type Wall,
} from "../src/index.js";

/** Expand notation ("234m55z") into a list of tile types. */
export function types(notation: string): TileType[] {
  const counts = parseCounts(notation);
  const out: TileType[] = [];
  counts.forEach((n, t) => {
    for (let i = 0; i < n; i++) out.push(t);
  });
  return out;
}

export interface ScriptedWallOptions {
  /** 13 tile types per seat, seats 0..3. The first dealer must be seat 0:
   *  the deal consumes each hand in order (4-4-4-1 from the dealer). */
  hands: TileType[][];
  /** Tiles drawn after the deal, in draw order (live-wall positions 52+).
   *  A null entry (or a position past the array) is filled with a leftover
   *  tile in canonical order. */
  draws?: (TileType | null)[];
  /** Dead-wall front tiles (rinshan draws), indices 0..3. */
  rinshan?: TileType[];
  /** Dora indicators from dead-wall index 4 (first = initial indicator). */
  indicators?: TileType[];
  /** Ura dora indicators from dead-wall index 9 (counted for riichi wins). */
  uraIndicators?: TileType[];
}

/** Build a Wall with exact hands/draws. Throws if a type is used 5+ times. */
export function buildScriptedWall(opts: ScriptedWallOptions): Wall {
  const pool = new Map<TileType, Tile[]>();
  for (const tile of buildTileSet()) {
    const arr = pool.get(tile.type) ?? [];
    arr.push(tile);
    pool.set(tile.type, arr);
  }
  const take = (type: TileType): Tile => {
    const arr = pool.get(type)!;
    if (arr.length === 0) throw new Error(`Scripted wall uses a 5th copy of type ${type}`);
    return arr.shift()!;
  };

  if (opts.hands.length !== 4 || opts.hands.some((h) => h.length !== 13)) {
    throw new Error("Scripted wall needs exactly 13 tiles for each of 4 hands");
  }
  const live: (Tile | undefined)[] = new Array(122).fill(undefined);
  const handPtr = [0, 0, 0, 0];
  let pos = 0;
  for (let round = 0; round < 3; round++) {
    for (let seat = 0; seat < 4; seat++) {
      for (let k = 0; k < 4; k++) live[pos++] = take(opts.hands[seat]![handPtr[seat]!++]!);
    }
  }
  for (let seat = 0; seat < 4; seat++) {
    live[pos++] = take(opts.hands[seat]![handPtr[seat]!++]!);
  }
  // pos === 52: scripted draws follow.
  for (const t of opts.draws ?? []) {
    if (pos >= 122) throw new Error("Too many scripted draws");
    if (t !== null) live[pos] = take(t);
    pos++;
  }
  const dead: (Tile | undefined)[] = new Array(14).fill(undefined);
  (opts.rinshan ?? []).forEach((t, i) => (dead[i] = take(t)));
  (opts.indicators ?? []).forEach((t, i) => (dead[4 + i] = take(t)));
  (opts.uraIndicators ?? []).forEach((t, i) => (dead[9 + i] = take(t)));

  // Fill every remaining slot with leftover tiles in canonical order.
  const leftovers: Tile[] = [];
  for (let t = 0; t < 34; t++) leftovers.push(...pool.get(t as TileType)!);
  let li = 0;
  for (let i = 0; i < 122; i++) if (!live[i]) live[i] = leftovers[li++]!;
  for (let i = 0; i < 14; i++) if (!dead[i]) dead[i] = leftovers[li++]!;
  if (li !== leftovers.length) throw new Error("Scripted wall tile accounting failed");

  return { liveWall: live as Tile[], deadWall: dead as Tile[] };
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export interface TsumogiriOptions {
  /** Declare tsumo when legal (default true). */
  tsumo?: boolean;
  /** Declare riichi when discarding the drawn tile keeps tenpai (default false). */
  riichi?: boolean;
  /** Ron whenever legal (default false). */
  ron?: boolean;
}

/** Discard the drawn tile (or the first hand tile after a call); never call. */
export function tsumogiriPolicy(opts: TsumogiriOptions = {}): Policy {
  return {
    turn(view: PlayerView, ctx: TurnContext): TurnAction {
      if (ctx.canTsumo && opts.tsumo !== false) return { type: "tsumo" };
      const tile = ctx.drawnTile ?? view.hand[0]!;
      if (
        opts.riichi &&
        ctx.drawnTile &&
        ctx.riichiDiscardIds.includes(ctx.drawnTile.id)
      ) {
        return { type: "discard", tileId: ctx.drawnTile.id, riichi: true };
      }
      return { type: "discard", tileId: tile.id };
    },
    call(_view: PlayerView, ctx: CallContext): CallAction {
      if (ctx.canRon && opts.ron) return { type: "ron" };
      return { type: "pass" };
    },
  };
}

export interface Script {
  turn?: (view: PlayerView, ctx: TurnContext) => TurnAction | undefined;
  call?: (view: PlayerView, ctx: CallContext) => CallAction | undefined;
}

/** A policy driven by a script; unhandled decisions fall back. */
export function scriptedPolicy(script: Script, fallback: Policy = tsumogiriPolicy()): Policy {
  return {
    turn(view, ctx) {
      return script.turn?.(view, ctx) ?? fallback.turn(view, ctx);
    },
    call(view, ctx) {
      return script.call?.(view, ctx) ?? fallback.call(view, ctx);
    },
  };
}

/** Discard a specific tile type when it is in hand; otherwise fall back. */
export function discardTypePolicy(
  tileType: TileType,
  fallback: Policy = tsumogiriPolicy(),
): Policy {
  return scriptedPolicy(
    {
      turn(view) {
        const tile = view.hand.find((t) => t.type === tileType);
        return tile ? { type: "discard", tileId: tile.id } : undefined;
      },
    },
    fallback,
  );
}

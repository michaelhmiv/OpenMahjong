/**
 * Test helpers for the AI: fabricate `PlayerView`s and decision contexts
 * from compact notation, so policy tests read as mahjong positions.
 *
 * Tile instances come from a shared pool built on the engine's canonical
 * tile set (copy 0 of each five is the red five, as in the engine), so
 * ids and red flags behave exactly as in a real game.
 */

import {
  buildTileSet,
  type CallContext,
  type MeldState,
  type PlayerPublicView,
  type PlayerView,
  type Tile,
  type TileType,
  type TurnContext,
} from "@openmahjong/engine";

const pool = new Map<TileType, Tile[]>();
for (const tile of buildTileSet()) {
  const arr = pool.get(tile.type) ?? [];
  arr.push(tile);
  pool.set(tile.type, arr);
}
const takenIds = new Set<number>();

/** Reset instance allocation (call at the start of each fabricated view). */
export function resetPool(): void {
  takenIds.clear();
}

function take(type: TileType, wantRed = false): Tile {
  const arr = pool.get(type)!;
  const tile = wantRed
    ? arr.find((t) => t.red && !takenIds.has(t.id))
    : (arr.find((t) => !t.red && !takenIds.has(t.id)) ??
      arr.find((t) => !takenIds.has(t.id)));
  if (!tile) throw new Error(`view helper exhausted copies of type ${type}`);
  takenIds.add(tile.id);
  return tile;
}

/** Expand notation ("234m55z"; a 0 in a suited run is the red five) into
 *  distinct tile instances. */
export function tilesOf(notation: string): Tile[] {
  const out: Tile[] = [];
  let digits: number[] = [];
  for (const ch of notation.trim()) {
    if (ch >= "0" && ch <= "9") {
      digits.push(ch.charCodeAt(0) - 48);
      continue;
    }
    const suitBase =
      ch === "m" ? 0 : ch === "p" ? 9 : ch === "s" ? 18 : ch === "z" ? 27 : -1;
    if (suitBase < 0) throw new Error(`Invalid notation character: ${ch}`);
    for (const d of digits) {
      if (ch === "z") {
        if (d < 1 || d > 7) throw new Error(`Invalid honor digit: ${d}`);
        out.push(take(suitBase + d - 1));
      } else if (d === 0) {
        out.push(take(suitBase + 4, true));
      } else {
        out.push(take(suitBase + d - 1));
      }
    }
    digits = [];
  }
  if (digits.length > 0) throw new Error(`Trailing digits in notation: ${notation}`);
  return out.sort((a, b) => a.type - b.type || a.id - b.id);
}

export interface ViewSpec {
  /** The viewer's closed hand, e.g. "234m345p678s11z" (13 or 14 tiles). */
  hand: string;
  /** The viewer's seat (default 0). */
  seat?: number;
  /** Dealer seat (default 0). */
  dealer?: number;
  /** Round wind type (default 27 = East). */
  roundWind?: TileType;
  kyoku?: number;
  honba?: number;
  sticks?: number;
  wallRemaining?: number;
  /** Dora indicator tile types (default [0] → dora is 2m). */
  doraIndicators?: TileType[];
  /** Per-seat discards in notation, indexed by seat. */
  discards?: (string | undefined)[];
  /** Per-seat riichi flags, indexed by seat. */
  riichi?: (boolean | undefined)[];
  /** Per-seat scores (default 25000 each). */
  scores?: number[];
  /** The viewer's own melds. */
  melds?: MeldState[];
  /** Per-seat melds for opponents (indexed by seat). */
  otherMelds?: (MeldState[] | undefined)[];
  /** Per-seat closed-hand counts for opponents (default 13). */
  handCounts?: (number | undefined)[];
}

const EAST = 27;

export function makeView(spec: ViewSpec): PlayerView {
  resetPool();
  const seat = spec.seat ?? 0;
  const dealer = spec.dealer ?? 0;
  const hand = tilesOf(spec.hand);
  const indicators = (spec.doraIndicators ?? [0]).map((t) => take(t));
  const seatWindOf = (s: number): TileType => EAST + ((s - dealer + 4) % 4);

  const players: PlayerPublicView[] = [0, 1, 2, 3].map((s) => {
    const melds =
      s === seat ? (spec.melds ?? []) : (spec.otherMelds?.[s] ?? []);
    return {
      seat: s,
      score: spec.scores?.[s] ?? 25000,
      riichi: spec.riichi?.[s] ?? false,
      doubleRiichi: false,
      discards: (spec.discards?.[s]
        ? tilesOf(spec.discards[s]!)
        : []
      ).map((tile) => ({ tile, riichiDeclaration: false, called: false })),
      melds,
      handCount:
        s === seat
          ? hand.length
          : (spec.handCounts?.[s] ?? 13 - 3 * melds.length),
      isDealer: s === dealer,
      seatWind: seatWindOf(s),
    };
  });

  return {
    seat,
    hand,
    melds: spec.melds ?? [],
    players,
    dealer,
    roundWind: spec.roundWind ?? EAST,
    kyoku: spec.kyoku ?? 1,
    honba: spec.honba ?? 0,
    sticks: spec.sticks ?? 0,
    wallRemaining: spec.wallRemaining ?? 40,
    doraIndicators: indicators,
    currentTurn: seat,
  };
}

/** A pon/chi/ankan-style meld for view fabrication. */
export function meldOf(kind: MeldState["kind"], notation: string, calledFrom?: number): MeldState {
  const tiles = tilesOf(notation);
  return {
    kind,
    tiles,
    ...(calledFrom !== undefined ? { calledFrom } : {}),
    ...(calledFrom !== undefined ? { calledTile: tiles[0]! } : {}),
  };
}

export interface TurnSpec {
  drawnTile?: Tile | null;
  canTsumo?: boolean;
  ankanOptions?: TileType[];
  shouminkanOptions?: TileType[];
  riichiDiscardIds?: number[];
  canKyuushu?: boolean;
  rinshan?: boolean;
}

export function makeTurnCtx(spec: TurnSpec = {}): TurnContext {
  return {
    drawnTile: spec.drawnTile ?? null,
    rinshan: spec.rinshan ?? false,
    canTsumo: spec.canTsumo ?? false,
    ankanOptions: spec.ankanOptions ?? [],
    shouminkanOptions: spec.shouminkanOptions ?? [],
    riichiDiscardIds: spec.riichiDiscardIds ?? [],
    canKyuushu: spec.canKyuushu ?? false,
  };
}

export interface CallSpec {
  phase?: CallContext["phase"];
  tile: Tile;
  fromSeat?: number;
  canRon?: boolean;
  canPon?: boolean;
  canKan?: boolean;
  chiOptions?: (readonly [number, number])[];
}

export function makeCallCtx(spec: CallSpec): CallContext {
  return {
    phase: spec.phase ?? "call",
    tile: spec.tile,
    fromSeat: spec.fromSeat ?? 1,
    canRon: spec.canRon ?? false,
    canPon: spec.canPon ?? false,
    canKan: spec.canKan ?? false,
    chiOptions: spec.chiOptions ?? [],
  };
}

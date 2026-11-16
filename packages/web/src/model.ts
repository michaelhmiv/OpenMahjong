/**
 * TableModel — the view-model mapping (brief §9): the table the client
 * renders is a fold of the engine's typed event log, nothing else. The
 * client holds no game logic; if this model and the engine disagree, the
 * engine is right by definition (brief §5).
 *
 * Tile instances are resolved through the engine's own buildTileSet()
 * (tile id -> Tile). Every seat's tiles are tracked from deal/draw/discard/
 * call events — opponents are rendered face-down from the same data, and
 * win/draw reveals use exactly what the log legitimately contains.
 *
 * One event-log gap, handled explicitly: a "call" event for chi names only
 * the tile type, not which two hand tiles formed the sequence. The runner
 * supplies the recorded decision's tile ids as a hint (see runner.ts);
 * without a hint the model deterministically takes the first legal pair
 * in hand order. Pon/daiminkan tile picks from hand follow the engine's
 * own convention (lowest ids first — copy order puts the red five first).
 */

import {
  FIRST_INDICATOR_INDEX,
  buildTileSet,
  createWall,
  doraFromIndicator,
  type GameEvent,
  type MeldKind,
  type Seat,
  type Tile,
} from "@openmahjong/engine";

const TILES: readonly Tile[] = buildTileSet();

export function tileById(id: number): Tile {
  const t = TILES[id];
  if (!t) throw new Error(`Unknown tile id ${id}`);
  return t;
}

export interface PondEntry {
  readonly tile: Tile;
  readonly riichiDeclaration: boolean;
  readonly tsumogiri: boolean;
  /** True once another player has called this tile away. */
  called: boolean;
}

export interface MeldModel {
  readonly kind: MeldKind;
  readonly tiles: readonly Tile[];
  readonly calledFrom?: Seat;
  readonly calledTile?: Tile;
}

export interface PlayerModel {
  readonly seat: Seat;
  score: number;
  riichi: boolean;
  doubleRiichi: boolean;
  /** Closed-hand tile ids in tracked order (unsorted for opponents is fine —
   *  they render as backs; the human hand is sorted at render time). */
  handIds: number[];
  melds: MeldModel[];
  pond: PondEntry[];
  isDealer: boolean;
  seatWind: number;
}

export interface WinInfo {
  readonly seat: Seat;
  readonly winType: "ron" | "tsumo";
  readonly fromSeat?: Seat;
  readonly winningTile: Tile;
  readonly yaku: readonly string[];
  readonly han: number;
  readonly fu: number;
  readonly yakumanMultiple: number;
  readonly payments: readonly { seat: Seat; amount: number }[];
  readonly stickPoints: number;
  /** Winner's closed hand at the win (excluding the winning tile). */
  readonly handTiles: readonly Tile[];
  readonly winnerMelds: readonly MeldModel[];
}

export interface DrawnHandInfo {
  readonly kind: "exhaustive" | "abortive";
  readonly abortive?: string;
  readonly tenpai?: readonly Seat[];
  readonly nagashi?: readonly Seat[];
  /** Tenpai players' hands, revealed on an exhaustive draw. */
  readonly revealedHands: ReadonlyMap<Seat, readonly Tile[]>;
}

export interface HandEndInfo {
  readonly reason: string;
  readonly renchan: boolean;
}

export interface SettlementModel {
  readonly seat: Seat;
  readonly score: number;
  readonly rank: number;
  readonly points: number;
}

export interface ChiHint {
  readonly tileIds: readonly [number, number];
}

const WINDS = [27, 28, 29, 30] as const;

export class TableModel {
  players: PlayerModel[] = [];
  roundWind = 27;
  kyoku = 1;
  honba = 0;
  sticks = 0;
  wallRemaining = 0;
  doraIndicators: Tile[] = [];
  dealer: Seat = 0;
  currentTurn: Seat = 0;
  handInProgress = false;
  lastWin: WinInfo | null = null;
  lastDrawnHand: DrawnHandInfo | null = null;
  lastHandEnd: HandEndInfo | null = null;
  settlement: SettlementModel[] | null = null;
  finalScores: number[] | null = null;
  gameLength: string = "south";
  seed = "";

  private handSerial = -1;
  private uraCache: Tile[] | null | undefined = undefined;

  constructor(readonly humanSeat: Seat = 0) {
    this.resetPlayers([25000, 25000, 25000, 25000], 0);
  }

  private resetPlayers(scores: readonly number[], dealer: Seat): void {
    this.dealer = dealer;
    this.players = scores.map((score, seat) => ({
      seat,
      score,
      riichi: false,
      doubleRiichi: false,
      handIds: [],
      melds: [],
      pond: [],
      isDealer: seat === dealer,
      seatWind: WINDS[(seat - dealer + 4) % 4]!,
    }));
  }

  /** Fold one event into the model. `chiHint` disambiguates chi melds. */
  apply(ev: GameEvent, chiHint?: ChiHint): void {
    switch (ev.type) {
      case "game-start": {
        this.gameLength = String(ev["length"]);
        this.seed = String(ev["seed"]);
        this.settlement = null;
        this.finalScores = null;
        break;
      }
      case "hand-start": {
        this.handSerial++;
        this.uraCache = undefined;
        this.roundWind = Number(ev["roundWind"]);
        this.kyoku = Number(ev["kyoku"]);
        this.honba = Number(ev["honba"]);
        this.sticks = Number(ev["sticks"]);
        const dealer = Number(ev["dealer"]) as Seat;
        const scores = this.players.map((p) => p.score);
        this.resetPlayers(scores, dealer);
        this.wallRemaining = 70;
        this.doraIndicators = [];
        this.lastWin = null;
        this.lastDrawnHand = null;
        this.lastHandEnd = null;
        this.handInProgress = true;
        this.currentTurn = dealer;
        break;
      }
      case "deal": {
        const p = this.players[Number(ev["seat"])]!;
        p.handIds = [...(ev["tiles"] as readonly number[])];
        break;
      }
      case "draw": {
        const p = this.players[Number(ev["seat"])]!;
        p.handIds.push(Number(ev["tile"]));
        if (ev["rinshan"] !== true) this.wallRemaining--;
        this.currentTurn = p.seat;
        break;
      }
      case "discard": {
        const p = this.players[Number(ev["seat"])]!;
        const id = Number(ev["tile"]);
        this.removeFromHand(p, id);
        p.pond.push({
          tile: tileById(id),
          riichiDeclaration: ev["riichi"] === true,
          tsumogiri: ev["tsumogiri"] === true,
          called: false,
        });
        this.currentTurn = p.seat;
        break;
      }
      case "riichi": {
        const p = this.players[Number(ev["seat"])]!;
        p.riichi = true;
        p.doubleRiichi = ev["double"] === true;
        this.sticks++;
        break;
      }
      case "call": {
        const seat = Number(ev["seat"]) as Seat;
        const fromSeat = Number(ev["fromSeat"]) as Seat;
        const kind = String(ev["kind"]) as MeldKind;
        const tileType = Number(ev["tileType"]);
        const caller = this.players[seat]!;
        const pondEntry = [...this.players[fromSeat]!.pond]
          .reverse()
          .find((e) => !e.called && e.tile.type === tileType);
        if (pondEntry) pondEntry.called = true;
        const calledTile = pondEntry?.tile ?? tileByIdOfType(tileType, caller);
        if (kind === "pon") {
          const taken = takeFromHand(caller, tileType, 2);
          caller.melds.push({ kind, tiles: [calledTile, ...taken], calledFrom: fromSeat, calledTile });
        } else if (kind === "daiminkan") {
          const taken = takeFromHand(caller, tileType, 3);
          caller.melds.push({ kind, tiles: [calledTile, ...taken], calledFrom: fromSeat, calledTile });
        } else if (kind === "chi") {
          let taken: Tile[];
          if (chiHint) {
            taken = chiHint.tileIds.map((id) => {
              this.removeFromHand(caller, id);
              return tileById(id);
            });
          } else {
            taken = firstChiPair(caller, tileType);
          }
          const tiles = [calledTile, ...taken].sort((a, b) => a.type - b.type || a.id - b.id);
          caller.melds.push({ kind, tiles, calledFrom: fromSeat, calledTile });
        }
        this.currentTurn = seat;
        break;
      }
      case "kan": {
        const seat = Number(ev["seat"]) as Seat;
        const kind = String(ev["kind"]);
        const tileType = Number(ev["tileType"]);
        const p = this.players[seat]!;
        if (kind === "ankan") {
          const taken = takeFromHand(p, tileType, 4);
          p.melds.push({ kind: "ankan", tiles: taken });
        } else if (kind === "shouminkan") {
          const idx = p.melds.findIndex(
            (m) => m.kind === "pon" && m.tiles[0]!.type === tileType,
          );
          if (idx >= 0) {
            const added = takeFromHand(p, tileType, 1);
            const pon = p.melds[idx]!;
            p.melds[idx] = {
              kind: "shouminkan",
              tiles: [...pon.tiles, ...added],
              ...(pon.calledFrom !== undefined ? { calledFrom: pon.calledFrom } : {}),
              ...(pon.calledTile !== undefined ? { calledTile: pon.calledTile } : {}),
            };
          }
        } else if (kind === "daiminkan") {
          // The meld itself was formed by the preceding "call" event.
        }
        this.currentTurn = seat;
        break;
      }
      case "indicator": {
        this.doraIndicators = (ev["indicators"] as readonly number[]).map(tileById);
        break;
      }
      case "win": {
        const seat = Number(ev["seat"]) as Seat;
        const winner = this.players[seat]!;
        const winType = String(ev["winType"]) as "ron" | "tsumo";
        let winningTile: Tile;
        if (winType === "tsumo") {
          winningTile = tileById(Number(ev["winningTile"]));
          this.removeFromHand(winner, winningTile.id);
        } else {
          const fromSeat = Number(ev["fromSeat"]) as Seat;
          const last = [...this.players[fromSeat]!.pond]
            .reverse()
            .find((e) => e.tile.type === Number(ev["winningTileType"]));
          winningTile = last?.tile ?? tileByIdOfType(Number(ev["winningTileType"]), winner);
        }
        this.lastWin = {
          seat,
          winType,
          ...(winType === "ron" ? { fromSeat: Number(ev["fromSeat"]) as Seat } : {}),
          winningTile,
          yaku: [...(ev["yaku"] as readonly string[])],
          han: Number(ev["han"]),
          fu: Number(ev["fu"]),
          yakumanMultiple: Number(ev["yakumanMultiple"] ?? 0),
          payments: (ev["payments"] as readonly { seat: Seat; amount: number }[]).map(
            (p) => ({ ...p }),
          ),
          stickPoints: Number(ev["stickPoints"] ?? 0),
          handTiles: winner.handIds.map(tileById),
          winnerMelds: [...winner.melds],
        };
        this.sticks = 0;
        break;
      }
      case "drawn-hand": {
        const kind = String(ev["kind"]);
        if (kind === "exhaustive") {
          const tenpai = [...(ev["tenpai"] as readonly Seat[])];
          const revealed = new Map<Seat, readonly Tile[]>();
          for (const seat of tenpai) {
            revealed.set(seat, this.players[seat]!.handIds.map(tileById));
          }
          this.lastDrawnHand = {
            kind: "exhaustive",
            tenpai,
            nagashi: [...(ev["nagashi"] as readonly Seat[])],
            revealedHands: revealed,
          };
        } else {
          this.lastDrawnHand = {
            kind: "abortive",
            abortive: String(ev["abortive"]),
            revealedHands: new Map(),
          };
        }
        break;
      }
      case "score": {
        const p = this.players[Number(ev["seat"])]!;
        p.score = Number(ev["score"]);
        break;
      }
      case "hand-end": {
        this.lastHandEnd = {
          reason: String(ev["reason"]),
          renchan: ev["renchan"] === true,
        };
        this.honba = Number(ev["honba"] ?? this.honba);
        this.handInProgress = false;
        break;
      }
      case "game-end": {
        this.finalScores = [...(ev["scores"] as readonly number[])];
        this.settlement = (ev["settlement"] as readonly SettlementModel[]).map((s) => ({
          ...s,
        }));
        this.players.forEach((p, i) => {
          p.score = this.finalScores![i]!;
        });
        break;
      }
    }
  }

  /**
   * Uradora indicators for a riichi win, reconstructed from the engine's
   * own wall builder: the hand's wall is createWall(`${seed}:hand:${n}`)
   * (game.ts), and ura indicators sit under the dora indicators in the
   * dead wall (wall.ts layout). Verified against the indicator events the
   * model actually saw — returns null when the wall does not match (e.g.
   * test-hook walls), in which case the breakdown omits the ura reveal
   * rather than showing tiles it cannot prove.
   */
  uraIndicators(): Tile[] | null {
    if (this.uraCache !== undefined) return this.uraCache;
    let result: Tile[] | null = null;
    try {
      const wall = createWall(`${this.seed}:hand:${this.handSerial}`);
      const revealed = this.doraIndicators.length;
      const check = wall.deadWall.slice(
        FIRST_INDICATOR_INDEX,
        FIRST_INDICATOR_INDEX + revealed,
      );
      if (check.every((t, i) => t.id === this.doraIndicators[i]?.id)) {
        result = wall.deadWall.slice(
          FIRST_INDICATOR_INDEX + 5,
          FIRST_INDICATOR_INDEX + 5 + revealed,
        ) as Tile[];
      }
    } catch {
      result = null;
    }
    this.uraCache = result;
    return result;
  }

  /** The dora types the current indicators point to. */
  doraTypes(): number[] {
    return this.doraIndicators.map((t) => doraFromIndicator(t.type));
  }

  private removeFromHand(p: PlayerModel, tileId: number): void {
    const i = p.handIds.indexOf(tileId);
    if (i >= 0) p.handIds.splice(i, 1);
  }
}

/** Fold a whole log into a fresh model. */
export function foldEvents(
  events: readonly GameEvent[],
  humanSeat: Seat = 0,
  chiHints?: ReadonlyMap<number, ChiHint>,
): TableModel {
  const model = new TableModel(humanSeat);
  for (const ev of events) model.apply(ev, chiHints?.get(ev.seq));
  return model;
}

function tileByIdOfType(type: number, preferNotInHandOf?: PlayerModel): Tile {
  // Fallback resolution when the exact instance is not tracked (should not
  // happen in normal play): pick the copy not present in the given hand.
  const inHand = new Set(preferNotInHandOf?.handIds ?? []);
  for (let copy = 0; copy < 4; copy++) {
    const t = TILES[type * 4 + copy]!;
    if (!inHand.has(t.id)) return t;
  }
  return TILES[type * 4]!;
}

function takeFromHand(p: PlayerModel, type: number, n: number): Tile[] {
  const taken: Tile[] = [];
  for (let i = 0; i < p.handIds.length && taken.length < n; ) {
    const t = tileById(p.handIds[i]!);
    if (t.type === type) {
      taken.push(t);
      p.handIds.splice(i, 1);
    } else {
      i++;
    }
  }
  taken.sort((a, b) => a.id - b.id);
  return taken;
}

function firstChiPair(p: PlayerModel, discardType: number): Tile[] {
  const rank = (discardType % 9) + 1;
  const base = Math.floor(discardType / 9) * 9;
  const patterns: [number, number][] = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  for (const [r1, r2] of patterns) {
    if (r1 < 1 || r2 > 9) continue;
    const t1 = p.handIds.map(tileById).find((t) => t.type === base + r1 - 1);
    const t2 = p.handIds.map(tileById).find((t) => t.type === base + r2 - 1);
    if (t1 && t2) {
      p.handIds = p.handIds.filter((id) => id !== t1.id && id !== t2.id);
      return [t1, t2];
    }
  }
  return [];
}

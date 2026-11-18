/**
 * Game state machine (brief §5 rules core, §13 A3/A4/A5): complete riichi
 * hands and games for 4 players, deterministic from a seed.
 *
 * Model: the engine drives the game synchronously and asks each seat's
 * Policy for decisions at exactly the points a player would decide. Every
 * state change appends a typed event to `game.events`; the log is the
 * contract the web client animates from (brief §9) and the replay source
 * for A5 determinism (same seed + same policies → identical log).
 *
 * Ruleset: mainstream online standard (brief S1-2, S1-12, S1-13, S1-14).
 * Choices made where the standard varies by platform, all documented here:
 * - Kandora timing: ankan flips the new indicator BEFORE the rinshan draw;
 *   daiminkan/shouminkan flip it AFTER the rinshan draw (before the discard
 *   decision). (Tenhou flips open-kan kandora after the discard; the count
 *   at any win is identical except a rinshan win after an open kan, where
 *   this engine counts the new dora — Soul-style.)
 * - Double ron: atama-hane (head bump) — the winner nearest the discarder
 *   in turn order takes all; there is no double-ron payout.
 * - Final-hand renchan: if the dealer repeats on the last kyoku the game
 *   extends until a hand ends without a dealer repeat (no agari-yame).
 * - Tobi: the game ends at the end of any hand in which a score is
 *   negative (checked after every hand, including mid-game hands).
 * - Settlement ties: tied seats split the uma (and oka, for first place)
 *   of the ranks they occupy, averaged (Tenhou-style).
 * - Riichi sticks still on the table when the game ends are awarded to
 *   the first-place player (ties broken by seat order from the starting
 *   dealer), so final scores always sum to exactly 100,000 (brief A3).
 * - Uradora indicators sit under the dora indicators in the dead wall:
 *   dead-wall indices FIRST_INDICATOR_INDEX+5 onward (wall.ts layout leaves
 *   exactly indices 9–13 for the maximum 5 ura indicators).
 */

import {
  TILE_TYPE_COUNT,
  countTiles,
  isTerminalOrHonor,
  isWind,
  rankOf,
  suitOf,
  type Tile,
  type TileType,
} from "./tiles.js";
import { createWall, FIRST_INDICATOR_INDEX, MAX_KAN_DRAWS, validateWall, type Wall } from "./wall.js";
import { shanten } from "./hand.js";
import { DEFAULT_RULESET, resolveRuleset, type RulesetReference } from "./ruleset.js";
import {
  scoreHand,
  type Meld as ScoreMeld,
  type MeldKind,
  type ScoreResult,
} from "./scoring.js";

export type Seat = number; // 0..3, absolute seats; turn order is seat+1 mod 4
export type GameLength = "east" | "south";

const EAST = 27;
const START_SCORE = 25000;
const RETURN_SCORE = 30000;
const UMA = [15, 5, -5, -15] as const;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type GameEventType =
  | "game-start"
  | "hand-start"
  | "deal"
  | "draw"
  | "discard"
  | "call"
  | "riichi"
  | "kan"
  | "indicator"
  | "win"
  | "drawn-hand"
  | "score"
  | "hand-end"
  | "game-end"
  | "flower"
  | "robbed-kong";

export interface GameEvent {
  readonly seq: number;
  readonly type: GameEventType;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Melds and per-player state (public shapes are reused in views)
// ---------------------------------------------------------------------------

export interface MeldState {
  readonly kind: MeldKind;
  /** Tile instances: 3 for chi/pon, 4 for a kan. */
  readonly tiles: readonly Tile[];
  /** Seat the tile was called from (undefined for ankan). */
  readonly calledFrom?: Seat;
  /** The called tile instance (undefined for ankan). */
  readonly calledTile?: Tile;
}

export interface DiscardEntry {
  readonly tile: Tile;
  /** True for the discard a riichi was declared with. */
  readonly riichiDeclaration: boolean;
  /** True if the tile was called away by another player. */
  called: boolean;
}

// ---------------------------------------------------------------------------
// Policies — the decision interface the AI package and tests implement
// ---------------------------------------------------------------------------

export interface TurnContext {
  /** The tile just drawn (normal, rinshan, or the tile completing a kan
   *  decision chain); null when discarding after a pon/chi call. */
  readonly drawnTile: Tile | null;
  readonly rinshan: boolean;
  readonly canTsumo: boolean;
  /** Tile types (in hand, count 4) that may be declared ankan now. */
  readonly ankanOptions: readonly TileType[];
  /** Tile types with a pon meld that may be upgraded to shouminkan now. */
  readonly shouminkanOptions: readonly TileType[];
  /** Tile ids that may be discarded WITH a riichi declaration (hand stays
   *  tenpai). Empty when riichi is not legal. */
  readonly riichiDiscardIds: readonly number[];
  readonly canKyuushu: boolean;
}

export type TurnAction =
  | { readonly type: "discard"; readonly tileId: number; readonly riichi?: boolean }
  | { readonly type: "ankan"; readonly tileType: TileType }
  | { readonly type: "shouminkan"; readonly tileType: TileType }
  | { readonly type: "tsumo" }
  | { readonly type: "kyuushu" };

export type CallPhase = "ron" | "call" | "chankan";

export interface CallContext {
  readonly phase: CallPhase;
  /** Explicit priority stage for phase=call; omitted by historical v1 replays. */
  readonly callStage?: "pon-kan" | "chi";
  /** The discarded tile (ron/call phases) or the kan tile being added
   *  (chankan phase). */
  readonly tile: Tile;
  readonly fromSeat: Seat;
  readonly canRon: boolean;
  readonly canPon: boolean;
  /** Daiminkan is legal (call phase only). */
  readonly canKan: boolean;
  /** Chi options (next player only, call phase): pairs of hand tile ids
   *  that form a sequence with the discarded tile. */
  readonly chiOptions: readonly (readonly [number, number])[];
}

export type CallAction =
  | { readonly type: "pass" }
  | { readonly type: "ron" }
  | { readonly type: "pon" }
  | { readonly type: "daiminkan" }
  | { readonly type: "chi"; readonly tileIds: readonly [number, number] };

export type DecisionRequest =
  | { kind: "turn"; view: PlayerView; context: TurnContext }
  | { kind: "call"; view: PlayerView; context: CallContext };

type Decisions<T> = Generator<DecisionRequest, T, TurnAction | CallAction>;

export interface Policy {
  turn(view: PlayerView, ctx: TurnContext): TurnAction;
  call(view: PlayerView, ctx: CallContext): CallAction;
}

// ---------------------------------------------------------------------------
// Public views — information hiding by API shape (brief §5)
// ---------------------------------------------------------------------------

export interface PlayerPublicView {
  readonly seat: Seat;
  readonly score: number;
  readonly riichi: boolean;
  readonly doubleRiichi: boolean;
  readonly discards: readonly DiscardEntry[];
  readonly melds: readonly MeldState[];
  /** Number of tiles in the closed hand (never the tiles themselves). */
  readonly handCount: number;
  readonly isDealer: boolean;
  /** Seat wind tile type (27=East … 30=North). */
  readonly seatWind: TileType;
}

export interface PlayerView {
  readonly seat: Seat;
  /** The viewing player's own tiles. Other hands are never exposed. */
  readonly hand: readonly Tile[];
  readonly melds: readonly MeldState[];
  readonly players: readonly PlayerPublicView[];
  readonly dealer: Seat;
  readonly roundWind: TileType;
  /** 1..4 within the round. */
  readonly kyoku: number;
  readonly honba: number;
  /** Riichi sticks currently on the table. */
  readonly sticks: number;
  /** Tiles left in the live wall. The wall's contents are never exposed. */
  readonly wallRemaining: number;
  readonly doraIndicators: readonly Tile[];
  readonly currentTurn: Seat;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface SettlementEntry {
  readonly seat: Seat;
  readonly score: number;
  /** 1..4 (shared on ties). */
  readonly rank: number;
  /** Final points in thousands: (score − 30000)/1000 + uma (+ oka for 1st). */
  readonly points: number;
}

/** Final settlement (brief S1-12): uma +15/+5/−5/−15, oka 20 to first. */
export function settle(scores: readonly number[]): SettlementEntry[] {
  if (scores.length !== 4 || scores.some((s) => !Number.isSafeInteger(s))) {
    throw new Error("Settlement requires 4 finite integer scores");
  }
  const oka = ((RETURN_SCORE - START_SCORE) * 4) / 1000; // 20
  const order = scores
    .map((score, seat) => ({ score, seat }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  const entries: SettlementEntry[] = [];
  let i = 0;
  while (i < 4) {
    let j = i;
    while (j + 1 < 4 && order[j + 1]!.score === order[i]!.score) j++;
    const group = order.slice(i, j + 1);
    const umaSum = UMA.slice(i, j + 1).reduce((a, b) => a + b, 0);
    const umaAvg = umaSum / group.length;
    const okaShare = i === 0 ? oka / group.length : 0;
    for (const { score, seat } of group) {
      entries.push({
        seat,
        score,
        rank: i + 1,
        points: (score - RETURN_SCORE) / 1000 + umaAvg + okaShare,
      });
    }
    i = j + 1;
  }
  return entries.sort((a, b) => a.seat - b.seat);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countsOf(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const t of tiles) counts[t.type]!++;
  return counts;
}

/** The dora a given indicator tile points to. */
export function doraFromIndicator(indicator: TileType): TileType {
  if (indicator >= 27 && indicator <= 30) return 27 + ((indicator - 27 + 1) % 4); // winds cycle
  if (indicator >= 31) return 31 + ((indicator - 31 + 1) % 3); // dragons cycle
  const suitBase = suitOf(indicator) * 9;
  const rank = rankOf(indicator); // 1..9
  return suitBase + (rank % 9); // rank 9 wraps to rank 1 (index base+0)
}

function copyTurnContext(ctx: TurnContext): TurnContext {
  return {
    ...ctx,
    drawnTile: ctx.drawnTile ? { ...ctx.drawnTile } : null,
    ankanOptions: [...ctx.ankanOptions],
    shouminkanOptions: [...ctx.shouminkanOptions],
    riichiDiscardIds: [...ctx.riichiDiscardIds],
  };
}

function copyCallContext(ctx: CallContext): CallContext {
  return { ...ctx, tile: { ...ctx.tile }, chiOptions: ctx.chiOptions.map(([a, b]) => [a, b] as const) };
}

function copyMeld(meld: MeldState): MeldState {
  return {
    ...meld,
    tiles: meld.tiles.map((t) => ({ ...t })),
    ...(meld.calledTile ? { calledTile: { ...meld.calledTile } } : {}),
  };
}

interface PlayerState {
  seat: Seat;
  tiles: Tile[];
  melds: MeldState[];
  discards: DiscardEntry[];
  score: number;
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  riichiFuriten: boolean;
  tempFuriten: boolean;
  drawCount: number;
  /** Memoized shanten/waits for the current 13-tile closed hand. */
  analysisKey: string;
  shantenNow: number;
  waits: TileType[];
}

export interface GameOptions {
  /** Explicit supported house-rule profile (default OpenMahjong riichi v1). */
  readonly ruleset?: RulesetReference;
  readonly seed: number | string;
  readonly length?: GameLength;
  /** One policy for all seats, or one per seat. */
  readonly policies?: Policy | readonly Policy[];
  readonly wallFactory?: (serial: number) => Wall;
  /** Test hook: explicit walls, one per hand, consumed in order before
   *  falling back to seeded walls. */
  readonly walls?: readonly Wall[];
  /** Test hook: starting scores (default 25,000 each). */
  readonly initialScores?: readonly number[];
  /** Test hook: seat that deals the first hand (default 0). */
  readonly initialDealer?: Seat;
}

export interface GameResult {
  readonly scores: readonly number[];
  readonly settlement: readonly SettlementEntry[];
  readonly events: readonly GameEvent[];
  readonly handsPlayed: number;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export class Game {
  readonly events: GameEvent[] = [];
  private seq = 0;

  private readonly policies: Policy[];
  private readonly wallFactory: GameOptions["wallFactory"];
  private readonly length: GameLength;
  private readonly seed: number | string;
  private readonly wallQueue: Wall[];
  private readonly shantenMemo = new Map<string, number>();

  private players: PlayerState[] = [];
  private scores: number[];
  private dealer: Seat;
  private readonly initialDealer: Seat;
  private roundIndex = 0; // 0 = East, 1 = South
  private kyoku = 1; // 1..4
  private honba = 0;
  private sticks = 0;
  private handSerial = 0;
  private gameOver = false;

  // Per-hand state.
  private wall!: Wall;
  private livePtr = 0;
  private rinshanUsed = 0;
  private kanCount = 0;
  private kanOwners: Seat[] = [];
  private indicatorsRevealed = 1;
  private anyCall = false;
  private riichiCount = 0;
  private firstDiscards: TileType[] = [];
  private pendingSuucha = false;
  private pendingSuukaikan = false;

  constructor(options: GameOptions) {
    resolveRuleset(options.ruleset);
    this.seed = options.seed;
    this.wallFactory = options.wallFactory;
    this.length = options.length ?? "south";
    if (!["east", "south"].includes(this.length)) throw new Error("length must be east or south");
    this.wallQueue = (options.walls ?? []).map((wall) => {
      validateWall(wall);
      return { liveWall: wall.liveWall.map((t) => ({ ...t })), deadWall: wall.deadWall.map((t) => ({ ...t })) };
    });
    this.dealer = options.initialDealer ?? 0;
    if (!Number.isInteger(this.dealer) || this.dealer < 0 || this.dealer > 3) {
      throw new Error("initialDealer must be a seat from 0 to 3");
    }
    this.initialDealer = this.dealer;
    this.scores = options.initialScores
      ? [...options.initialScores]
      : [START_SCORE, START_SCORE, START_SCORE, START_SCORE];
    if (this.scores.length !== 4 || this.scores.some((s) => !Number.isSafeInteger(s))) {
      throw new Error("initialScores must have 4 finite integer entries");
    }
    const p = options.policies;
    this.policies = !p ? [] : Array.isArray(p) ? [...p] : [p, p, p, p];
    if (p && this.policies.length !== 4) throw new Error("policies must be one policy or 4");
  }

  // -- events ---------------------------------------------------------------
  private emit(type: GameEventType, fields: Record<string, unknown> = {}): void {
    this.events.push({ seq: this.seq++, type, ...fields });
  }

  private emitScore(seat: Seat, delta: number): void {
    if (delta === 0) return;
    this.players[seat]!.score += delta;
    this.scores[seat] = this.players[seat]!.score;
    this.emit("score", { seat, delta, score: this.players[seat]!.score });
  }

  // -- analysis (memoized shanten + waits) ------------------------------------
  private shantenOf(counts: readonly number[], melds: number): number {
    const key = `${melds}|${counts.join(",")}`;
    let v = this.shantenMemo.get(key);
    if (v === undefined) {
      v = shanten(counts, melds);
      this.shantenMemo.set(key, v);
    }
    return v;
  }

  /** Refresh a player's cached shanten/waits for their current closed hand.
   *  Waits are computed only for a 13-tile hand (a player who could ron);
   *  at 14 tiles (just drew) only the shanten is meaningful. */
  private analyze(player: PlayerState): void {
    const counts = countsOf(player.tiles);
    const key = `${player.melds.length}|${counts.join(",")}`;
    if (player.analysisKey === key) return;
    player.analysisKey = key;
    player.shantenNow = this.shantenOf(counts, player.melds.length);
    player.waits = [];
    if (player.shantenNow === 0 && countTiles(counts) + 3 * player.melds.length === 13) {
      const owned = countsOf([...player.tiles, ...player.melds.flatMap((m) => m.tiles)]);
      player.waits = this.winningTypes(counts, player.melds.length, owned);
      // A nominal shape requiring a fifth copy of a tile is not tenpai.
      if (player.waits.length === 0) player.shantenNow = 1;
    }
  }

  private winningTypes(counts: readonly number[], melds: number, owned: readonly number[]): TileType[] {
    const work = [...counts];
    const waits: TileType[] = [];
    for (let t = 0; t < TILE_TYPE_COUNT; t++) {
      if (owned[t]! >= 4) continue;
      work[t]!++;
      if (this.shantenOf(work, melds) === -1) waits.push(t);
      work[t]!--;
    }
    return waits;
  }

  private seatWindOf(seat: Seat): TileType {
    return EAST + ((seat - this.dealer + 4) % 4);
  }

  private get roundWind(): TileType {
    return EAST + this.roundIndex;
  }

  private liveRemaining(): number {
    // Every rinshan draw moves the live wall's last tile into the dead
    // wall. Keep the immutable wall layout; its retired tail is never drawn.
    return this.wall.liveWall.length - this.livePtr - this.rinshanUsed;
  }

  private indicators(): Tile[] {
    return this.wall.deadWall.slice(
      FIRST_INDICATOR_INDEX,
      FIRST_INDICATOR_INDEX + this.indicatorsRevealed,
    ) as Tile[];
  }

  private uraIndicators(): Tile[] {
    return this.wall.deadWall.slice(
      FIRST_INDICATOR_INDEX + 5,
      FIRST_INDICATOR_INDEX + 5 + this.indicatorsRevealed,
    ) as Tile[];
  }

  // -- views ------------------------------------------------------------------
  viewFor(seat: Seat): PlayerView {
    const me = this.players[seat]!;
    return {
      seat,
      hand: me.tiles.map((t) => ({ ...t })),
      melds: me.melds.map(copyMeld),
      players: this.players.map((p) => ({
        seat: p.seat,
        score: p.score,
        riichi: p.riichi,
        doubleRiichi: p.doubleRiichi,
        discards: p.discards.map((d) => ({ ...d, tile: { ...d.tile } })),
        melds: p.melds.map(copyMeld),
        handCount: p.tiles.length,
        isDealer: p.seat === this.dealer,
        seatWind: this.seatWindOf(p.seat),
      })),
      dealer: this.dealer,
      roundWind: this.roundWind,
      kyoku: this.kyoku,
      honba: this.honba,
      sticks: this.sticks,
      wallRemaining: this.liveRemaining(),
      doraIndicators: this.indicators().map((tile) => ({ ...tile })),
      currentTurn: this.currentTurnSeat,
    };
  }

  private currentTurnSeat: Seat = 0;

  // -- top level ----------------------------------------------------------------
  run(): GameResult {
    if (this.policies.length !== 4) throw new Error("Four seat policies required");
    const game = this.play();
    let next = game.next();
    while (!next.done) {
      const req = next.value;
      const policy = this.policies[req.view.seat]!;
      next = game.next(req.kind === "turn" ? policy.turn(req.view, req.context) : policy.call(req.view, req.context));
    }
    return next.value;
  }

  *play(): Decisions<GameResult> {
    this.emit("game-start", { length: this.length, seed: String(this.seed), ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version } });
    let handsPlayed = 0;
    while (!this.gameOver) {
      yield* this.playHand();
      handsPlayed++;
    }
    if (this.sticks > 0) {
      const top = Math.max(...this.scores);
      const seat = [0, 1, 2, 3]
        .map((i) => (this.initialDealer + i) % 4)
        .find((s) => this.scores[s] === top)!;
      const delta = this.sticks * 1000;
      this.scores[seat]! += delta;
      this.emit("score", { seat, delta, score: this.scores[seat], reason: "leftover-sticks" });
      this.sticks = 0;
    }
    const settlement = settle(this.scores);
    this.emit("game-end", {
      scores: [...this.scores],
      settlement: settlement.map((s) => ({ ...s })),
    });
    return {
      scores: [...this.scores],
      settlement,
      events: this.events,
      handsPlayed,
    };
  }

  private setupHand(): void {
    if (this.wallFactory) {
      this.wall = this.wallFactory(this.handSerial);
      validateWall(this.wall);
    } else this.wall = this.wallQueue.shift() ?? createWall(`${String(this.seed)}:hand:${this.handSerial}`);
    this.handSerial++;
    this.livePtr = 0;
    this.rinshanUsed = 0;
    this.kanCount = 0;
    this.kanOwners = [];
    this.indicatorsRevealed = 1;
    this.anyCall = false;
    this.riichiCount = 0;
    this.firstDiscards = [];
    this.pendingSuucha = false;
    this.pendingSuukaikan = false;

    this.players = this.scores.map((score, seat) => ({
      seat,
      tiles: [],
      melds: [],
      discards: [],
      score,
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      riichiFuriten: false,
      tempFuriten: false,
      drawCount: 0,
      analysisKey: "",
      shantenNow: 99,
      waits: [],
    }));

    this.emit("hand-start", {
      roundWind: this.roundWind,
      kyoku: this.kyoku,
      dealer: this.dealer,
      honba: this.honba,
      sticks: this.sticks,
    });

    // Deal 4-4-4-1 starting from the dealer.
    const order: Seat[] = [0, 1, 2, 3].map((i) => (this.dealer + i) % 4);
    for (let round = 0; round < 3; round++) {
      for (const seat of order) {
        for (let k = 0; k < 4; k++) {
          this.players[seat]!.tiles.push(this.wall.liveWall[this.livePtr++]!);
        }
      }
    }
    for (const seat of order) {
      this.players[seat]!.tiles.push(this.wall.liveWall[this.livePtr++]!);
    }
    for (const seat of order) {
      const p = this.players[seat]!;
      p.tiles.sort((a, b) => a.type - b.type || a.id - b.id);
      this.analyze(p);
      this.emit("deal", { seat, tiles: p.tiles.map((t) => t.id) });
    }
    this.emit("indicator", { indicators: this.indicators().map((t) => t.id) });
  }

  // -- hand flow ---------------------------------------------------------------
  private *playHand(): Decisions<void> {
    this.setupHand();
    let actor: Seat = this.dealer;
    let needsDraw = true;
    let drawnTile: Tile | null = null;
    let rinshanDraw = false;

    for (;;) {
      const player = this.players[actor]!;
      this.currentTurnSeat = actor;

      if (needsDraw) {
        drawnTile = this.wall.liveWall[this.livePtr++]!;
        rinshanDraw = false;
        player.tiles.push(drawnTile);
        player.drawCount++;
        player.tempFuriten = false; // temporary furiten ends at the player's draw
        this.emit("draw", { seat: actor, tile: drawnTile.id, rinshan: false });
        needsDraw = false;
      }

      // Decision loop: kan declarations chain into rinshan draws and a
      // fresh decision; everything else exits with a discard.
      let discardTile: Tile | null = null;
      let declareRiichi = false;
      decision: for (;;) {
        const ctx = this.turnContext(player, drawnTile, rinshanDraw);
        const action = (yield { kind: "turn", view: this.viewFor(actor), context: copyTurnContext(ctx) }) as TurnAction;
        switch (action.type) {
          case "tsumo": {
            if (!ctx.canTsumo) throw new Error(`Seat ${actor}: tsumo declared but not legal`);
            this.resolveTsumo(player, drawnTile!, rinshanDraw);
            return;
          }
          case "kyuushu": {
            if (!ctx.canKyuushu) throw new Error(`Seat ${actor}: kyuushu kyuuhai not legal`);
            this.resolveAbortive("kyuushu-kyuuhai");
            return;
          }
          case "ankan":
          case "shouminkan": {
            const options =
              action.type === "ankan" ? ctx.ankanOptions : ctx.shouminkanOptions;
            if (!options.includes(action.tileType)) {
              throw new Error(`Seat ${actor}: ${action.type} of type ${action.tileType} not legal`);
            }
            if (action.type === "shouminkan") {
              // Chankan window: other players may rob the added tile.
              const addedTile = player.tiles.find((t) => t.type === action.tileType);
              const robber = yield* this.chankanWindow(player, action.tileType);
              if (robber) {
                this.resolveRon(robber, action.tileType, actor, {
                  chankan: true,
                  ...(addedTile ? { winTileInstance: addedTile } : {}),
                });
                return;
              }
            }
            drawnTile = this.declareKan(player, action.type, action.tileType);
            rinshanDraw = true;
            continue decision;
          }
          case "discard": {
            const tile = player.tiles.find((t) => t.id === action.tileId);
            if (!tile) throw new Error(`Seat ${actor}: discard tile ${action.tileId} not in hand`);
            if (player.riichi && (!drawnTile || tile.id !== drawnTile.id)) {
              throw new Error(`Seat ${actor}: a riichi player must discard the drawn tile`);
            }
            if (action.riichi && !ctx.riichiDiscardIds.includes(tile.id)) {
              throw new Error(`Seat ${actor}: riichi not legal with this discard`);
            }
            discardTile = tile;
            declareRiichi = action.riichi === true;
            break decision;
          }
          default:
            throw new Error(`Seat ${actor}: unknown turn action`);
        }
      }

      // Execute the discard.
      if (!declareRiichi && player.riichi) {
        player.ippatsu = false; // the ippatsu window closes with this discard
      }
      player.tiles = player.tiles.filter((t) => t.id !== discardTile!.id);
      player.discards.push({ tile: discardTile!, riichiDeclaration: declareRiichi, called: false });
      if (!this.anyCall && this.firstDiscards.length < 4) {
        this.firstDiscards.push(discardTile!.type);
      }
      this.emit("discard", {
        seat: actor,
        tile: discardTile!.id,
        riichi: declareRiichi,
        tsumogiri: drawnTile !== null && discardTile!.id === drawnTile.id,
      });
      this.analyze(player);

      const outcome = yield* this.resolveDiscardWindow(actor, discardTile!, declareRiichi);
      if (outcome.kind !== "none") {
        if (outcome.kind === "handOver") return;
        // A call happened: the caller acts next.
        actor = outcome.seat;
        drawnTile = outcome.drawnTile;
        rinshanDraw = outcome.drawnTile !== null;
        needsDraw = false;
        continue;
      }
      actor = (actor + 1) % 4;
      needsDraw = true;
      drawnTile = null;
      rinshanDraw = false;
    }
  }

  // -- decision contexts ---------------------------------------------------------
  private turnContext(player: PlayerState, drawnTile: Tile | null, rinshan: boolean): TurnContext {
    this.analyze(player);
    const counts = countsOf(player.tiles);

    let canTsumo = false;
    if (drawnTile) {
      canTsumo =
        this.tryScore(player, drawnTile.type, "tsumo", { rinshan }) !== null;
    }

    // A kan requires a drawn turn, a replacement tile, and a live-wall
    // tile to replenish the dead wall. No fifth kan is ever legal.
    const canDeclareKan = drawnTile !== null && this.kanCount < MAX_KAN_DRAWS && this.liveRemaining() > 0;
    const owned = countsOf([...player.tiles, ...player.melds.flatMap((m) => m.tiles)]);
    const ankanOptions: TileType[] = [];
    for (let t = 0; t < TILE_TYPE_COUNT; t++) {
      if (!canDeclareKan || counts[t]! < 4) continue;
      if (player.riichi) {
        // Compare the original 13-tile riichi hand, not the 14-tile
        // analysis (whose wait list is intentionally empty after a draw).
        if (drawnTile!.type !== t) continue;
        const before = [...counts];
        before[t]!--;
        const beforeOwned = [...owned];
        beforeOwned[t]!--;
        const after = [...counts];
        after[t]! -= 4;
        if (this.shantenOf(after, player.melds.length + 1) !== 0) continue;
        const waitsBefore = this.winningTypes(before, player.melds.length, beforeOwned);
        const waitsAfter = this.winningTypes(after, player.melds.length + 1, owned);
        if (waitsBefore.length === 0 || waitsAfter.join() !== waitsBefore.join()) continue;
      }
      ankanOptions.push(t);
    }

    const shouminkanOptions: TileType[] = [];
    for (const meld of player.melds) {
      if (canDeclareKan && !player.riichi && meld.kind === "pon" && counts[meld.tiles[0]!.type]! >= 1) {
        shouminkanOptions.push(meld.tiles[0]!.type);
      }
    }

    const riichiDiscardIds: number[] = [];
    const handClosed = player.melds.every((m) => m.kind === "ankan");
    if (
      !player.riichi &&
      handClosed &&
      drawnTile &&
      player.score >= 1000 &&
      this.liveRemaining() >= 4
    ) {
      for (const tile of player.tiles) {
        const after = [...counts];
        after[tile.type]!--;
        const afterOwned = [...owned];
        afterOwned[tile.type]!--;
        if (this.shantenOf(after, player.melds.length) === 0 &&
            this.winningTypes(after, player.melds.length, afterOwned).length > 0) {
          riichiDiscardIds.push(tile.id);
        }
      }
    }

    let distinctTOH = 0;
    for (let t = 0; t < TILE_TYPE_COUNT; t++) {
      if (counts[t]! > 0 && isTerminalOrHonor(t)) distinctTOH++;
    }
    const canKyuushu =
      drawnTile !== null && !rinshan && player.drawCount === 1 && !this.anyCall && distinctTOH >= 9;

    return {
      drawnTile,
      rinshan,
      canTsumo,
      ankanOptions,
      shouminkanOptions,
      riichiDiscardIds,
      canKyuushu,
    };
  }

  private callContext(
    player: PlayerState,
    tile: Tile,
    fromSeat: Seat,
    phase: CallPhase,
    chankanFromAnkan = false,
    callStage?: "pon-kan" | "chi",
  ): CallContext {
    let canRon = false;
    if (phase === "ron") {
      canRon = this.tryScore(player, tile.type, "ron", { houtei: this.liveRemaining() === 0 }) !== null;
    } else if (phase === "chankan") {
      const result = this.tryScore(player, tile.type, "ron", { chankan: true });
      canRon =
        result !== null &&
        (!chankanFromAnkan || result.yaku.every((y) => y.id === "kokushi" || y.id === "kokushi-13"));
    }
    const counts = countsOf(player.tiles);
    const canMeld = phase === "call" && !player.riichi && this.liveRemaining() > 0;
    const canPon = canMeld && callStage !== "chi" && counts[tile.type]! >= 2;
    const canKan = canMeld && callStage !== "chi" && this.kanCount < MAX_KAN_DRAWS && counts[tile.type]! >= 3;
    const chiOptions: (readonly [number, number])[] = [];
    if (canMeld && callStage !== "pon-kan" && player.seat === (fromSeat + 1) % 4 && tile.type < 27) {
      const rank = rankOf(tile.type);
      const base = suitOf(tile.type) * 9;
      const patterns: [number, number][] = [
        [rank - 2, rank - 1],
        [rank - 1, rank + 1],
        [rank + 1, rank + 2],
      ];
      for (const [r1, r2] of patterns) {
        if (r1 < 1 || r2 > 9) continue;
        const t1 = player.tiles.find((t) => t.type === base + r1 - 1);
        const t2 = player.tiles.find((t) => t.type === base + r2 - 1);
        if (t1 && t2) chiOptions.push([t1.id, t2.id]);
      }
    }
    return { phase, ...(callStage ? { callStage } : {}), tile, fromSeat, canRon, canPon, canKan, chiOptions };
  }

  /** Score a hypothetical win, or null if it is not a legal win (furiten,
   *  not tenpai, or no yaku). */
  /** All private choices on this discard, before any answers are committed. */
  claimContexts(current: CallContext, seat: Seat): CallContext[] {
    if (seat === current.fromSeat) return [];
    const player = this.players[seat]!;
    const { tile, fromSeat } = current;
    if (current.phase === "chankan") return [this.callContext(player, tile, fromSeat, "chankan")];
    const contexts = [this.callContext(player, tile, fromSeat, "ron")];
    const fourthDeclaration = this.riichiCount === 3 && !this.players[fromSeat]!.riichi &&
      this.players[fromSeat]!.discards.at(-1)?.riichiDeclaration;
    if (!fourthDeclaration && !this.pendingSuucha && !this.pendingSuukaikan) {
      contexts.push(this.callContext(player, tile, fromSeat, "call", false, "pon-kan"));
      contexts.push(this.callContext(player, tile, fromSeat, "call", false, "chi"));
    }
    return contexts;
  }

  private tryScore(
    player: PlayerState,
    winTileType: TileType,
    winType: "ron" | "tsumo",
    opts: { rinshan?: boolean; chankan?: boolean; houtei?: boolean } = {},
  ): ScoreResult | null {
    this.analyze(player);
    if (winType === "ron") {
      if (!player.waits.includes(winTileType)) return null;
      if (player.tempFuriten || player.riichiFuriten) return null;
      if (player.discards.some((d) => player.waits.includes(d.tile.type))) return null;
    } else {
      const counts = countsOf(player.tiles);
      if (this.shantenOf(counts, player.melds.length) !== -1) return null;
    }
    try {
      return scoreHand(this.buildScoreInput(player, winTileType, winType, opts));
    } catch {
      return null;
    }
  }

  private buildScoreInput(
    player: PlayerState,
    winTileType: TileType,
    winType: "ron" | "tsumo",
    opts: { rinshan?: boolean; chankan?: boolean; houtei?: boolean; winTileInstance?: Tile } = {},
  ): Parameters<typeof scoreHand>[0] {
    const allTiles: Tile[] = [...player.tiles];
    for (const meld of player.melds) allTiles.push(...meld.tiles);
    if (winType === "ron" && opts.winTileInstance) allTiles.push(opts.winTileInstance);
    const handCounts = countsOf(allTiles);
    if (winType === "ron" && !opts.winTileInstance) handCounts[winTileType]!++;

    let dora = 0;
    for (const ind of this.indicators()) {
      dora += handCounts[doraFromIndicator(ind.type)]!;
    }
    if (player.riichi) {
      for (const ind of this.uraIndicators()) {
        dora += handCounts[doraFromIndicator(ind.type)]!;
      }
    }
    for (const t of allTiles) if (t.red) dora++;

    const melds: ScoreMeld[] = player.melds.map((m) => ({
      kind: m.kind,
      tiles: m.tiles.map((t) => t.type),
    }));

    return {
      handCounts,
      melds,
      winningTileType: winTileType,
      ...(opts.winTileInstance ? { winningTile: opts.winTileInstance.id } : {}),
      winType,
      seatWind: this.seatWindOf(player.seat),
      roundWind: this.roundWind,
      riichi: player.riichi,
      doubleRiichi: player.doubleRiichi,
      ippatsu: player.ippatsu,
      haitei: winType === "tsumo" && !opts.rinshan && this.liveRemaining() === 0,
      houtei: opts.houtei === true,
      rinshan: opts.rinshan === true,
      chankan: opts.chankan === true,
      firstDrawTsumo:
        winType === "tsumo" && !opts.rinshan && player.drawCount === 1 && !this.anyCall,
      dora,
      honba: this.honba,
      riichiSticks: this.sticks,
    };
  }

  // -- kans ----------------------------------------------------------------------
  /** Declare an ankan/shouminkan; returns the rinshan draw. Handles the
   *  kandora flip timing documented at the top of this file. */
  private declareKan(player: PlayerState, kind: "ankan" | "shouminkan", tileType: TileType): Tile {
    if (kind === "ankan") {
      const kanTiles = player.tiles.filter((t) => t.type === tileType);
      player.tiles = player.tiles.filter((t) => t.type !== tileType);
      player.melds.push({ kind: "ankan", tiles: kanTiles });
    } else {
      const idx = player.melds.findIndex(
        (m) => m.kind === "pon" && m.tiles[0]!.type === tileType,
      );
      const pon = player.melds[idx]!;
      const added = player.tiles.find((t) => t.type === tileType)!;
      player.tiles = player.tiles.filter((t) => t.id !== added.id);
      player.melds[idx] = {
        kind: "shouminkan",
        tiles: [...pon.tiles, added],
        ...(pon.calledFrom !== undefined ? { calledFrom: pon.calledFrom } : {}),
        ...(pon.calledTile !== undefined ? { calledTile: pon.calledTile } : {}),
      };
    }
    this.kanCount++;
    this.kanOwners.push(player.seat);
    if (this.kanCount === 4 && new Set(this.kanOwners).size >= 2) {
      this.pendingSuukaikan = true;
    }
    this.anyCall = true;
    for (const p of this.players) p.ippatsu = false;
    this.emit("kan", { seat: player.seat, kind, tileType, kanCount: this.kanCount });

    if (kind === "ankan") this.flipIndicator();
    const tile = this.wall.deadWall[this.rinshanUsed++]!;
    player.tiles.push(tile);
    player.drawCount++;
    player.tempFuriten = false; // a replacement draw is still the player's draw
    this.emit("draw", { seat: player.seat, tile: tile.id, rinshan: true });
    if (kind === "shouminkan") this.flipIndicator();
    this.analyze(player);
    return tile;
  }

  private flipIndicator(): void {
    if (this.indicatorsRevealed < 5) {
      this.indicatorsRevealed++;
      this.emit("indicator", { indicators: this.indicators().map((t) => t.id) });
    }
  }

  /** Chankan window after a shouminkan declaration. Returns the robbing
   *  player (head-bump order) or null. The kan has NOT been applied yet. */
  private *chankanWindow(kanPlayer: PlayerState, tileType: TileType): Decisions<PlayerState | null> {
    for (let i = 1; i <= 3; i++) {
      const seat = (kanPlayer.seat + i) % 4;
      const player = this.players[seat]!;
      const ctx = this.callContext(player, { id: -1, type: tileType, red: false }, kanPlayer.seat, "chankan");
      if (!ctx.canRon) continue;
      const action = (yield { kind: "call", view: this.viewFor(seat), context: copyCallContext(ctx) }) as CallAction;
      if (action.type === "ron") return player;
      if (action.type !== "pass") {
        throw new Error(`Seat ${seat}: ${action.type} not allowed in the chankan window`);
      }
      // A passed robbing chance is a passed ron: furiten applies.
      player.tempFuriten = true;
      if (player.riichi) player.riichiFuriten = true;
    }
    return null;
  }

  // -- the discard window ---------------------------------------------------------
  private *resolveDiscardWindow(
    discarder: Seat,
    tile: Tile,
    declareRiichi = false,
  ): Decisions<{ kind: "none" } | { kind: "handOver" } | { kind: "call"; seat: Seat; drawnTile: Tile | null }> {
    // Ron pass — turn order from the discarder; first declaration takes the
    // head bump. A pass on a legal ron sets (riichi-)furiten.
    for (let i = 1; i <= 3; i++) {
      const seat = (discarder + i) % 4;
      const player = this.players[seat]!;
      const ctx = this.callContext(player, tile, discarder, "ron");
      if (!ctx.canRon) {
        // Declining a hand-completing discard imposes temporary furiten
        // even if the completed hand has no yaku and ron cannot be offered.
        if (player.waits.includes(tile.type)) {
          player.tempFuriten = true;
          if (player.riichi) player.riichiFuriten = true;
        }
        continue;
      }
      const action = (yield { kind: "call", view: this.viewFor(seat), context: copyCallContext(ctx) }) as CallAction;
      if (action.type === "ron") {
        this.resolveRon(player, tile.type, discarder, {
          houtei: this.liveRemaining() === 0,
          winTileInstance: tile,
        });
        return { kind: "handOver" };
      }
      if (action.type !== "pass") {
        throw new Error(`Seat ${seat}: ${action.type} not allowed in the ron window`);
      }
      player.tempFuriten = true;
      if (player.riichi) player.riichiFuriten = true;
    }

    // A riichi declaration is established only after its discard survives
    // ron. If it deals in, the declarer keeps the 1,000 and no stick enters
    // the pot. Calling the tile for a meld still accepts the declaration.
    if (declareRiichi) {
      const player = this.players[discarder]!;
      this.emitScore(discarder, -1000);
      this.sticks++;
      player.riichi = true;
      player.doubleRiichi = player.drawCount === 1 && !this.anyCall;
      player.ippatsu = true;
      this.riichiCount++;
      if (this.riichiCount === 4) this.pendingSuucha = true;
      this.emit("riichi", { seat: discarder, double: player.doubleRiichi });
    }

    // A fourth-kan/four-riichi abort can be interrupted by ron, never
    // postponed by another meld call on the replacement discard.
    if (this.pendingSuucha) {
      this.resolveAbortive("suucha-riichi");
      return { kind: "handOver" };
    }
    if (this.pendingSuukaikan) {
      this.resolveAbortive("suukaikan");
      return { kind: "handOver" };
    }

    // Pon / daiminkan pass.
    for (let i = 1; i <= 3; i++) {
      const seat = (discarder + i) % 4;
      const player = this.players[seat]!;
      const ctx = this.callContext(player, tile, discarder, "call", false, "pon-kan");
      if (!ctx.canPon && !ctx.canKan) continue;
      const action = (yield { kind: "call", view: this.viewFor(seat), context: copyCallContext(ctx) }) as CallAction;
      if (action.type === "pon") {
        if (!ctx.canPon) throw new Error(`Seat ${seat}: pon not legal`);
        this.formCallMeld(player, discarder, tile, "pon");
        return { kind: "call", seat, drawnTile: null };
      }
      if (action.type === "daiminkan") {
        if (!ctx.canKan) throw new Error(`Seat ${seat}: daiminkan not legal`);
        const drawn = this.formCallMeld(player, discarder, tile, "daiminkan");
        return { kind: "call", seat, drawnTile: drawn };
      }
      if (action.type === "chi") {
        throw new Error(`Seat ${seat}: chi is decided after pon/kan`);
      }
      if (action.type !== "pass") {
        throw new Error(`Seat ${seat}: ${action.type} not allowed in the call window`);
      }
    }

    // Chi pass — only the next player in turn order.
    {
      const seat = (discarder + 1) % 4;
      const player = this.players[seat]!;
      const ctx = this.callContext(player, tile, discarder, "call", false, "chi");
      if (ctx.chiOptions.length > 0) {
        const action = (yield { kind: "call", view: this.viewFor(seat), context: copyCallContext(ctx) }) as CallAction;
        if (action.type === "chi") {
          const wanted = [...action.tileIds].sort().join(",");
          const ok = ctx.chiOptions.some((o) => [...o].sort().join(",") === wanted);
          if (!ok) throw new Error(`Seat ${seat}: chi tiles do not form a sequence with the discard`);
          this.formCallMeld(player, discarder, tile, "chi", action.tileIds);
          return { kind: "call", seat, drawnTile: null };
        }
        if (action.type !== "pass") {
          throw new Error(`Seat ${seat}: ${action.type} not allowed in the chi window`);
        }
      }
    }

    // No call: abortive draws that were pending on this discard now fire.
    if (
      !this.anyCall && this.firstDiscards.length === 4 &&
      this.firstDiscards.every((t) => t === this.firstDiscards[0] && isWind(t))
    ) {
      this.resolveAbortive("suufon-renda");
      return { kind: "handOver" };
    }

    if (this.liveRemaining() === 0) {
      this.resolveExhaustive();
      return { kind: "handOver" };
    }
    return { kind: "none" };
  }

  /** Form a pon/chi/daiminkan meld from a called discard. For daiminkan,
   *  draws and returns the rinshan tile (and flips the kandora after the
   *  draw, per the documented timing). */
  private formCallMeld(
    player: PlayerState,
    discarder: Seat,
    tile: Tile,
    kind: "pon" | "chi" | "daiminkan",
    chiTileIds?: readonly [number, number],
  ): Tile | null {
    const pond = this.players[discarder]!.discards;
    pond[pond.length - 1]!.called = true;
    this.anyCall = true;
    for (const p of this.players) p.ippatsu = false; // any call voids ippatsu
    if (kind === "pon") {
      const taken = player.tiles.filter((t) => t.type === tile.type).slice(0, 2);
      player.tiles = player.tiles.filter((t) => !taken.includes(t));
      player.melds.push({ kind: "pon", tiles: [tile, ...taken], calledFrom: discarder, calledTile: tile });
      this.emit("call", { seat: player.seat, kind: "pon", tileType: tile.type, fromSeat: discarder });
    } else if (kind === "chi") {
      const taken = chiTileIds!.map((id) => player.tiles.find((t) => t.id === id)!);
      player.tiles = player.tiles.filter((t) => !taken.includes(t));
      const meldTiles = [tile, ...taken].sort((a, b) => a.type - b.type);
      player.melds.push({ kind: "chi", tiles: meldTiles, calledFrom: discarder, calledTile: tile });
      this.emit("call", { seat: player.seat, kind: "chi", tileType: tile.type, fromSeat: discarder });
    } else {
      const taken = player.tiles.filter((t) => t.type === tile.type).slice(0, 3);
      player.tiles = player.tiles.filter((t) => !taken.includes(t));
      player.melds.push({ kind: "daiminkan", tiles: [tile, ...taken], calledFrom: discarder, calledTile: tile });
      this.kanCount++;
      this.kanOwners.push(player.seat);
      if (this.kanCount === 4 && new Set(this.kanOwners).size >= 2) {
        this.pendingSuukaikan = true;
      }
      this.emit("call", { seat: player.seat, kind: "daiminkan", tileType: tile.type, fromSeat: discarder });
      this.emit("kan", { seat: player.seat, kind: "daiminkan", tileType: tile.type, kanCount: this.kanCount });
      const drawn = this.wall.deadWall[this.rinshanUsed++]!;
      player.tiles.push(drawn);
      player.drawCount++;
      player.tempFuriten = false;
      this.emit("draw", { seat: player.seat, tile: drawn.id, rinshan: true });
      this.flipIndicator();
      this.analyze(player);
      return drawn;
    }
    this.analyze(player);
    return null;
  }

  // -- resolutions ------------------------------------------------------------------
  private resolveTsumo(player: PlayerState, drawnTile: Tile, rinshan: boolean): void {
    const result = scoreHand(
      this.buildScoreInput(player, drawnTile.type, "tsumo", { rinshan }),
    );
    const isDealerWin = player.seat === this.dealer;
    const payments: { seat: Seat; amount: number }[] = [];
    let gained = result.stickPoints;
    for (const other of this.players) {
      if (other.seat === player.seat) continue;
      const amount = isDealerWin
        ? result.tsumoPoints!.nonDealer
        : other.seat === this.dealer
          ? result.tsumoPoints!.dealer
          : result.tsumoPoints!.nonDealer;
      payments.push({ seat: other.seat, amount });
      gained += amount;
    }
    for (const p of payments) this.emitScore(p.seat, -p.amount);
    this.emitScore(player.seat, gained);
    this.sticks = 0;
    this.emit("win", {
      seat: player.seat,
      winType: "tsumo",
      winningTile: drawnTile.id,
      yaku: result.yaku.map((y) => y.id),
      yakuDetails: result.yaku.map((y) => ({ ...y })),
      dora: result.dora,
      han: result.han,
      fu: result.fu,
      yakumanMultiple: result.yakumanMultiple,
      payments,
      stickPoints: result.stickPoints,
    });
    this.endHandAfterWin(player.seat);
  }

  private resolveRon(
    winner: PlayerState,
    winTileType: TileType,
    fromSeat: Seat,
    opts: { chankan?: boolean; houtei?: boolean; winTileInstance?: Tile },
  ): void {
    const result = scoreHand(
      this.buildScoreInput(winner, winTileType, "ron", opts),
    );
    const amount = result.ronPoints!;
    this.emitScore(fromSeat, -amount);
    this.emitScore(winner.seat, amount + result.stickPoints);
    this.sticks = 0;
    this.emit("win", {
      seat: winner.seat,
      winType: "ron",
      fromSeat,
      winningTileType: winTileType,
      chankan: opts.chankan === true,
      yaku: result.yaku.map((y) => y.id),
      yakuDetails: result.yaku.map((y) => ({ ...y })),
      dora: result.dora,
      han: result.han,
      fu: result.fu,
      yakumanMultiple: result.yakumanMultiple,
      payments: [{ seat: fromSeat, amount }],
      stickPoints: result.stickPoints,
    });
    this.endHandAfterWin(winner.seat);
  }

  private endHandAfterWin(winnerSeat: Seat): void {
    const renchan = winnerSeat === this.dealer;
    this.honba = renchan ? this.honba + 1 : 0;
    this.emit("hand-end", { reason: "win", winner: winnerSeat, renchan });
    this.advance(renchan);
  }

  private resolveExhaustive(): void {
    for (const p of this.players) this.analyze(p);
    const tenpai = this.players.filter((p) => p.shantenNow === 0).map((p) => p.seat);
    const nagashi = this.players
      .filter(
        (p) =>
          p.discards.length > 0 &&
          p.discards.every((d) => isTerminalOrHonor(d.tile.type) && !d.called),
      )
      .map((p) => p.seat);

    this.emit("drawn-hand", { kind: "exhaustive", tenpai, nagashi });

    if (nagashi.length > 0) {
      // Nagashi mangan pays like a mangan tsumo and replaces the
      // tenpai/noten exchange.
      for (const seat of nagashi) {
        const isDealerNagashi = seat === this.dealer;
        for (const other of this.players) {
          if (other.seat === seat) continue;
          const base = isDealerNagashi ? 4000 : other.seat === this.dealer ? 4000 : 2000;
          this.emitScore(other.seat, -(base + 100 * this.honba));
          this.emitScore(seat, base + 100 * this.honba);
        }
      }
    } else if (tenpai.length > 0 && tenpai.length < 4) {
      const gain = 3000 / tenpai.length;
      const loss = 3000 / (4 - tenpai.length);
      for (const p of this.players) {
        this.emitScore(p.seat, tenpai.includes(p.seat) ? gain : -loss);
      }
    }

    const renchan = tenpai.includes(this.dealer) || nagashi.includes(this.dealer);
    this.honba++;
    this.emit("hand-end", { reason: "exhaustive-draw", renchan, tenpai, nagashi });
    this.advance(renchan);
  }

  private resolveAbortive(kind: string): void {
    this.emit("drawn-hand", { kind: "abortive", abortive: kind });
    this.honba++;
    this.emit("hand-end", { reason: "abortive-draw", abortive: kind, renchan: true });
    this.advance(true);
  }

  /** Move to the next hand, or end the game (tobi, or the final kyoku
   *  ended without a dealer repeat). */
  private advance(renchan: boolean): void {
    if (this.scores.some((s) => s < 0)) {
      this.gameOver = true;
      return;
    }
    const maxRound = this.length === "east" ? 0 : 1;
    const isFinalKyoku = this.roundIndex === maxRound && this.kyoku === 4;
    if (isFinalKyoku && !renchan) {
      this.gameOver = true;
      return;
    }
    if (!renchan) {
      this.dealer = (this.dealer + 1) % 4;
      this.kyoku++;
      if (this.kyoku > 4) {
        this.kyoku = 1;
        this.roundIndex++;
      }
    }
  }
}

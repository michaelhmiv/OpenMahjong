/** Deterministic Chinese-family coordinator. Adapters own rule decisions;
 * this controller does not execute or configure the Riichi state machine. */
import { createRng } from "../rng.js";
import type {
  CallAction,
  CallContext,
  GameEvent,
  GameEventType,
  MeldState,
  Policy,
  TurnAction,
  TurnContext,
} from "../game.js";
import type { Tile } from "../tiles.js";
import type {
  VariantAdapter,
  VariantGameResult,
  VariantLength,
  VariantPublicState,
  VariantPublicView,
  VariantScore,
  VariantScoreInput,
  VariantSeatState,
} from "./types.js";
import { createTaiwaneseAdapter } from "./taiwanese.js";
import { MCR } from "./mcr.js";
import { HONG_KONG } from "./hong-kong.js";

export function variantAdapter(id: string, version = 1): VariantAdapter {
  if (version !== 1) throw new Error("Unsupported variant profile version");
  if (id === "hong-kong" || id === "openmahjong-hkos") return HONG_KONG;
  if (id === "mcr" || id === "openmahjong-mcr-2006") return MCR;
  if (id === "taiwanese" || id === "openmahjong-taiwanese-every-flower")
    return createTaiwaneseAdapter();
  throw new Error("Unsupported variant profile");
}
export type VariantRequest =
  | {
      readonly kind: "turn";
      readonly view: VariantPublicView;
      readonly context: TurnContext;
    }
  | {
      readonly kind: "call";
      readonly view: VariantPublicView;
      readonly context: CallContext;
    };
export function assertVariantAction(
  request: VariantRequest,
  action: TurnAction | CallAction,
): void {
  if (request.kind === "turn") {
    const c = request.context;
    if (
      action.type === "discard" &&
      !action.riichi &&
      request.view.legalDiscardIds.includes(action.tileId) &&
      request.view.hand.some((t) => t.id === action.tileId)
    )
      return;
    if (action.type === "tsumo" && c.canTsumo) return;
    if (action.type === "ankan" && c.ankanOptions.includes(action.tileType))
      return;
    if (
      action.type === "shouminkan" &&
      c.shouminkanOptions.includes(action.tileType)
    )
      return;
  } else {
    const c = request.context;
    if (action.type === "pass") return;
    if (action.type === "ron" && c.canRon) return;
    if (action.type === "pon" && c.canPon) return;
    if (action.type === "daiminkan" && c.canKan) return;
    if (
      action.type === "chi" &&
      c.chiOptions.some(
        ([a, b]) => a === action.tileIds[0] && b === action.tileIds[1],
      )
    )
      return;
  }
  throw new Error("Illegal variant action");
}
export interface VariantGameOptions {
  readonly seed: string;
  readonly variant: string;
  readonly profileVersion?: number;
  readonly length?: VariantLength;
  readonly policies?: readonly Policy[];
  readonly wallFactory?: (hand: number) => readonly Tile[];
}
export class VariantGame implements VariantPublicState {
  readonly events: GameEvent[] = [];
  readonly players: VariantSeatState[] = [];
  readonly adapter: VariantAdapter;
  readonly length: VariantLength;
  dealer = 0;
  roundWind = 27;
  kyoku = 1;
  dealerRepeats = 0;
  currentTurn = 0;
  private wall: Tile[] = [];
  private head = 0;
  private tail = 0;
  private serial = 0;
  private anyCall = false;
  private lastFrontDraw: number | undefined;
  private lastDrawKind: "ordinary" | "quad" | "flower" = "ordinary";
  private dealerFirstTile: Tile | null = null;
  constructor(readonly options: VariantGameOptions) {
    this.adapter = variantAdapter(options.variant, options.profileVersion ?? 1);
    this.length = options.length ?? "full";
    if (
      !["east", "south", "full"].includes(this.length) ||
      typeof options.seed !== "string" ||
      !options.seed.length ||
      options.seed.length > 128
    )
      throw new Error("Invalid variant game options");
    for (let seat = 0; seat < 4; seat++)
      this.players.push({
        seat,
        tiles: [],
        melds: [],
        flowers: [],
        discards: [],
        score: this.adapter.startingScore,
        draws: 0,
      });
  }
  get wallRemaining(): number {
    return Math.max(0, this.tail - this.head + 1 - this.adapter.reserve);
  }
  private emit(
    type: GameEventType,
    fields: Record<string, unknown> = {},
  ): void {
    this.events.push({ seq: this.events.length, type, ...fields });
  }
  private remove(seat: number, id: number): Tile {
    const p = this.players[seat]!,
      i = p.tiles.findIndex((t) => t.id === id);
    if (i < 0) throw new Error("Tile not held");
    return p.tiles.splice(i, 1)[0]!;
  }
  private scoreInput(
    seat: number,
    tile: Tile,
    selfDraw: boolean,
    replacement: boolean,
    robbingQuad: boolean,
  ): VariantScoreInput {
    const p = this.players[seat]!,
      counts = new Array<number>(34).fill(0);
    p.tiles.forEach((t) => counts[t.type]!++);
    p.melds.forEach((m) => m.tiles.forEach((t) => counts[t.type]!++));
    if (!selfDraw) counts[tile.type]!++;
    const visible = this.adapter
      .publicView(this, seat)
      .players.reduce(
        (n, q) =>
          n +
          q.discards.filter((d) => !d.called && d.tile.type === tile.type)
            .length +
          q.melds.reduce(
            (a, m) => a + m.tiles.filter((t) => t.type === tile.type).length,
            0,
          ),
        0,
      );
    return {
      counts,
      melds: p.melds.map((m) => ({
        kind: m.kind,
        tiles: m.tiles.map((t) => t.type),
      })),
      winningTile: tile.type,
      selfDraw,
      seatWind: 27 + ((seat - this.dealer + 4) % 4),
      roundWind: this.roundWind,
      flowers: p.flowers.map((t) => t.type),
      replacement,
      robbingQuad,
      lastWall:
        !replacement &&
        this.wallRemaining === 0 &&
        (!selfDraw || this.lastFrontDraw === tile.id),
      initial: selfDraw && p.draws === 1 && !this.anyCall,
      lastCopy: visible - (selfDraw || robbingQuad ? 0 : 1) >= 3,
    };
  }
  private winning(
    seat: number,
    tile: Tile,
    selfDraw: boolean,
    replacement = false,
    robbing = false,
  ): VariantScore | null {
    const result = this.adapter.score(
      this.scoreInput(seat, tile, selfDraw, replacement, robbing),
    );
    return result.eligible ? result : null;
  }
  private draw(seat: number, replacement: boolean): Tile | null {
    this.adapter.onDraw?.(this, seat, replacement);
    const p = this.players[seat]!;
    let drawKind: "ordinary" | "quad" | "flower" = replacement
      ? "quad"
      : "ordinary";
    this.lastDrawKind = "ordinary";
    while (this.wallRemaining > 0) {
      const tile = this.wall[replacement ? this.tail-- : this.head++]!;
      p.tiles.push(tile);
      this.emit("draw", {
        seat,
        tile: tile.id,
        rinshan: replacement,
        wallRemaining: this.wallRemaining,
      });
      if (tile.type < 34) {
        p.draws++;
        this.lastFrontDraw = replacement ? undefined : tile.id;
        this.lastDrawKind = drawKind;
        return tile;
      }
      this.remove(seat, tile.id);
      p.flowers.push(tile);
      this.emit("flower", {
        seat,
        tile: tile.id,
        wallRemaining: this.wallRemaining,
      });
      replacement = true;
      drawKind = "flower";
    }
    return null;
  }
  private prepareHand(): boolean {
    const a = this.adapter;
    a.onHandStart?.();
    this.anyCall = false;
    this.currentTurn = this.dealer;
    for (const p of this.players) {
      p.tiles = [];
      p.melds = [];
      p.flowers = [];
      p.discards = [];
      p.draws = 0;
    }
    this.wall = [
      ...(this.options.wallFactory?.(this.serial) ??
        createRng(
          `${this.options.seed}:${a.profileId}:hand:${this.serial}`,
        ).shuffle(a.inventory())),
    ];
    const canonical = a.inventory();
    if (
      this.wall.length !== canonical.length ||
      new Set(this.wall.map((t) => t.id)).size !== canonical.length ||
      this.wall.some((t) => {
        const expected = canonical[t.id];
        return !expected || t.type !== expected.type || t.red !== expected.red;
      })
    )
      throw new Error("Invalid variant tile inventory");
    this.head = 0;
    this.tail = this.wall.length - 1;
    this.emit("hand-start", {
      roundWind: this.roundWind,
      kyoku: this.kyoku,
      dealer: this.dealer,
      honba: this.dealerRepeats,
      sticks: 0,
      wallRemaining: this.wall.length - 4 * a.standingTiles - a.reserve,
      standingTiles: a.standingTiles,
    });
    // Packet deal in turn order. Initial flowers are recorded in the deal,
    // then exposed and replaced in dealer order before the first turn.
    for (let packet = 0; packet < Math.floor(a.standingTiles / 4); packet++)
      for (let r = 0; r < 4; r++)
        for (let n = 0; n < 4; n++)
          this.players[(this.dealer + r) % 4]!.tiles.push(
            this.wall[this.head++]!,
          );
    for (let r = 0; r < 4; r++)
      for (
        let n = 4 * Math.floor(a.standingTiles / 4);
        n < a.standingTiles;
        n++
      )
        this.players[(this.dealer + r) % 4]!.tiles.push(
          this.wall[this.head++]!,
        );
    for (const p of this.players)
      this.emit("deal", { seat: p.seat, tiles: p.tiles.map((t) => t.id) });
    // The dealer's extra tile belongs to the initial deal, before flower
    // replacement. In particular, a flower here joins the dealer's first
    // replacement pass instead of changing everyone else's tail draws.
    const door = this.wall[this.head++]!;
    this.players[this.dealer]!.tiles.push(door);
    this.dealerFirstTile = door;
    this.emit("draw", {
      seat: this.dealer,
      tile: door.id,
      rinshan: false,
      wallRemaining: this.wallRemaining,
    });
    if (a.initialFlowerPasses) {
      // A replacement flower waits for the next dealer-ordered pass.
      while (this.players.some((p) => p.tiles.some((t) => t.type >= 34)))
        for (let r = 0; r < 4; r++) {
          const p = this.players[(this.dealer + r) % 4]!;
          for (const flower of [...p.tiles].filter((t) => t.type >= 34)) {
            this.remove(p.seat, flower.id);
            p.flowers.push(flower);
            this.emit("flower", {
              seat: p.seat,
              tile: flower.id,
              wallRemaining: this.wallRemaining,
            });
            if (this.wallRemaining <= 0) return false;
            const replacement = this.wall[this.tail--]!;
            p.tiles.push(replacement);
            this.emit("draw", {
              seat: p.seat,
              tile: replacement.id,
              rinshan: true,
              wallRemaining: this.wallRemaining,
            });
          }
        }
      return true;
    }
    for (let r = 0; r < 4; r++) {
      const p = this.players[(this.dealer + r) % 4]!;
      for (const flower of [...p.tiles].filter((t) => t.type >= 34)) {
        this.remove(p.seat, flower.id);
        p.flowers.push(flower);
        this.emit("flower", {
          seat: p.seat,
          tile: flower.id,
          wallRemaining: this.wallRemaining,
        });
        if (!this.draw(p.seat, true)) return false;
        // Flower replacement while dealing is not a player's first turn.
        p.draws = 0;
      }
    }
    return true;
  }
  private *askTurn(
    seat: number,
    drawn: Tile | null,
    replacement: boolean,
  ): Generator<VariantRequest, TurnAction, TurnAction | CallAction> {
    const canWin = drawn
      ? !!this.winning(seat, drawn, true, replacement)
      : false;
    const request: VariantRequest = {
      kind: "turn",
      view: this.adapter.publicView(this, seat),
      context: this.adapter.turnContext(this, seat, drawn, replacement, canWin),
    };
    const action = yield request;
    assertVariantAction(request, action);
    this.adapter.onTurn?.(this, seat, request.context, action as TurnAction);
    return action as TurnAction;
  }
  private *askCall(
    seat: number,
    from: number,
    tile: Tile,
    stage: "ron" | "chankan" | "pon-kan" | "chi",
    canWin: boolean,
  ): Generator<VariantRequest, CallAction, TurnAction | CallAction> {
    const context = this.adapter.callContext(
      this,
      seat,
      from,
      tile,
      stage,
      canWin,
    );
    if (
      !context.canRon &&
      !context.canPon &&
      !context.canKan &&
      !context.chiOptions.length
    )
      return { type: "pass" };
    const request: VariantRequest = {
      kind: "call",
      view: this.adapter.publicView(this, seat),
      context,
    };
    const action = yield request;
    assertVariantAction(request, action);
    this.adapter.onCall?.(this, seat, request.context, action as CallAction);
    return action as CallAction;
  }
  private settleWin(
    seat: number,
    from: number,
    tile: Tile,
    selfDraw: boolean,
    replacement: boolean,
    robbing = false,
  ): void {
    const score = this.winning(seat, tile, selfDraw, replacement, robbing);
    if (!score) throw new Error("Ineligible variant win");
    const payments = this.adapter.payments(score, {
      winner: seat,
      payer: from,
      selfDraw,
      dealer: this.dealer,
      dealerRepeats: this.dealerRepeats,
    });
    for (const p of payments) {
      this.players[p.seat]!.score -= p.amount;
      this.emit("score", {
        seat: p.seat,
        delta: -p.amount,
        score: this.players[p.seat]!.score,
      });
    }
    const gain = payments.reduce((n, p) => n + p.amount, 0);
    this.players[seat]!.score += gain;
    this.emit("score", { seat, delta: gain, score: this.players[seat]!.score });
    this.emit("win", {
      seat,
      winType: selfDraw ? "tsumo" : "ron",
      ...(!selfDraw ? { fromSeat: from } : {}),
      winningTile: tile.id,
      winningTileType: tile.type,
      yaku: score.patterns.map((p) => p.id),
      yakuDetails: score.patterns.map((p) => ({ id: p.id, han: p.units })),
      han: score.units,
      fu: 0,
      yakumanMultiple: 0,
      payments,
      stickPoints: 0,
      variant: this.adapter.variant,
      patterns: score.patterns,
      qualifyingUnits: score.qualifyingUnits,
    });
  }
  private *rob(
    seat: number,
    tile: Tile,
  ): Generator<VariantRequest, number | null, TurnAction | CallAction> {
    for (let r = 1; r < 4; r++) {
      const other = (seat + r) % 4;
      if (this.winning(other, tile, false, false, true)) {
        const action = yield* this.askCall(other, seat, tile, "chankan", true);
        if (action.type === "ron") {
          this.remove(seat, tile.id);
          this.emit("robbed-kong", { seat, tile: tile.id });
          this.settleWin(other, seat, tile, false, false, true);
          return other;
        }
      }
    }
    return null;
  }
  private formCall(
    seat: number,
    from: number,
    tile: Tile,
    action: CallAction,
  ): Tile | null {
    const p = this.players[seat]!,
      kind = action.type as "chi" | "pon" | "daiminkan";
    const ids =
      action.type === "chi"
        ? [...action.tileIds]
        : p.tiles
            .filter((t) => t.type === tile.type)
            .slice(0, kind === "pon" ? 2 : 3)
            .map((t) => t.id);
    const taken = ids.map((id) => this.remove(seat, id));
    const meld: MeldState = {
      kind,
      tiles: [tile, ...taken].sort((a, b) => a.type - b.type || a.id - b.id),
      calledFrom: from,
      calledTile: tile,
    };
    p.melds.push(meld);
    this.adapter.onClaim?.(this, seat, from, tile, action);
    this.players[from]!.discards.at(-1)!.called = true;
    this.anyCall = true;
    this.emit("call", {
      seat,
      fromSeat: from,
      tileType: tile.type,
      kind,
      tileIds: ids,
    });
    if (kind === "daiminkan") {
      this.emit("kan", { seat, kind, tileType: tile.type });
      return this.draw(seat, true);
    }
    return null;
  }
  private *hand(): Generator<
    VariantRequest,
    number | null,
    TurnAction | CallAction
  > {
    if (!this.prepareHand()) return null;
    const dealer = this.players[this.dealer]!;
    const first =
      this.dealerFirstTile!.type < 34
        ? this.dealerFirstTile!
        : dealer.tiles.at(-1)!;
    dealer.draws = 1;
    this.lastDrawKind = "ordinary";
    this.lastFrontDraw = this.dealerFirstTile!.type < 34 ? first.id : undefined;
    let seat = this.dealer,
      drawn: Tile | null = first,
      replacement = false;
    while (
      drawn ||
      this.players[seat]!.tiles.length +
        3 * this.players[seat]!.melds.length ===
        this.adapter.standingTiles + 1
    ) {
      this.currentTurn = seat;
      const action = yield* this.askTurn(seat, drawn, replacement),
        p = this.players[seat]!;
      if (action.type === "tsumo") {
        this.settleWin(seat, seat, drawn!, true, replacement);
        return seat;
      }
      if (action.type === "ankan" || action.type === "shouminkan") {
        this.anyCall = true;
        if (action.type === "shouminkan") {
          const added = p.tiles.find((t) => t.type === action.tileType)!;
          const robbed = yield* this.rob(seat, added);
          if (robbed !== null) return robbed;
          const i = p.melds.findIndex(
            (m) => m.kind === "pon" && m.tiles[0]!.type === action.tileType,
          );
          const prior = p.melds[i]!;
          p.melds[i] = {
            ...prior,
            kind: "shouminkan",
            tiles: [...prior.tiles, this.remove(seat, added.id)],
          };
        } else {
          const ids = p.tiles
            .filter((t) => t.type === action.tileType)
            .map((t) => t.id);
          p.melds.push({
            kind: "ankan",
            tiles: ids.map((id) => this.remove(seat, id)),
          });
        }
        this.emit("kan", {
          seat,
          kind: action.type,
          tileType: action.tileType,
        });
        drawn = this.draw(seat, true);
        replacement = this.adapter.replacementBonus(this.lastDrawKind);
        continue;
      }
      if (action.type !== "discard") throw new Error("Expected discard");
      const tile = this.remove(seat, action.tileId);
      this.adapter.onDiscard?.(this, seat, tile);
      p.discards.push({ tile, called: false, riichiDeclaration: false });
      this.emit("discard", {
        seat,
        tile: tile.id,
        riichi: false,
        tsumogiri: drawn?.id === tile.id,
      });
      for (let r = 1; r < 4; r++) {
        const other = (seat + r) % 4;
        if (this.winning(other, tile, false)) {
          const response = yield* this.askCall(other, seat, tile, "ron", true);
          if (response.type === "ron") {
            this.settleWin(other, seat, tile, false, false);
            return other;
          }
        }
      }
      let claimed = false;
      for (let r = 1; r < 4; r++) {
        const other = (seat + r) % 4,
          response = yield* this.askCall(other, seat, tile, "pon-kan", false);
        if (response.type === "pon" || response.type === "daiminkan") {
          drawn = this.formCall(other, seat, tile, response);
          replacement =
            response.type === "daiminkan" &&
            this.adapter.replacementBonus(this.lastDrawKind);
          seat = other;
          claimed = true;
          break;
        }
      }
      if (claimed) continue;
      const other = (seat + 1) % 4,
        response = yield* this.askCall(other, seat, tile, "chi", false);
      if (response.type === "chi") {
        this.formCall(other, seat, tile, response);
        seat = other;
        drawn = null;
        replacement = false;
        continue;
      }
      seat = (seat + 1) % 4;
      drawn = this.draw(seat, false);
      replacement = this.adapter.replacementBonus(this.lastDrawKind);
    }
    return null;
  }
  *play(): Generator<
    VariantRequest,
    VariantGameResult,
    TurnAction | CallAction
  > {
    if (this.events.length)
      throw new Error("A variant game can only be started once");
    this.emit("game-start", {
      seed: this.options.seed,
      length: this.length,
      variant: this.adapter.variant,
      ruleset: { id: this.adapter.profileId, version: 1 },
      engineVersion: 3,
      scores: this.players.map((p) => p.score),
    });
    const rounds = this.length === "east" ? 1 : this.length === "south" ? 2 : 4;
    while (this.roundWind < 27 + rounds) {
      if (this.serial >= 512)
        throw new Error("Variant match exceeds the supported hand bound");
      const winner = yield* this.hand();
      if (winner === null)
        this.emit("drawn-hand", {
          kind: "exhaustive",
          tenpai: [],
          nagashi: [],
          variant: this.adapter.variant,
        });
      const progression = this.adapter.progression(
        winner,
        this.dealer,
        this.dealerRepeats,
      );
      this.emit("hand-end", {
        reason: winner === null ? "exhaustive" : "win",
        renchan: progression.repeat,
        honba: progression.repeats,
      });
      this.dealerRepeats = progression.repeats;
      this.serial++;
      if (!progression.repeat) {
        this.dealer = (this.dealer + 1) % 4;
        this.kyoku++;
        if (this.kyoku === 5) {
          this.kyoku = 1;
          this.roundWind++;
        }
      }
      if (
        this.players.reduce((n, p) => n + p.score, 0) !==
        4 * this.adapter.startingScore
      )
        throw new Error("Variant points were not conserved");
    }
    const scores = this.players.map((p) => p.score),
      settlement = scores.map((score, seat) => ({
        seat,
        score,
        rank: 1 + scores.filter((s) => s > score).length,
        points: score - this.adapter.startingScore,
      }));
    this.emit("game-end", { scores, settlement });
    return {
      scores,
      settlement,
      events: this.events,
      handsPlayed: this.serial,
    };
  }
  run(): VariantGameResult {
    if (this.options.policies?.length !== 4)
      throw new Error("Four seat policies required");
    const iterator = this.play();
    let next = iterator.next();
    while (!next.done) {
      const req = next.value,
        policy = this.options.policies[req.view.seat]!;
      next = iterator.next(
        req.kind === "turn"
          ? policy.turn(req.view, req.context)
          : policy.call(req.view, req.context),
      );
    }
    return next.value;
  }
}

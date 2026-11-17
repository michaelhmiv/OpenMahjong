import type {
  CallAction,
  CallContext,
  GameEvent,
  MeldState,
  PlayerView,
  TurnAction,
  TurnContext,
} from "../game.js";
import type { Meld } from "../scoring.js";
import type { Tile } from "../tiles.js";

export type VariantId = "hong-kong" | "mcr" | "taiwanese";
export type VariantLength = "east" | "south" | "full";
export interface VariantPattern {
  readonly id: string;
  readonly name: string;
  readonly units: number;
}
export interface VariantScoreInput {
  readonly counts: readonly number[];
  readonly melds: readonly Meld[];
  readonly winningTile: number;
  readonly selfDraw: boolean;
  readonly seatWind: number;
  readonly roundWind: number;
  readonly flowers: readonly number[];
  readonly replacement: boolean;
  readonly robbingQuad: boolean;
  readonly lastWall: boolean;
  readonly initial: boolean;
  readonly lastCopy: boolean;
}
export interface VariantScore {
  readonly units: number;
  readonly qualifyingUnits: number;
  readonly patterns: readonly VariantPattern[];
  readonly eligible: boolean;
}
export interface VariantPaymentContext {
  readonly winner: number;
  readonly payer: number;
  readonly selfDraw: boolean;
  readonly dealer: number;
  readonly dealerRepeats: number;
}
export interface VariantPublicView extends PlayerView {
  readonly variant: VariantId;
  readonly profile: { readonly id: string; readonly version: 1 };
  readonly standingTiles: number;
  readonly winningSets: number;
  readonly dealerRepeats: number;
  readonly legalDiscardIds: readonly number[];
  readonly winRestriction?: string | undefined;
  readonly flowerTiles: readonly (readonly Tile[])[];
}
export interface VariantSeatState {
  seat: number;
  tiles: Tile[];
  melds: MeldState[];
  flowers: Tile[];
  discards: { tile: Tile; called: boolean; riichiDeclaration: false }[];
  score: number;
  draws: number;
}
export interface VariantPublicState {
  readonly players: readonly VariantSeatState[];
  readonly dealer: number;
  readonly roundWind: number;
  readonly kyoku: number;
  readonly dealerRepeats: number;
  readonly wallRemaining: number;
  readonly currentTurn: number;
}
export interface VariantAdapter {
  readonly variant: VariantId;
  readonly profileId: string;
  readonly version: 1;
  readonly standingTiles: number;
  readonly sets: number;
  readonly startingScore: number;
  readonly reserve: number;
  readonly concealedQuadsFaceDown: boolean;
  readonly initialFlowerPasses?: boolean;
  replacementBonus(kind: "ordinary" | "quad" | "flower"): boolean;
  onHandStart?(): void;
  onDraw?(state: VariantPublicState, seat: number, replacement: boolean): void;
  onTurn?(
    state: VariantPublicState,
    seat: number,
    context: TurnContext,
    action: TurnAction,
  ): void;
  onCall?(
    state: VariantPublicState,
    seat: number,
    context: CallContext,
    action: CallAction,
  ): void;
  onClaim?(
    state: VariantPublicState,
    seat: number,
    from: number,
    tile: Tile,
    action: CallAction,
  ): void;
  onDiscard?(state: VariantPublicState, seat: number, tile: Tile): void;
  inventory(): Tile[];
  score(input: VariantScoreInput): VariantScore;
  payments(
    score: VariantScore,
    context: VariantPaymentContext,
  ): readonly { seat: number; amount: number }[];
  progression(
    winner: number | null,
    dealer: number,
    repeats: number,
  ): { repeat: boolean; repeats: number };
  publicView(state: VariantPublicState, seat: number): VariantPublicView;
  turnContext(
    state: VariantPublicState,
    seat: number,
    drawn: Tile | null,
    replacement: boolean,
    canWin: boolean,
  ): TurnContext;
  callContext(
    state: VariantPublicState,
    seat: number,
    from: number,
    tile: Tile,
    stage: "ron" | "chankan" | "pon-kan" | "chi",
    canWin: boolean,
  ): CallContext;
}
export interface VariantGameResult {
  readonly scores: readonly number[];
  readonly settlement: readonly {
    seat: number;
    score: number;
    rank: number;
    points: number;
  }[];
  readonly events: readonly GameEvent[];
  readonly handsPlayed: number;
}

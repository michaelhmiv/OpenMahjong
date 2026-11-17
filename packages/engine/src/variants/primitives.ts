import type { CallContext, TurnContext } from "../game.js";
import type { Tile } from "../tiles.js";
import type {
  VariantAdapter,
  VariantPublicState,
  VariantPublicView,
} from "./types.js";

export function chineseInventory(): Tile[] {
  const tiles: Tile[] = [];
  for (let t = 0; t < 34; t++)
    for (let c = 0; c < 4; c++)
      tiles.push({ id: 4 * t + c, type: t, red: false });
  for (let f = 0; f < 8; f++)
    tiles.push({ id: 136 + f, type: 34 + f, red: false });
  return tiles;
}
/** Transport compatibility with the existing seat-driver/table boundary.
 * Irrelevant Riichi fields are empty constants, never engine rule flags. */
export function chinesePublicView(
  adapter: VariantAdapter,
  state: VariantPublicState,
  seat: number,
): VariantPublicView {
  const own = state.players[seat]!;
  return {
    variant: adapter.variant,
    profile: { id: adapter.profileId, version: 1 },
    standingTiles: adapter.standingTiles,
    winningSets: adapter.sets,
    dealerRepeats: state.dealerRepeats,
    legalDiscardIds: own.tiles.map((t) => t.id),
    flowerTiles: state.players.map((p) => p.flowers.map((t) => ({ ...t }))),
    seat,
    hand: own.tiles.map((t) => ({ ...t })),
    melds: structured(own.melds),
    players: state.players.map((p) => ({
      seat: p.seat,
      score: p.score,
      riichi: false,
      doubleRiichi: false,
      discards: structured(p.discards),
      melds: p.melds.map((m) =>
        adapter.concealedQuadsFaceDown && p.seat !== seat && m.kind === "ankan"
          ? {
              kind: m.kind,
              tiles: m.tiles.map(() => ({ id: -1, type: -1, red: false })),
            }
          : structured(m),
      ),
      handCount: p.tiles.length,
      isDealer: p.seat === state.dealer,
      seatWind: 27 + ((p.seat - state.dealer + 4) % 4),
    })),
    dealer: state.dealer,
    roundWind: state.roundWind,
    kyoku: state.kyoku,
    honba: 0,
    sticks: 0,
    wallRemaining: state.wallRemaining,
    doraIndicators: [],
    currentTurn: state.currentTurn,
  };
}
function structured<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
export function chineseTurnContext(
  state: VariantPublicState,
  seat: number,
  drawn: Tile | null,
  replacement: boolean,
  canWin: boolean,
): TurnContext {
  const player = state.players[seat]!,
    counts = new Array<number>(34).fill(0);
  player.tiles.forEach((t) => counts[t.type]!++);
  return {
    drawnTile: drawn,
    rinshan: replacement,
    canTsumo: canWin,
    ankanOptions:
      drawn && state.wallRemaining > 0
        ? counts.flatMap((n, t) => (n === 4 ? [t] : []))
        : [],
    shouminkanOptions:
      drawn && state.wallRemaining > 0
        ? player.melds
            .filter(
              (m) =>
                m.kind === "pon" &&
                player.tiles.some((t) => t.type === m.tiles[0]!.type),
            )
            .map((m) => m.tiles[0]!.type)
        : [],
    riichiDiscardIds: [],
    canKyuushu: false,
  };
}
export function chineseCallContext(
  state: VariantPublicState,
  seat: number,
  from: number,
  tile: Tile,
  stage: "ron" | "chankan" | "pon-kan" | "chi",
  canWin: boolean,
): CallContext {
  const hand = state.players[seat]!.tiles,
    same = hand.filter((t) => t.type === tile.type),
    chi: (readonly [number, number])[] = [];
  if (
    state.wallRemaining > 0 &&
    stage === "chi" &&
    seat === (from + 1) % 4 &&
    tile.type < 27
  )
    for (const [a, b] of [
      [tile.type - 2, tile.type - 1],
      [tile.type - 1, tile.type + 1],
      [tile.type + 1, tile.type + 2],
    ]) {
      if (
        a! < 0 ||
        b! >= 27 ||
        Math.floor(a! / 9) !== Math.floor(tile.type / 9) ||
        Math.floor(b! / 9) !== Math.floor(tile.type / 9)
      )
        continue;
      const x = hand.find((t) => t.type === a),
        y = hand.find((t) => t.type === b);
      if (x && y) chi.push([x.id, y.id]);
    }
  return {
    phase: stage === "ron" ? "ron" : stage === "chankan" ? "chankan" : "call",
    ...(stage === "pon-kan" || stage === "chi" ? { callStage: stage } : {}),
    tile,
    fromSeat: from,
    canRon: canWin,
    canPon: state.wallRemaining > 0 && stage === "pon-kan" && same.length >= 2,
    canKan: stage === "pon-kan" && same.length >= 3 && state.wallRemaining > 0,
    chiOptions: chi,
  };
}

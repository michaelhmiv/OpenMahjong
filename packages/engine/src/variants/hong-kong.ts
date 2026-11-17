import { isTerminalOrHonor } from "../tiles.js";
import { closedPortion, isOrphans, standardShapes } from "./shapes.js";
import {
  chineseCallContext,
  chineseInventory,
  chinesePublicView,
  chineseTurnContext,
} from "./primitives.js";
import type {
  VariantAdapter,
  VariantPattern,
  VariantScore,
  VariantScoreInput,
} from "./types.js";

export const HK_HALF_SPICY = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128] as const;
export interface HongKongSettings {
  readonly minimum: number;
  readonly cap: number;
  readonly table: "half-spicy" | "full-spicy";
  readonly split: "clear-chapter" | "discarder-all";
}
export const DEFAULT_HK_SETTINGS: HongKongSettings = {
  minimum: 3,
  cap: 10,
  table: "half-spicy",
  split: "clear-chapter",
};
export function hongKongPayments(
  fan: number,
  context: { winner: number; payer: number; selfDraw: boolean },
  settings: HongKongSettings = DEFAULT_HK_SETTINGS,
): { seat: number; amount: number }[] {
  if (
    !Number.isInteger(context.winner) ||
    context.winner < 0 ||
    context.winner > 3 ||
    !Number.isInteger(context.payer) ||
    context.payer < 0 ||
    context.payer > 3 ||
    (!context.selfDraw && context.payer === context.winner)
  )
    throw new Error("Invalid payment seats");
  if (
    !Number.isInteger(fan) ||
    fan < settings.minimum ||
    fan > 100 ||
    !Number.isInteger(settings.cap) ||
    settings.cap < 3 ||
    settings.cap > 10 ||
    !Number.isInteger(settings.minimum) ||
    settings.minimum < 0 ||
    settings.minimum > settings.cap ||
    !["half-spicy", "full-spicy"].includes(settings.table) ||
    !["clear-chapter", "discarder-all"].includes(settings.split)
  )
    throw new Error("Invalid Hong Kong scoring settings or minimum fan");
  const base =
    settings.table === "half-spicy"
      ? HK_HALF_SPICY[Math.min(fan, settings.cap)]!
      : 2 ** Math.min(fan, settings.cap);
  return [0, 1, 2, 3]
    .filter((s) => s !== context.winner)
    .flatMap((seat) =>
      context.selfDraw
        ? [{ seat, amount: 2 * base }]
        : settings.split === "discarder-all"
          ? seat === context.payer
            ? [{ seat, amount: 3 * base }]
            : []
          : [{ seat, amount: base * (seat === context.payer ? 2 : 1) }],
    );
}
export function scoreHongKong(input: VariantScoreInput): VariantScore {
  for (const flag of [
    input.selfDraw,
    input.replacement,
    input.robbingQuad,
    input.lastWall,
    input.initial,
    input.lastCopy,
  ])
    if (typeof flag !== "boolean") throw new Error("Invalid win circumstance");
  if (
    !Number.isInteger(input.seatWind) ||
    input.seatWind < 27 ||
    input.seatWind > 30 ||
    !Number.isInteger(input.roundWind) ||
    input.roundWind < 27 ||
    input.roundWind > 30 ||
    !Number.isInteger(input.winningTile) ||
    input.winningTile < 0 ||
    input.winningTile > 33
  )
    throw new Error("Invalid win context");
  if (
    (input.replacement && !input.melds.some((m) => m.tiles.length === 4)) ||
    (input.initial && (!input.selfDraw || input.melds.length > 0))
  )
    throw new Error("Incompatible replacement or initial win");
  const c = closedPortion(input.counts, input.melds, 4);
  if (!c[input.winningTile])
    throw new Error("Winning tile must be concealed before the win");
  if (
    (input.selfDraw && input.robbingQuad) ||
    (!input.selfDraw && input.replacement) ||
    (input.replacement && input.lastWall)
  )
    throw new Error("Incompatible win circumstances");
  const flowers = [...input.flowers];
  if (
    flowers.some((f) => !Number.isInteger(f) || f < 34 || f > 41) ||
    new Set(flowers).size !== flowers.length
  )
    throw new Error("Invalid flower inventory");
  const shapes = standardShapes(input.counts, input.melds, 4);
  const orphans = !input.melds.length && isOrphans(input.counts);
  if (!shapes.length && !orphans)
    return { units: 0, qualifyingUnits: 0, patterns: [], eligible: false };
  let best: VariantPattern[] = [];
  for (const shape of shapes.length ? shapes : [null]) {
    const found: VariantPattern[] = [],
      add = (id: string, name: string, units: number) =>
        found.push({ id, name, units });
    if (input.initial && input.selfDraw) {
      add(
        "initial",
        input.seatWind === 27 ? "Heavenly hand" : "Earthly hand",
        10,
      );
    } else if (orphans) add("thirteen-orphans", "Thirteen Orphans", 13);
    else {
      const groups = shape!.groups,
        triplets = groups.filter((g) => g.kind !== "sequence"),
        dragons = triplets.filter((g) => g.type >= 31),
        winds = triplets.filter((g) => g.type >= 27 && g.type <= 30);
      const suits = new Set(
          input.counts.flatMap((n, t) =>
            n && t < 27 ? [Math.floor(t / 9)] : [],
          ),
        ),
        honors = input.counts.slice(27).some((n) => n > 0);
      if (groups.every((g) => g.kind === "quad"))
        add("four-quads", "Four quads", 18);
      if (winds.length === 4) add("big-four-winds", "Big Four Winds", 15);
      else if (winds.length === 3 && shape!.pair >= 27 && shape!.pair <= 30)
        add("little-four-winds", "Little Four Winds", 10);
      if (suits.size === 0) add("all-honors", "All Honors", 10);
      else if (suits.size === 1 && !honors) {
        const suit = [...suits][0]!,
          nine =
            !input.melds.length &&
            input.counts.every((n, t) => !n || Math.floor(t / 9) === suit) &&
            [0, 1, 2, 3, 4, 5, 6, 7, 8].every(
              (r) =>
                input.counts[9 * suit + r]! >= (r === 0 || r === 8 ? 3 : 1),
            );
        add(
          nine ? "nine-gates" : "full-flush",
          nine ? "Nine Gates" : "Full flush",
          nine ? 15 : 7,
        );
      } else if (suits.size === 1) add("half-flush", "One suit with honors", 3);
      if (dragons.length === 3)
        add("big-three-dragons", "Big Three Dragons", 8);
      else if (dragons.length === 2 && shape!.pair >= 31)
        add("little-three-dragons", "Little Three Dragons", 5);
      else
        for (const dragon of dragons)
          add(`dragon-${dragon.type}`, "Dragon triplet", 1);
      if (triplets.length === 4) add("all-triplets", "All triplets", 3);
      if (groups.every((g) => g.kind === "sequence"))
        add("all-sequences", "All sequences", 1);
      for (const wind of winds) {
        if (wind.type === input.seatWind)
          add("seat-wind", "Seat-wind triplet", 1);
        if (wind.type === input.roundWind)
          add("round-wind", "Round-wind triplet", 1);
      }
      if (input.selfDraw) add("self-draw", "Self-draw", 1);
      if (input.replacement) add("replacement", "Quad replacement win", 1);
      if (input.robbingQuad) add("robbing-quad", "Robbing an added quad", 1);
      if (input.lastWall)
        add(
          "last-wall",
          input.selfDraw ? "Last wall tile" : "Final discard",
          1,
        );
      if (!flowers.length) add("no-flowers", "No flowers or seasons", 1);
      else if (flowers.length === 8)
        add("eight-flowers", "All eight flowers and seasons", 8);
      else {
        const seat = input.seatWind - 27;
        for (const f of flowers)
          if ((f - 34) % 4 === seat)
            add(`flower-${f}`, "Own-seat flower or season", 1);
        for (const base of [34, 38])
          if ([0, 1, 2, 3].every((n) => flowers.includes(base + n)))
            add(`quartet-${base}`, "Complete flower or season quartet", 2);
      }
    }
    if (
      found.reduce((n, p) => n + p.units, 0) >
      best.reduce((n, p) => n + p.units, 0)
    )
      best = found;
  }
  const units = best.reduce((n, p) => n + p.units, 0);
  return {
    units,
    qualifyingUnits: units,
    patterns: best,
    eligible: units >= 3,
  };
}
export const HONG_KONG: VariantAdapter = {
  variant: "hong-kong",
  profileId: "openmahjong-hkos",
  version: 1,
  standingTiles: 13,
  sets: 4,
  startingScore: 1000,
  reserve: 16,
  concealedQuadsFaceDown: false,
  replacementBonus: (kind) => kind === "quad",
  inventory: chineseInventory,
  score: scoreHongKong,
  payments: (score, context) => hongKongPayments(score.units, context),
  progression: (winner, dealer, repeats) => ({
    repeat: winner === dealer,
    repeats: winner === dealer ? repeats + 1 : 0,
  }),
  publicView(state, seat) {
    return chinesePublicView(this, state, seat);
  },
  turnContext: chineseTurnContext,
  callContext: chineseCallContext,
};

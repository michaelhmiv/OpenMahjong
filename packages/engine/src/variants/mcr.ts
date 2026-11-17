/** WMO/EMA 2006 MCR. One deterministic, offline scorer is shared by all
 * consumers. The bounded bridge never receives a wall, seed or hidden hand. */
import createRuntime from "./mcr-runtime.js";
import { validateCounts } from "../tiles.js";
import { closedPortion, declaredGroup } from "./shapes.js";
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
interface McrRuntime {
  HEAP32: Int32Array;
  _mcr_input(): number;
  _mcr_output(): number;
  _mcr_size(): number;
  _mcr_name(i: number): number;
  _mcr_value(i: number): number;
  _mcr_score(): number;
  _mcr_distance(): number;
  UTF8ToString(p: number): string;
}
let runtime: McrRuntime | undefined;
function core(): McrRuntime {
  return (runtime ??= createRuntime({
    print: () => {},
    printErr: () => {},
  }) as McrRuntime);
}
export interface McrPattern {
  readonly id: string;
  readonly name: string;
  readonly units: number;
  readonly index: number;
}
let catalog: readonly McrPattern[] | undefined;
export function mcrPatterns(): readonly McrPattern[] {
  if (catalog) return catalog;
  const m = core();
  if (m._mcr_size() !== 82) throw new Error("Unexpected MCR pattern edition");
  return (catalog = Object.freeze(
    Array.from({ length: 81 }, (_, n) => {
      const i = n + 1,
        name = m.UTF8ToString(m._mcr_name(i));
      return Object.freeze({
        index: i,
        id: `mcr-${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-$/u, "")}`,
        name,
        units: m._mcr_value(i),
      });
    }),
  ));
}
export function scoreMcr(input: VariantScoreInput): VariantScore {
  for (const f of [
    input.selfDraw,
    input.replacement,
    input.robbingQuad,
    input.lastWall,
    input.initial,
    input.lastCopy,
  ])
    if (typeof f !== "boolean") throw new Error("Invalid MCR circumstance");
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
    throw new Error("Invalid MCR win context");
  if (
    (input.selfDraw && input.robbingQuad) ||
    (!input.selfDraw && input.replacement) ||
    (input.replacement && input.lastWall) ||
    (input.replacement && !input.melds.some((m) => m.tiles.length === 4)) ||
    (input.initial && (!input.selfDraw || input.melds.length))
  )
    throw new Error("Incompatible MCR circumstances");
  const flowers = input.flowers;
  if (
    flowers.some((f) => !Number.isInteger(f) || f < 34 || f > 41) ||
    new Set(flowers).size !== flowers.length
  )
    throw new Error("Invalid MCR flowers");
  const concealed = closedPortion(input.counts, input.melds, 4);
  if (!concealed[input.winningTile])
    throw new Error("Winning tile must belong to the standing hand");
  const patterns = mcrPatterns(),
    m = core(),
    start = m._mcr_input() >>> 2;
  m.HEAP32.fill(0, start, start + 64);
  m.HEAP32.set(input.counts, start);
  m.HEAP32.set(
    [
      input.melds.length,
      input.winningTile,
      (input.selfDraw ? 1 : 0) |
        (input.lastCopy ? 2 : 0) |
        (input.replacement || input.robbingQuad ? 4 : 0) |
        (input.lastWall ? 8 : 0) |
        (input.initial ? 16 : 0),
      flowers.length,
      input.seatWind - 27,
      input.roundWind - 27,
    ],
    start + 34,
  );
  input.melds.forEach((meld, i) => {
    const g = declaredGroup(meld);
    m.HEAP32.set(
      [
        g.kind === "sequence" ? 1 : g.kind === "quad" ? 3 : 2,
        g.type + (g.kind === "sequence" ? 1 : 0),
        g.closed ? 1 : 0,
      ],
      start + 40 + 3 * i,
    );
  });
  const units = m._mcr_score();
  if (units === -3)
    return { units: 0, qualifyingUnits: 0, eligible: false, patterns: [] };
  if (units < 0) throw new Error(`Invalid MCR hand (${units})`);
  const out = m._mcr_output() >>> 2,
    found: VariantPattern[] = patterns.flatMap((p) => {
      const n = m.HEAP32[out + p.index]!;
      return n
        ? [
            {
              id: p.id,
              name: n > 1 ? `${p.name} × ${n}` : p.name,
              units: p.units * n,
            },
          ]
        : [];
    });
  if (found.reduce((sum, p) => sum + p.units, 0) !== units)
    throw new Error("MCR scorer breakdown mismatch");
  const qualifyingUnits = units - flowers.length;
  return {
    units,
    qualifyingUnits,
    patterns: found,
    eligible: qualifyingUnits >= 8,
  };
}
/** Shape distance includes seven pairs (a four-of-a-kind may supply two
 * pairs), orphans, honors-and-knitted and knitted-straight structures. */
export function mcrDistance(counts: readonly number[], melds = 0): number {
  validateCounts(counts);
  const n = counts.reduce((a, b) => a + b, 0);
  if (
    !Number.isInteger(melds) ||
    melds < 0 ||
    melds > 4 ||
    ![13 - 3 * melds, 14 - 3 * melds].includes(n)
  )
    throw new Error("Invalid MCR analysis tile count");
  const m = core(),
    start = m._mcr_input() >>> 2;
  m.HEAP32.fill(0, start, start + 64);
  m.HEAP32.set(counts, start);
  return m._mcr_distance();
}
export function mcrPayments(
  fan: number,
  context: { winner: number; payer: number; selfDraw: boolean },
  flowers = 0,
): { seat: number; amount: number }[] {
  if (
    !Number.isInteger(fan) ||
    fan < 8 ||
    fan > 1000 ||
    !Number.isInteger(flowers) ||
    flowers < 0 ||
    flowers > 8 ||
    !Number.isInteger(context.winner) ||
    context.winner < 0 ||
    context.winner > 3 ||
    !Number.isInteger(context.payer) ||
    context.payer < 0 ||
    context.payer > 3 ||
    (!context.selfDraw && context.payer === context.winner)
  )
    throw new Error("Invalid MCR payments");
  return [0, 1, 2, 3]
    .filter((s) => s !== context.winner)
    .map((seat) => ({
      seat,
      amount:
        8 + (context.selfDraw || seat === context.payer ? fan + flowers : 0),
    }));
}
export const MCR: VariantAdapter = {
  variant: "mcr",
  profileId: "openmahjong-mcr-2006",
  version: 1,
  standingTiles: 13,
  sets: 4,
  startingScore: 0,
  reserve: 0,
  concealedQuadsFaceDown: true,
  replacementBonus: (kind) => kind === "quad",
  inventory: chineseInventory,
  score: scoreMcr,
  payments: (score, c) =>
    mcrPayments(score.qualifyingUnits, c, score.units - score.qualifyingUnits),
  progression: () => ({ repeat: false, repeats: 0 }),
  publicView(state, seat) {
    return chinesePublicView(this, state, seat);
  },
  turnContext: chineseTurnContext,
  callContext: chineseCallContext,
};

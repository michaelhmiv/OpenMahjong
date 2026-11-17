/** Local-first scoring ledger. Independent of a simulated game or replay. */
import { utf8ByteLength } from "./encoding.js";
import {
  computeRiichiPoints,
  scoreHand,
  type ScoreInput,
  type WinType,
} from "./scoring.js";
import { settle, doraFromIndicator } from "./game.js";
import { buildTileSet } from "./tiles.js";
import {
  DEFAULT_HK_SETTINGS,
  hongKongPayments,
  scoreHongKong,
  type HongKongSettings,
} from "./variants/hong-kong.js";
import {
  scoreTaiwanese,
  taiwanesePayments,
  type TaiwaneseSettings,
} from "./variants/taiwanese.js";
import { scoreMcr, mcrPayments } from "./variants/mcr.js";
import type { VariantScoreInput } from "./variants/types.js";
import { isOrphans, standardShapes } from "./variants/shapes.js";

export type ScoringVariant =
  | "riichi"
  | "american"
  | "hong-kong"
  | "mcr"
  | "taiwanese";
export interface Payment {
  readonly from: number;
  readonly to: number;
  readonly amount: number;
}
export interface CalculationContext {
  readonly winner: number;
  readonly dealer: number;
  readonly winType: WinType;
  readonly payer: number;
  readonly honba: number;
}
export type CalculatorInput =
  | {
      readonly variant: "riichi";
      readonly path: "tiles";
      readonly context: CalculationContext;
      readonly hand: ScoreInput;
      readonly evidence?: {
        readonly concealedIds: readonly number[];
        readonly meldIds: readonly (readonly number[])[];
        readonly indicatorIds: readonly number[];
        readonly uraIds: readonly number[];
      };
    }
  | {
      readonly variant: "riichi";
      readonly path: "fast";
      readonly context: CalculationContext;
      readonly han: number;
      readonly fu: number;
      readonly yakuman: number;
    }
  | {
      readonly variant: "hong-kong";
      readonly path: "tiles";
      readonly context: CalculationContext;
      readonly hand: VariantScoreInput;
      readonly settings: HongKongSettings;
    }
  | {
      readonly variant: "hong-kong";
      readonly path: "fast";
      readonly context: CalculationContext;
      readonly fan: number;
      readonly settings: HongKongSettings;
    }
  | {
      readonly variant: "mcr";
      readonly path: "tiles";
      readonly context: CalculationContext;
      readonly hand: VariantScoreInput;
    }
  | {
      readonly variant: "mcr";
      readonly path: "fast";
      readonly context: CalculationContext;
      readonly fan: number;
      readonly flowers: number;
    }
  | {
      readonly variant: "taiwanese";
      readonly path: "tiles";
      readonly context: CalculationContext;
      readonly hand: VariantScoreInput;
      readonly settings: TaiwaneseSettings;
    }
  | {
      readonly variant: "taiwanese";
      readonly path: "fast";
      readonly context: CalculationContext;
      readonly tai: number;
      readonly settings: TaiwaneseSettings;
    }
  | {
      readonly variant: "american";
      readonly path: "fast";
      readonly context: CalculationContext;
      readonly value: number;
      readonly jokerless: boolean;
      readonly singlesPairs: boolean;
      readonly bettor?: number | "wall";
    };
export interface ScoringCorrection {
  readonly id: string;
  readonly units: number;
  readonly reason: string;
}
export interface CalculationDraft {
  readonly input: CalculatorInput;
  readonly corrections: readonly ScoringCorrection[];
  readonly fuCorrection?: number;
  readonly correctionNote?: string;
}
export interface ScoreFact {
  readonly id: string;
  readonly label: string;
  readonly units: number;
}
export interface CalculationResult {
  readonly detected: readonly ScoreFact[];
  readonly corrected: readonly ScoreFact[];
  readonly units: number;
  readonly fu: number;
  readonly qualifyingUnits: number;
  readonly payments: readonly Payment[];
  readonly manual: boolean;
  readonly eligible: boolean;
}
export function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error(`Invalid ${label}`);
  return Number(value);
}
export function seat(value: unknown): number {
  return integer(value, 0, 3, "seat");
}
function keys(input: unknown, allowed: readonly string[]): void {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw new Error("Unknown scoring fields");
}
export function calculateDraft(draft: CalculationDraft): CalculationResult {
  keys(draft, ["input", "corrections", "fuCorrection", "correctionNote"]);
  const { input } = draft,
    ctx = input.context;
  if (
    (input.path !== "tiles" && input.path !== "fast") ||
    (input.variant === "american" && input.path !== "fast")
  )
    throw new Error("Unsupported input path");
  keys(
    input,
    input.variant === "riichi"
      ? input.path === "tiles"
        ? ["variant", "path", "context", "hand", "evidence"]
        : ["variant", "path", "context", "han", "fu", "yakuman"]
      : input.variant === "hong-kong"
        ? input.path === "tiles"
          ? ["variant", "path", "context", "hand", "settings"]
          : ["variant", "path", "context", "fan", "settings"]
        : input.variant === "mcr"
          ? input.path === "tiles"
            ? ["variant", "path", "context", "hand"]
            : ["variant", "path", "context", "fan", "flowers"]
          : input.variant === "taiwanese"
            ? input.path === "tiles"
              ? ["variant", "path", "context", "hand", "settings"]
              : ["variant", "path", "context", "tai", "settings"]
            : [
                "variant",
                "path",
                "context",
                "value",
                "jokerless",
                "singlesPairs",
                "bettor",
              ],
  );
  keys(ctx, ["winner", "dealer", "winType", "payer", "honba"]);
  seat(ctx.winner);
  seat(ctx.dealer);
  seat(ctx.payer);
  integer(ctx.honba, 0, 100, "repeat counter");
  if (
    (input.variant === "hong-kong" || input.variant === "mcr") &&
    ctx.honba !== 0
  )
    throw new Error("This variant has no repeat-payment counter");
  if (ctx.winType !== "ron" && ctx.winType !== "tsumo")
    throw new Error("Unknown win type");
  if (ctx.winType === "ron" && ctx.winner === ctx.payer)
    throw new Error("Winner cannot discard the winning tile");
  let detected: ScoreFact[] = [],
    fu = 0,
    yakuman = 0;
  if (input.variant === "riichi") {
    if (input.path === "tiles") {
      keys(input.hand, [
        "handCounts",
        "melds",
        "winningTileType",
        "winType",
        "seatWind",
        "roundWind",
        "riichi",
        "doubleRiichi",
        "ippatsu",
        "haitei",
        "houtei",
        "rinshan",
        "chankan",
        "firstDrawTsumo",
        "dora",
        "honba",
        "riichiSticks",
      ]);
      if (!Array.isArray(input.hand.melds) || input.hand.melds.length > 4)
        throw new Error("Invalid melds");
      input.hand.melds.forEach((m) => keys(m, ["kind", "tiles"]));
      if (input.evidence) {
        const e = input.evidence,
          tiles = buildTileSet();
        keys(e, ["concealedIds", "meldIds", "indicatorIds", "uraIds"]);
        if (
          !Array.isArray(e.concealedIds) ||
          e.concealedIds.length > 14 ||
          !Array.isArray(e.meldIds) ||
          e.meldIds.length !== input.hand.melds.length ||
          !Array.isArray(e.indicatorIds) ||
          e.indicatorIds.length > 5 ||
          !Array.isArray(e.uraIds) ||
          e.uraIds.length > 5
        )
          throw new Error("Invalid physical tile entry");
        e.meldIds.forEach((ids, i) => {
          if (
            !Array.isArray(ids) ||
            ids.length !== input.hand.melds[i]!.tiles.length ||
            ids.some(
              (id, j) =>
                tiles[integer(id, 0, 135, "physical tile")]!.type !==
                input.hand.melds[i]!.tiles[j],
            )
          )
            throw new Error("Meld evidence mismatch");
        });
        const ids = [
          ...e.concealedIds,
          ...e.meldIds.flat(),
          ...e.indicatorIds,
          ...e.uraIds,
        ];
        ids.forEach((id) => integer(id, 0, 135, "physical tile"));
        if (new Set(ids).size !== ids.length)
          throw new Error("A physical tile appears twice");
        const owned = [...e.concealedIds, ...e.meldIds.flat()].map(
          (id) => tiles[id]!,
        );
        const counts = new Array<number>(34).fill(0);
        owned.forEach((t) => counts[t.type]!++);
        if (
          JSON.stringify(counts) !== JSON.stringify(input.hand.handCounts) ||
          !e.concealedIds.some(
            (id) => tiles[id]!.type === input.hand.winningTileType,
          )
        )
          throw new Error("Tile evidence mismatch");
        const bonuses = [
          ...e.indicatorIds,
          ...(input.hand.riichi ? e.uraIds : []),
        ].map((id) => doraFromIndicator(tiles[id]!.type));
        const dora =
          owned.filter((t) => t.red).length +
          owned.reduce(
            (n, t) => n + bonuses.filter((type) => type === t.type).length,
            0,
          );
        if (dora !== input.hand.dora)
          throw new Error("Bonus tile evidence mismatch");
      }
      if (
        input.hand.winType !== ctx.winType ||
        input.hand.seatWind !== 27 + ((ctx.winner - ctx.dealer + 4) % 4) ||
        input.hand.honba !== ctx.honba ||
        input.hand.riichiSticks !== 0
      )
        throw new Error("Hand context does not match the table");
      const score = scoreHand(input.hand);
      detected = score.yaku.map((y) => ({
        id: y.id,
        label: y.name,
        units: y.han,
      }));
      if (score.dora)
        detected.push({
          id: "dora",
          label: "Bonus tiles (dora)",
          units: score.dora,
        });
      fu = score.fu;
      yakuman = score.yakumanMultiple;
    } else {
      integer(input.han, 1, 104, "han");
      integer(input.yakuman, 0, 8, "yakuman count");
      integer(input.fu, 0, 110, "fu");
      detected = [
        {
          id: "entered-han",
          label: "Entered han",
          units: input.yakuman ? 13 * input.yakuman : input.han,
        },
      ];
      fu = input.fu;
      yakuman = input.yakuman;
    }
  } else if (input.variant === "hong-kong") {
    keys(input.settings, ["minimum", "cap", "table", "split"]);
    // Validate the supported table even when the entered hand is below its minimum.
    hongKongPayments(
      Math.max(3, input.settings.minimum),
      {
        winner: ctx.winner,
        payer: ctx.payer,
        selfDraw: ctx.winType === "tsumo",
      },
      input.settings,
    );
    if (input.path === "tiles") {
      keys(input.hand, [
        "counts",
        "melds",
        "winningTile",
        "selfDraw",
        "seatWind",
        "roundWind",
        "flowers",
        "replacement",
        "robbingQuad",
        "lastWall",
        "initial",
        "lastCopy",
      ]);
      if (
        input.hand.selfDraw !== (ctx.winType === "tsumo") ||
        input.hand.seatWind !== 27 + ((ctx.winner - ctx.dealer + 4) % 4)
      )
        throw new Error("Hand context mismatch");
      input.hand.melds.forEach((m) => keys(m, ["kind", "tiles"]));
      const score = scoreHongKong(input.hand);
      if (
        !standardShapes(input.hand.counts, input.hand.melds, 4).length &&
        !(input.hand.melds.length === 0 && isOrphans(input.hand.counts))
      )
        throw new Error("Not a supported winning shape");
      detected = score.patterns.map((p) => ({
        id: p.id,
        label: p.name,
        units: p.units,
      }));
    } else {
      integer(input.fan, 0, 100, "fan");
      detected = [
        { id: "entered-fan", label: "Entered fan", units: input.fan },
      ];
    }
  } else if (input.variant === "mcr") {
    if (input.path === "tiles") {
      keys(input.hand, [
        "counts",
        "melds",
        "winningTile",
        "selfDraw",
        "seatWind",
        "roundWind",
        "flowers",
        "replacement",
        "robbingQuad",
        "lastWall",
        "initial",
        "lastCopy",
      ]);
      if (
        input.hand.selfDraw !== (ctx.winType === "tsumo") ||
        input.hand.seatWind !== 27 + ((ctx.winner - ctx.dealer + 4) % 4)
      )
        throw new Error("Hand context mismatch");
      input.hand.melds.forEach((m) => keys(m, ["kind", "tiles"]));
      const score = scoreMcr(input.hand);
      if (!score.patterns.length) throw new Error("Not an MCR winning shape");
      detected = score.patterns.map((p) => ({
        id: p.id,
        label: p.name,
        units: p.units,
      }));
    } else {
      integer(input.fan, 0, 1000, "fan excluding flowers");
      integer(input.flowers, 0, 8, "flowers");
      detected = [
        {
          id: "entered-fan",
          label: "Entered fan excluding flowers",
          units: input.fan,
        },
        { id: "mcr-flower-tiles", label: "Flower Tiles", units: input.flowers },
      ];
    }
  } else if (input.variant === "taiwanese") {
    keys(input.settings, ["base", "unit"]);
    taiwanesePayments(
      0,
      {
        winner: ctx.winner,
        payer: ctx.payer,
        selfDraw: ctx.winType === "tsumo",
        dealer: ctx.dealer,
        dealerRepeats: ctx.honba,
      },
      input.settings,
    );
    if (input.path === "tiles") {
      keys(input.hand, [
        "counts",
        "melds",
        "winningTile",
        "selfDraw",
        "seatWind",
        "roundWind",
        "flowers",
        "replacement",
        "robbingQuad",
        "lastWall",
        "initial",
        "lastCopy",
      ]);
      if (
        input.hand.selfDraw !== (ctx.winType === "tsumo") ||
        input.hand.seatWind !== 27 + ((ctx.winner - ctx.dealer + 4) % 4)
      )
        throw new Error("Hand context mismatch");
      input.hand.melds.forEach((m) => keys(m, ["kind", "tiles"]));
      const score = scoreTaiwanese(input.hand);
      if (!score.eligible)
        throw new Error("Taiwanese requires five sets and a pair");
      detected = score.patterns.map((p) => ({
        id: p.id,
        label: p.name,
        units: p.units,
      }));
    } else {
      integer(input.tai, 0, 200, "tai");
      detected = [
        {
          id: "entered-tai",
          label: "Entered tai excluding dealer bonus",
          units: input.tai,
        },
      ];
    }
  } else if (input.variant === "american") {
    integer(input.value, 1, 100000, "printed value");
    if (
      typeof input.jokerless !== "boolean" ||
      typeof input.singlesPairs !== "boolean"
    )
      throw new Error("Invalid American circumstances");
    detected = [
      {
        id: "card-value",
        label: "Value entered from your physical card",
        units: input.value,
      },
    ];
    if (input.bettor !== undefined && input.bettor !== "wall")
      seat(input.bettor);
  } else throw new Error("Unsupported calculator variant");
  if (!Array.isArray(draft.corrections) || draft.corrections.length > 40)
    throw new Error("Too many corrections");
  const corrected = detected.map((f) => ({ ...f }));
  const seen = new Set<string>();
  for (const correction of draft.corrections) {
    keys(correction, ["id", "units", "reason"]);
    if (
      seen.has(correction.id) ||
      typeof correction.reason !== "string" ||
      !correction.reason.trim() ||
      correction.reason.length > 240
    )
      throw new Error("Each correction needs a unique fact and a reason");
    seen.add(correction.id);
    integer(correction.units, 0, 100000, "corrected units");
    const fact = corrected.find((f) => f.id === correction.id);
    if (fact) fact.units = correction.units;
    else if (correction.id === "table-adjustment")
      corrected.push({
        id: correction.id,
        label: "Manual table adjustment",
        units: correction.units,
      });
    else throw new Error("Correction refers to an unknown fact");
  }
  const units = corrected.reduce((total, fact) => total + fact.units, 0);
  if (draft.fuCorrection !== undefined) {
    if (input.variant !== "riichi")
      throw new Error("Fu applies to Riichi only");
    integer(draft.fuCorrection, 0, 110, "corrected fu");
    if (
      typeof draft.correctionNote !== "string" ||
      !draft.correctionNote.trim() ||
      draft.correctionNote.length > 240
    )
      throw new Error("Fu correction needs a reason");
    fu = draft.fuCorrection;
  }
  const payments: Payment[] = [];
  let eligible = true,
    qualifyingUnits = units;
  if (input.variant === "riichi") {
    integer(units, 1, 104, "han");
    if (yakuman && draft.corrections.length) yakuman = Math.floor(units / 13);
    if (
      !yakuman &&
      units < 5 &&
      ![20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].includes(fu)
    )
      throw new Error("Choose a supported fu value");
    if (
      units < 5 &&
      ((fu === 20 && (ctx.winType !== "tsumo" || units < 2)) ||
        (fu === 25 && units < 2))
    )
      throw new Error("Impossible han/fu combination");
    const points = computeRiichiPoints(
      units,
      fu,
      yakuman,
      ctx.winner === ctx.dealer,
      ctx.winType,
      ctx.honba,
    );
    for (let payer = 0; payer < 4; payer++)
      if (
        payer !== ctx.winner &&
        (ctx.winType === "tsumo" || payer === ctx.payer)
      ) {
        payments.push({
          from: payer,
          to: ctx.winner,
          amount:
            points.ronPoints ??
            (payer === ctx.dealer
              ? points.tsumoPoints!.dealer
              : points.tsumoPoints!.nonDealer),
        });
      }
  } else if (input.variant === "hong-kong") {
    integer(units, 0, 100, "fan");
    eligible = units >= input.settings.minimum;
    if (eligible)
      payments.push(
        ...hongKongPayments(
          units,
          {
            winner: ctx.winner,
            payer: ctx.payer,
            selfDraw: ctx.winType === "tsumo",
          },
          input.settings,
        ).map((p) => ({ from: p.seat, to: ctx.winner, amount: p.amount })),
      );
  } else if (input.variant === "mcr") {
    const flowerUnits =
      corrected.find((p) => p.id === "mcr-flower-tiles")?.units ?? 0;
    integer(flowerUnits, 0, 8, "flower points");
    qualifyingUnits = units - flowerUnits;
    integer(qualifyingUnits, 0, 1000, "fan excluding flowers");
    eligible = qualifyingUnits >= 8;
    if (eligible)
      payments.push(
        ...mcrPayments(
          qualifyingUnits,
          {
            winner: ctx.winner,
            payer: ctx.payer,
            selfDraw: ctx.winType === "tsumo",
          },
          flowerUnits,
        ).map((p) => ({ from: p.seat, to: ctx.winner, amount: p.amount })),
      );
  } else if (input.variant === "taiwanese") {
    integer(units, 0, 200, "tai");
    payments.push(
      ...taiwanesePayments(
        units,
        {
          winner: ctx.winner,
          payer: ctx.payer,
          selfDraw: ctx.winType === "tsumo",
          dealer: ctx.dealer,
          dealerRepeats: ctx.honba,
        },
        input.settings,
      ).map((p) => ({ from: p.seat, to: ctx.winner, amount: p.amount })),
    );
  } else {
    integer(units, 1, 100000, "printed value");
    const multiplier = input.jokerless && !input.singlesPairs ? 2 : 1;
    for (let payer = 0; payer < 4; payer++)
      if (payer !== ctx.winner)
        payments.push({
          from: payer,
          to: ctx.winner,
          amount:
            units *
            multiplier *
            (ctx.winType === "tsumo" || payer === ctx.payer ? 2 : 1),
        });
    if (input.bettor !== undefined) {
      if (input.bettor === ctx.winner)
        payments.push(...payments.map((p) => ({ ...p, to: 4 })));
      else
        payments.push({
          from: 4,
          to: ctx.winner,
          amount:
            input.bettor === "wall"
              ? units * multiplier * (ctx.winType === "tsumo" ? 2 : 1)
              : payments.find((p) => p.from === input.bettor)!.amount,
        });
    }
  }
  return {
    detected,
    corrected,
    units,
    qualifyingUnits,
    fu,
    payments,
    eligible,
    manual:
      input.path === "fast" ||
      draft.corrections.length > 0 ||
      draft.fuCorrection !== undefined,
  };
}

export interface TableSettings {
  readonly multipleRon: "head-bump" | "all";
  readonly settlement: "raw" | "openmahjong";
  readonly finalPot: "leader" | "return-deposits";
}
export const TABLE_PRESETS = {
  "openmahjong-riichi-table@1": {
    variant: "riichi",
    startingScore: 25000,
    settings: {
      multipleRon: "head-bump",
      settlement: "openmahjong",
      finalPot: "leader",
    },
  },
  "riichi-multiple-winners@1": {
    variant: "riichi",
    startingScore: 25000,
    settings: {
      multipleRon: "all",
      settlement: "openmahjong",
      finalPot: "leader",
    },
  },
  "american-payments@1": {
    variant: "american",
    startingScore: 0,
    settings: {
      multipleRon: "head-bump",
      settlement: "raw",
      finalPot: "leader",
    },
  },
  "taiwanese-every-flower@1": {
    variant: "taiwanese",
    startingScore: 1000,
    settings: {
      multipleRon: "head-bump",
      settlement: "raw",
      finalPot: "leader",
    },
  },
  "mcr-2006@1": {
    variant: "mcr",
    startingScore: 0,
    settings: {
      multipleRon: "head-bump",
      settlement: "raw",
      finalPot: "leader",
    },
  },
  "hong-kong-clear@1": {
    variant: "hong-kong",
    startingScore: 1000,
    settings: {
      multipleRon: "head-bump",
      settlement: "raw",
      finalPot: "leader",
    },
  },
} as const;
export type TableEvent =
  | { readonly kind: "win"; readonly wins: readonly CalculationDraft[] }
  | {
      readonly kind: "draw";
      readonly reason: "exhaustive" | "abortive";
      readonly ready: readonly number[];
      readonly wallBetValue?: number;
    }
  | { readonly kind: "deposit"; readonly seat: number }
  | {
      readonly kind: "penalty";
      readonly payments: readonly Payment[];
      readonly reason: string;
    };
export type LedgerOperation =
  | {
      readonly id: string;
      readonly kind: "set";
      readonly recordId: string;
      readonly event: TableEvent;
    }
  | { readonly id: string; readonly kind: "undo"; readonly target: string };
export interface ScoringSession {
  readonly v: 1;
  readonly id: string;
  readonly variant: ScoringVariant;
  readonly preset: keyof typeof TABLE_PRESETS;
  readonly names: readonly string[];
  readonly startingScores: readonly number[];
  readonly settings: TableSettings;
  readonly bettorName?: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly finished: boolean;
  readonly ledger: readonly LedgerOperation[];
}
export function activeTableEvents(
  session: ScoringSession,
): { id: string; event: TableEvent }[] {
  const disabled = new Set<string>();
  for (const op of [...session.ledger].reverse())
    if (!disabled.has(op.id) && op.kind === "undo") disabled.add(op.target);
  const records = new Map<string, TableEvent>();
  for (const op of session.ledger)
    if (!disabled.has(op.id) && op.kind === "set")
      records.set(op.recordId, op.event);
  return [...records].map(([id, event]) => ({ id, event }));
}
export interface LedgerTotals {
  readonly scores: readonly number[];
  readonly pot: number;
  readonly rows: readonly {
    id: string;
    event: TableEvent;
    delta: readonly number[];
    scores: readonly number[];
    pot: number;
  }[];
}
export function recomputeSession(session: ScoringSession): LedgerTotals {
  const scores = [
      ...session.startingScores,
      ...(session.bettorName ? [0] : []),
    ],
    rows: {
      id: string;
      event: TableEvent;
      delta: number[];
      scores: number[];
      pot: number;
    }[] = [];
  let pot = 0;
  const initial = scores.reduce((a, b) => a + b, 0);
  const deposited = new Set<number>();
  const transfer = (payment: Payment) => {
    keys(payment, ["from", "to", "amount"]);
    integer(payment.from, 0, scores.length - 1, "payer");
    integer(payment.to, 0, scores.length - 1, "recipient");
    integer(payment.amount, 0, 100000000, "payment");
    if (payment.from === payment.to) throw new Error("Payment to self");
    scores[payment.from]! -= payment.amount;
    scores[payment.to]! += payment.amount;
  };
  for (const { id, event } of activeTableEvents(session)) {
    keys(
      event,
      event.kind === "deposit"
        ? ["kind", "seat"]
        : event.kind === "win"
          ? ["kind", "wins"]
          : event.kind === "draw"
            ? ["kind", "reason", "ready", "wallBetValue"]
            : ["kind", "payments", "reason"],
    );
    const before = [...scores];
    if (event.kind === "deposit") {
      if (session.variant !== "riichi")
        throw new Error("Deposits are Riichi only");
      seat(event.seat);
      if (scores[event.seat]! < 1000)
        throw new Error("Insufficient points for a deposit");
      if (deposited.has(event.seat))
        throw new Error("A player can declare riichi once per hand");
      deposited.add(event.seat);
      scores[event.seat]! -= 1000;
      pot += 1000;
    } else if (event.kind === "win") {
      if (!event.wins.length || event.wins.length > 3)
        throw new Error("One to three winners required");
      const winners = new Set<number>();
      const first = event.wins[0]!.input.context;
      for (const win of event.wins) {
        if (!calculateDraft(win).eligible)
          throw new Error(
            "The hand does not meet this table’s scoring minimum",
          );
        if (
          win.input.variant !== session.variant ||
          winners.has(win.input.context.winner)
        )
          throw new Error("Invalid winner or variant");
        if (
          win.input.variant === "american" &&
          win.input.bettor !== undefined &&
          !session.bettorName
        )
          throw new Error("Set up the bettor before recording");
        winners.add(win.input.context.winner);
        if (
          event.wins.length > 1 &&
          (win.input.context.winType !== "ron" ||
            first.winType !== "ron" ||
            win.input.context.payer !== first.payer ||
            win.input.context.dealer !== first.dealer ||
            win.input.context.honba !== first.honba)
        )
          throw new Error(
            "Simultaneous winners must share the same discard context",
          );
      }
      const ordered = [...event.wins].sort(
        (a, b) =>
          ((a.input.context.winner - first.payer + 4) % 4) -
          ((b.input.context.winner - first.payer + 4) % 4),
      );
      if (session.variant !== "riichi" && ordered.length > 1)
        throw new Error("This preset permits one winner");
      const accepted =
        session.settings.multipleRon === "head-bump"
          ? ordered.slice(0, 1)
          : ordered;
      for (const win of accepted)
        calculateDraft(win).payments.forEach(transfer);
      scores[accepted[0]!.input.context.winner]! += pot;
      pot = 0;
      deposited.clear();
    } else if (event.kind === "draw") {
      if (event.reason !== "exhaustive" && event.reason !== "abortive")
        throw new Error("Unknown draw type");
      if (
        !Array.isArray(event.ready) ||
        event.ready.length > 4 ||
        new Set(event.ready).size !== event.ready.length
      )
        throw new Error("Invalid ready seats");
      event.ready.forEach(seat);
      deposited.clear();
      if (
        session.variant === "riichi" &&
        event.reason === "exhaustive" &&
        event.ready.length > 0 &&
        event.ready.length < 4
      ) {
        for (let i = 0; i < 4; i++)
          scores[i]! += event.ready.includes(i)
            ? 3000 / event.ready.length
            : -3000 / (4 - event.ready.length);
      }
      if (event.wallBetValue !== undefined) {
        if (session.variant !== "american" || !session.bettorName)
          throw new Error("Wall bet requires an American bettor");
        integer(event.wallBetValue, 1, 100000, "lowest printed card value");
        for (let i = 0; i < 4; i++)
          transfer({ from: i, to: 4, amount: event.wallBetValue });
      }
    } else if (event.kind === "penalty") {
      if (
        typeof event.reason !== "string" ||
        !event.reason.trim() ||
        event.reason.length > 240 ||
        !Array.isArray(event.payments) ||
        !event.payments.length ||
        event.payments.length > 10
      )
        throw new Error("Penalty needs bounded payments and a reason");
      event.payments.forEach(transfer);
    } else throw new Error("Unsupported ledger event");
    if (
      scores.some(
        (s) => !Number.isSafeInteger(s) || Math.abs(s) > 1000000000,
      ) ||
      scores.reduce((a, b) => a + b, pot) !== initial
    )
      throw new Error("Ledger does not conserve points");
    rows.push({
      id,
      event,
      delta: scores.map((s, i) => s - before[i]!),
      scores: [...scores],
      pot,
    });
  }
  return { scores, pot, rows };
}
export function validateScoringSession(input: unknown): ScoringSession {
  if (
    !input ||
    typeof input !== "object" ||
    utf8ByteLength(JSON.stringify(input)) > 512000
  )
    throw new Error("Invalid or oversized scoring session");
  const s = input as ScoringSession;
  keys(s, [
    "v",
    "id",
    "variant",
    "preset",
    "names",
    "startingScores",
    "settings",
    "bettorName",
    "revision",
    "updatedAt",
    "finished",
    "ledger",
  ]);
  const id = (v: unknown) =>
    typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  if (
    s.v !== 1 ||
    !id(s.id) ||
    !Object.hasOwn(TABLE_PRESETS, s.preset) ||
    TABLE_PRESETS[s.preset].variant !== s.variant
  )
    throw new Error("Unsupported session version or preset");
  if (
    !Array.isArray(s.names) ||
    s.names.length !== 4 ||
    s.names.some((n) => typeof n !== "string" || !n.trim() || n.length > 60)
  )
    throw new Error("Four named players required");
  if (!Array.isArray(s.startingScores) || s.startingScores.length !== 4)
    throw new Error("Four starting scores required");
  s.startingScores.forEach((n) =>
    integer(n, -1000000, 1000000, "starting score"),
  );
  if (
    !s.settings ||
    !["head-bump", "all"].includes(s.settings.multipleRon) ||
    !["raw", "openmahjong"].includes(s.settings.settlement) ||
    !["leader", "return-deposits"].includes(s.settings.finalPot)
  )
    throw new Error("Unknown table settings");
  keys(s.settings, ["multipleRon", "settlement", "finalPot"]);
  if (
    s.variant !== "riichi" &&
    (s.settings.multipleRon !== "head-bump" || s.settings.settlement !== "raw")
  )
    throw new Error("Unsupported settings for this variant");
  if (
    s.settings.settlement === "openmahjong" &&
    s.startingScores.some((n) => n !== 25000)
  )
    throw new Error("OpenMahjong settlement requires 25,000 starts");
  if (
    s.bettorName !== undefined &&
    (s.variant !== "american" ||
      typeof s.bettorName !== "string" ||
      !s.bettorName.trim() ||
      s.bettorName.length > 60)
  )
    throw new Error("Invalid bettor");
  integer(s.revision, 0, 1000000, "session revision");
  if (
    typeof s.finished !== "boolean" ||
    typeof s.updatedAt !== "string" ||
    s.updatedAt.length > 40 ||
    !Number.isFinite(Date.parse(s.updatedAt))
  )
    throw new Error("Invalid session metadata");
  if (!Array.isArray(s.ledger) || s.ledger.length > 1000)
    throw new Error("Too many ledger entries");
  const ids = new Set<string>();
  for (const op of s.ledger) {
    keys(
      op,
      op.kind === "undo"
        ? ["id", "kind", "target"]
        : ["id", "kind", "recordId", "event"],
    );
    if (!id(op.id) || ids.has(op.id)) throw new Error("Duplicate operation id");
    if (op.kind === "undo") {
      if (!ids.has(op.target))
        throw new Error("Undo must target an earlier operation");
    } else if (op.kind === "set") {
      if (!id(op.recordId) || !op.event) throw new Error("Invalid record");
      // Superseded/undone records are still validated. Unknown fields and
      // proprietary card payloads cannot hide inside inactive history.
      recomputeSession({
        ...s,
        startingScores: [1000000, 1000000, 1000000, 1000000],
        ledger: [op],
      });
    } else throw new Error("Unknown ledger operation");
    ids.add(op.id);
  }
  const canonical = JSON.parse(
    JSON.stringify({
      v: s.v,
      id: s.id,
      variant: s.variant,
      preset: s.preset,
      names: s.names.map((n) => n.trim()),
      startingScores: s.startingScores,
      settings: s.settings,
      ...(s.bettorName ? { bettorName: s.bettorName.trim() } : {}),
      revision: s.revision,
      updatedAt: s.updatedAt,
      finished: s.finished,
      ledger: s.ledger,
    }),
  ) as ScoringSession;
  recomputeSession(canonical);
  return canonical;
}
export function sessionSettlement(session: ScoringSession): {
  scores: readonly number[];
  standings: readonly {
    seat: number;
    score: number;
    points: number;
    rank: number;
  }[];
  transfers: readonly Payment[];
} {
  const totals = recomputeSession(session),
    scores = [...totals.scores];
  if (totals.pot) {
    if (session.settings.finalPot === "return-deposits") {
      let remaining = totals.pot;
      for (const row of [...totals.rows].reverse()) {
        if (row.event.kind === "win") break;
        if (row.event.kind === "deposit" && remaining > 0) {
          scores[row.event.seat]! += 1000;
          remaining -= 1000;
        }
      }
    } else {
      const leader = scores
        .slice(0, 4)
        .indexOf(Math.max(...scores.slice(0, 4)));
      scores[leader]! += totals.pot;
    }
  }
  const standings =
    session.settings.settlement === "openmahjong"
      ? settle(scores)
      : scores.map((score, seat) => ({
          seat,
          score,
          points: score - (session.startingScores[seat] ?? 0),
          rank: 1 + scores.filter((s) => s > score).length,
        }));
  // Settlement amounts are expressed in score units; rank bonuses are shown
  // separately in standings rather than silently converted to currency.
  const balances = scores.map((s, i) => s - (session.startingScores[i] ?? 0));
  const transfers: Payment[] = [];
  for (let from = 0; from < balances.length; from++)
    for (let to = 0; to < balances.length && balances[from]! < 0; to++)
      if (balances[to]! > 0) {
        const amount = Math.min(-balances[from]!, balances[to]!);
        transfers.push({ from, to, amount });
        balances[from]! += amount;
        balances[to]! -= amount;
      }
  return {
    scores,
    standings: [...standings].sort(
      (a, b) => a.rank - b.rank || a.seat - b.seat,
    ),
    transfers,
  };
}

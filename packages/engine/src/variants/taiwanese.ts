/** OpenMahjong Taiwanese Every-flower, no Ting. See docs/rules/taiwanese.md
 * for the frozen sourced table and explicit choices where tables differ. */
import type {
  CallAction,
  CallContext,
  TurnAction,
  TurnContext,
} from "../game.js";
import type { Tile } from "../tiles.js";
import {
  closedPortion,
  shapeWaits,
  standardShapes,
  type StandardShape,
} from "./shapes.js";
import {
  chineseCallContext,
  chineseInventory,
  chinesePublicView,
  chineseTurnContext,
} from "./primitives.js";
import type {
  VariantAdapter,
  VariantPattern,
  VariantPublicState,
  VariantScore,
  VariantScoreInput,
} from "./types.js";
export interface TaiwaneseSettings {
  readonly base: number;
  readonly unit: number;
}
export const DEFAULT_TAIWANESE_SETTINGS: TaiwaneseSettings = {
  base: 30,
  unit: 10,
};
export function taiwanesePayments(
  tai: number,
  c: {
    winner: number;
    payer: number;
    selfDraw: boolean;
    dealer: number;
    dealerRepeats: number;
  },
  settings: TaiwaneseSettings = DEFAULT_TAIWANESE_SETTINGS,
): { seat: number; amount: number }[] {
  if (
    !Number.isInteger(tai) ||
    tai < 0 ||
    tai > 200 ||
    [c.winner, c.payer, c.dealer].some(
      (n) => !Number.isInteger(n) || n < 0 || n > 3,
    ) ||
    (!c.selfDraw && c.winner === c.payer) ||
    !Number.isInteger(c.dealerRepeats) ||
    c.dealerRepeats < 0 ||
    c.dealerRepeats > 100 ||
    !Number.isInteger(settings.base) ||
    settings.base < 1 ||
    settings.base > 100000 ||
    !Number.isInteger(settings.unit) ||
    settings.unit < 1 ||
    settings.unit > 100000
  )
    throw new Error("Invalid Taiwanese payment context");
  return [0, 1, 2, 3]
    .filter((s) => s !== c.winner && (c.selfDraw || s === c.payer))
    .map((seat) => ({
      seat,
      amount:
        settings.base +
        (tai +
          (c.winner === c.dealer || seat === c.dealer
            ? 1 + 2 * c.dealerRepeats
            : 0)) *
          settings.unit,
    }));
}
export function scoreTaiwanese(input: VariantScoreInput): VariantScore {
  for (const f of [
    input.selfDraw,
    input.replacement,
    input.robbingQuad,
    input.lastWall,
    input.initial,
    input.lastCopy,
  ])
    if (typeof f !== "boolean")
      throw new Error("Invalid Taiwanese circumstance");
  if (
    [input.seatWind, input.roundWind].some(
      (n) => !Number.isInteger(n) || n < 27 || n > 30,
    ) ||
    !Number.isInteger(input.winningTile) ||
    input.winningTile < 0 ||
    input.winningTile > 33
  )
    throw new Error("Invalid Taiwanese win context");
  if (
    (input.selfDraw && input.robbingQuad) ||
    (!input.selfDraw && input.replacement) ||
    (input.replacement && input.lastWall) ||
    (input.initial && (!input.selfDraw || input.melds.length))
  )
    throw new Error("Incompatible Taiwanese circumstances");
  const flowers = input.flowers;
  if (
    flowers.some((n) => !Number.isInteger(n) || n < 34 || n > 41) ||
    new Set(flowers).size !== flowers.length
  )
    throw new Error("Invalid Taiwanese flowers");
  const concealed = closedPortion(input.counts, input.melds, 5);
  if (!concealed[input.winningTile])
    throw new Error("Winning tile must be in the standing hand");
  const shapes = standardShapes(input.counts, input.melds, 5);
  if (!shapes.length)
    return { units: 0, qualifyingUnits: 0, patterns: [], eligible: false };
  const before = [...concealed];
  before[input.winningTile]!--;
  const waits = shapeWaits(before, input.melds, 5),
    unique = waits.length === 1 && waits[0] === input.winningTile,
    closed = input.melds.every((m) => m.kind === "ankan"),
    allClaimed =
      input.melds.length === 5 &&
      !closed &&
      !input.melds.some((m) => m.kind === "ankan") &&
      !input.selfDraw;
  let best: VariantPattern[] = [];
  function candidates(shape: StandardShape): number[] {
    const values: number[] = [];
    if (shape.pair === input.winningTile) values.push(-1);
    shape.groups.forEach((g, i) => {
      if (
        i >= input.melds.length &&
        (g.kind === "sequence"
          ? input.winningTile >= g.type && input.winningTile <= g.type + 2
          : g.type === input.winningTile)
      )
        values.push(i);
    });
    return values;
  }
  for (const shape of shapes)
    for (const completed of candidates(shape)) {
      const found: VariantPattern[] = [],
        add = (id: string, name: string, units: number) =>
          found.push({ id: `tw-${id}`, name, units });
      const pungs = shape.groups.filter((g) => g.kind !== "sequence"),
        winds = pungs.filter((g) => g.type >= 27 && g.type <= 30),
        dragons = pungs.filter((g) => g.type >= 31),
        suits = new Set(
          input.counts.flatMap((n, t) =>
            n && t < 27 ? [Math.floor(t / 9)] : [],
          ),
        ),
        honors = input.counts.slice(27).some((n) => n > 0);
      if (winds.length === 4) add("big-four-winds", "Big Four Winds", 16);
      else if (winds.length === 3 && shape.pair >= 27 && shape.pair <= 30)
        add("little-four-winds", "Little Four Winds", 8);
      else for (const g of winds) add(`wind-${g.type}`, "Wind triplet", 1);
      if (dragons.length === 3)
        add("big-three-dragons", "Big Three Dragons", 8);
      else if (dragons.length === 2 && shape.pair >= 31)
        add("little-three-dragons", "Little Three Dragons", 4);
      else
        for (const g of dragons) add(`dragon-${g.type}`, "Dragon triplet", 1);
      if (suits.size === 0) add("all-honors", "All Honors", 8);
      else if (suits.size === 1)
        add(
          honors ? "half-flush" : "full-flush",
          honors ? "One suit with honors" : "Full flush",
          honors ? 4 : 8,
        );
      if (pungs.length === 5) add("all-pungs", "All triplets", 4);
      const concealedPungs =
        pungs.filter((g) => g.closed).length -
        (!input.selfDraw &&
        completed >= 0 &&
        shape.groups[completed]!.kind === "triplet"
          ? 1
          : 0);
      if (concealedPungs >= 3)
        add(
          "concealed-pungs",
          `${concealedPungs} concealed triplets`,
          concealedPungs === 5 ? 8 : concealedPungs === 4 ? 5 : 2,
        );
      for (const [i, m] of input.melds.entries())
        if (m.tiles.length === 4)
          add(
            `quad-${i}`,
            m.kind === "ankan" ? "Concealed quad" : "Exposed quad",
            m.kind === "ankan" ? 2 : 1,
          );
      if (flowers.length === 8)
        add("eight-flowers", "Eight Immortals · Completed hand", 8);
      else {
        for (const f of flowers)
          add(`flower-${f}`, "Exposed flower or season", 1);
        for (const first of [34, 38])
          if ([0, 1, 2, 3].every((n) => flowers.includes(first + n)))
            add(`flower-set-${first}`, "Complete flower or season quartet", 2);
      }
      if (!honors && !flowers.length)
        add("no-honors-flowers", "No honors or flowers", 2);
      if (input.initial)
        add(
          "initial",
          input.seatWind === 27 ? "Heavenly hand" : "Earthly hand",
          input.seatWind === 27 ? 24 : 16,
        );
      else {
        if (closed && input.selfDraw)
          add("concealed-self", "Concealed self-draw", 3);
        else {
          if (closed) add("concealed", "Concealed hand", 1);
          if (input.selfDraw) add("self-draw", "Self-draw", 1);
        }
        if (allClaimed) add("all-claimed", "All claimed", 2);
        else if (unique)
          add("unique-wait", "Unique edge, closed or pair wait", 1);
      }
      const completion = completed >= 0 ? shape.groups[completed] : null,
        twoSided =
          completion?.kind === "sequence" &&
          ((input.winningTile === completion.type &&
            completion.type % 9 !== 6) ||
            (input.winningTile === completion.type + 2 &&
              completion.type % 9 !== 0));
      if (
        !input.selfDraw &&
        !honors &&
        !flowers.length &&
        pungs.length === 0 &&
        !unique &&
        twoSided
      )
        add("all-chows", "All sequences · Two-sided discard win", 2);
      if (input.replacement) add("replacement", "Replacement win", 1);
      if (input.robbingQuad) add("robbing", "Robbing an added quad", 1);
      if (input.lastWall && input.selfDraw)
        add("last-draw", "Last live-wall self-draw", 1);
      if (
        found.reduce((n, p) => n + p.units, 0) >
        best.reduce((n, p) => n + p.units, 0)
      )
        best = found;
    }
  const units = best.reduce((n, p) => n + p.units, 0);
  return { units, qualifyingUnits: units, eligible: true, patterns: best };
}
/** Per-match private restrictions; never shared by independent matches or
 * stored as flags on the Riichi controller. Public projection exposes only
 * the reviewing player's own restrictions. */
export class TaiwaneseRestrictions {
  private blocked = new Map<number, Set<number>>();
  private discards = new Map<number, Set<number>>();
  private passedPungs = new Map<number, Set<number>>();
  private previousDiscard = new Map<number, number>();
  private noSelfDraw = new Set<number>();
  reset(): void {
    this.blocked.clear();
    this.discards.clear();
    this.passedPungs.clear();
    this.previousDiscard.clear();
    this.noSelfDraw.clear();
  }
  private waits(
    state: VariantPublicState,
    seat: number,
    exclude?: number,
  ): number[] {
    const p = state.players[seat]!,
      counts = new Array<number>(34).fill(0);
    for (const t of p.tiles)
      if (t.id !== exclude && t.type < 34) counts[t.type]!++;
    return shapeWaits(
      counts,
      p.melds.map((m) => ({ kind: m.kind, tiles: m.tiles.map((t) => t.type) })),
      5,
    );
  }
  beforeDraw(
    state: VariantPublicState,
    seat: number,
    replacement: boolean,
  ): void {
    if (!replacement) {
      this.passedPungs.delete(seat);
      this.previousDiscard.delete(seat);
      this.discards.delete(seat);
      this.noSelfDraw.delete(seat);
      if (this.blocked.has(seat))
        this.blocked.set(seat, new Set(this.waits(state, seat)));
    }
  }
  canWin(seat: number, selfDraw: boolean): boolean {
    return !this.blocked.has(seat) && (!selfDraw || !this.noSelfDraw.has(seat));
  }
  legalIds(state: VariantPublicState, seat: number): number[] {
    return state.players[seat]!.tiles.filter(
      (t) => !this.discards.get(seat)?.has(t.type),
    ).map((t) => t.id);
  }
  turnTaken(
    state: VariantPublicState,
    seat: number,
    c: TurnContext,
    a: TurnAction,
  ): void {
    if (c.canTsumo && a.type !== "tsumo")
      this.blocked.set(seat, new Set(this.waits(state, seat, c.drawnTile?.id)));
    if (a.type === "ankan" || a.type === "shouminkan") {
      this.blocked.delete(seat);
      this.noSelfDraw.delete(seat);
    }
  }
  callTaken(
    state: VariantPublicState,
    seat: number,
    c: CallContext,
    a: CallAction,
  ): void {
    if (c.canRon && a.type !== "ron")
      this.blocked.set(seat, new Set(this.waits(state, seat)));
    if (c.canPon && a.type === "pass") {
      const p = this.passedPungs.get(seat) ?? new Set<number>();
      p.add(c.tile.type);
      this.passedPungs.set(seat, p);
    }
  }
  private swaps(tile: number, others: readonly number[]): Set<number> {
    const out = new Set([tile]);
    if (others.length === 2) {
      const all = [tile, ...others].sort((a, b) => a - b);
      if (tile === all[0] && tile % 9 < 6) out.add(tile + 3);
      if (tile === all[2] && tile % 9 > 2) out.add(tile - 3);
    }
    return out;
  }
  claimed(
    state: VariantPublicState,
    seat: number,
    _from: number,
    tile: Tile,
    a: CallAction,
  ): void {
    if (a.type === "daiminkan") {
      this.noSelfDraw.add(seat);
      return;
    }
    const meld = state.players[seat]!.melds.at(-1)!;
    this.discards.set(
      seat,
      this.swaps(
        tile.type,
        a.type === "chi"
          ? meld.tiles.filter((t) => t.id !== tile.id).map((t) => t.type)
          : [],
      ),
    );
  }
  discarded(_state: VariantPublicState, seat: number, tile: Tile): void {
    if (this.blocked.has(seat) && !this.blocked.get(seat)!.has(tile.type))
      this.blocked.delete(seat);
    this.discards.delete(seat);
    this.previousDiscard.set(seat, tile.type);
  }
  calls(
    state: VariantPublicState,
    seat: number,
    from: number,
    tile: Tile,
    stage: "ron" | "chankan" | "pon-kan" | "chi",
    canWin: boolean,
  ): CallContext {
    const c = chineseCallContext(
      state,
      seat,
      from,
      tile,
      stage,
      canWin && this.canWin(seat, false),
    );
    if (stage === "ron" || stage === "chankan") return c;
    const available = state.wallRemaining >= 4,
      passed = this.passedPungs.get(seat)?.has(tile.type),
      prior = this.previousDiscard.get(seat);
    return {
      ...c,
      canPon: c.canPon && available && !passed,
      canKan: c.canKan && available && !passed,
      chiOptions: available
        ? c.chiOptions.filter(
            (ids) =>
              prior === undefined ||
              !this.swaps(
                tile.type,
                ids.map(
                  (id) =>
                    state.players[seat]!.tiles.find((t) => t.id === id)!.type,
                ),
              ).has(prior),
          )
        : [],
    };
  }
}
export function createTaiwaneseAdapter(): VariantAdapter {
  const restrictions = new TaiwaneseRestrictions();
  return {
    variant: "taiwanese",
    profileId: "openmahjong-taiwanese-every-flower",
    version: 1,
    standingTiles: 16,
    sets: 5,
    startingScore: 1000,
    reserve: 16,
    concealedQuadsFaceDown: true,
    initialFlowerPasses: true,
    replacementBonus: (kind) => kind !== "ordinary",
    inventory: chineseInventory,
    score: scoreTaiwanese,
    payments: (s, c) => taiwanesePayments(s.units, c),
    progression: (winner, dealer, repeats) => {
      const repeat = (winner === null || winner === dealer) && repeats < 10;
      return { repeat, repeats: repeat ? repeats + 1 : 0 };
    },
    publicView(state, seat) {
      return {
        ...chinesePublicView(this, state, seat),
        legalDiscardIds: restrictions.legalIds(state, seat),
        winRestriction: restrictions.canWin(seat, true)
          ? undefined
          : "Passed win or exposed-quad replacement: win unavailable until the profile’s restoring action.",
      };
    },
    turnContext: (state, seat, drawn, replacement, win) =>
      chineseTurnContext(
        state,
        seat,
        drawn,
        replacement,
        win && restrictions.canWin(seat, true),
      ),
    callContext: (...args) => restrictions.calls(...args),
    onHandStart: () => restrictions.reset(),
    onDraw: (...args) => restrictions.beforeDraw(...args),
    onTurn: (...args) => restrictions.turnTaken(...args),
    onCall: (...args) => restrictions.callTaken(...args),
    onClaim: (...args) => restrictions.claimed(...args),
    onDiscard: (...args) => restrictions.discarded(...args),
  };
}

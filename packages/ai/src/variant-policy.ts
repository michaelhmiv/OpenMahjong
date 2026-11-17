import {
  mcrDistance,
  variantAdapter,
  type CallAction,
  type CallContext,
  type PlayerView,
  type Policy,
  type TurnAction,
  type TurnContext,
  type VariantPublicView,
} from "@openmahjong/engine";
import { shantenStandardFast, shantenTaiwaneseFast } from "./analysis.js";

export interface VariantDiscardFact {
  readonly tileId: number;
  readonly type: number;
  readonly distance: number;
  readonly unseenImproving: number;
  readonly improving: readonly { type: number; copies: number }[];
  readonly eligibleWaits: readonly number[];
  readonly patternPotential: number;
}
export interface VariantAdvice {
  readonly informationMode: "player-perspective";
  readonly analysisVersion: "chinese-discard-1";
  readonly heuristic: true;
  readonly recommendation: VariantDiscardFact;
  readonly options: readonly VariantDiscardFact[];
}
export function asVariantView(view: PlayerView): VariantPublicView {
  const v = view as VariantPublicView;
  if (
    !v.variant ||
    variantAdapter(v.profile?.id, v.profile?.version).variant !== v.variant
  )
    throw new Error("A supported variant public view is required");
  return v;
}
function countsOf(view: VariantPublicView): number[] {
  const c = new Array<number>(34).fill(0);
  view.hand.forEach((t) => c[t.type]!++);
  return c;
}
function distance(
  view: VariantPublicView,
  c: readonly number[],
  melds = view.melds.length,
): number {
  if (view.variant === "mcr") return mcrDistance(c, melds);
  const standard =
    view.winningSets === 4
      ? shantenStandardFast(c, melds)
      : shantenTaiwaneseFast(c, melds);
  if (melds) return standard;
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return view.winningSets === 4
    ? Math.min(
        standard,
        13 -
          terminals.filter((t) => c[t]! > 0).length -
          (terminals.some((t) => c[t]! >= 2) ? 1 : 0),
      )
    : standard;
}
export function evaluateVariantDiscards(publicView: PlayerView): VariantAdvice {
  const view = asVariantView(publicView),
    adapter = variantAdapter(view.profile.id),
    counts = countsOf(view),
    visible = new Array<number>(34).fill(0);
  for (const player of view.players) {
    for (const d of player.discards) if (!d.called) visible[d.tile.type]!++;
    for (const m of player.melds)
      for (const t of m.tiles) if (t.type >= 0) visible[t.type]!++;
  }
  const options: VariantDiscardFact[] = [],
    byType = new Map<number, Omit<VariantDiscardFact, "tileId">>(),
    cache = new Map<string, number>();
  const dist = (c: readonly number[]) => {
    const key = c.join("");
    let d = cache.get(key);
    if (d === undefined) {
      d = distance(view, c);
      cache.set(key, d);
    }
    return d;
  };
  for (const tile of view.hand.filter((t) =>
    view.legalDiscardIds.includes(t.id),
  )) {
    let fact = byType.get(tile.type);
    if (!fact) {
      const c = [...counts];
      c[tile.type]!--;
      const base = dist(c),
        improving: { type: number; copies: number }[] = [],
        waits: number[] = [];
      for (let t = 0; t < 34; t++)
        if (c[t]! < 4) {
          const copies = 4 - counts[t]! - visible[t]!;
          if (copies <= 0) continue;
          c[t]!++;
          const d = dist(c);
          if (d < base) improving.push({ type: t, copies });
          if (d === -1) {
            const total = [...c];
            for (const m of view.melds)
              for (const v of m.tiles) total[v.type]!++;
            const score = adapter.score({
              counts: total,
              melds: view.melds.map((m) => ({
                kind: m.kind,
                tiles: m.tiles.map((t) => t.type),
              })),
              winningTile: t,
              selfDraw: true,
              seatWind: view.players[view.seat]!.seatWind,
              roundWind: view.roundWind,
              flowers: view.flowerTiles[view.seat]!.map((t) => t.type),
              replacement: false,
              robbingQuad: false,
              lastWall: false,
              initial: false,
              lastCopy: false,
            });
            if (score.eligible) waits.push(t);
          }
          c[t]!--;
        }
      const suits = [0, 1, 2].map((s) =>
        c.slice(9 * s, 9 * s + 9).reduce((a, b) => a + b, 0),
      );
      const honors = c.slice(27).reduce((n, v) => n + (v >= 2 ? 2 : v), 0),
        pairs = c.filter((n) => n >= 2).length;
      fact = {
        type: tile.type,
        distance: base,
        unseenImproving: improving.reduce((n, t) => n + t.copies, 0),
        improving,
        eligibleWaits: waits,
        patternPotential: Math.max(...suits) + honors + pairs,
      };
      byType.set(tile.type, fact);
    }
    options.push({ ...fact, tileId: tile.id });
  }
  options.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.unseenImproving - a.unseenImproving ||
      b.patternPotential - a.patternPotential ||
      a.type - b.type ||
      a.tileId - b.tileId,
  );
  if (!options.length) throw new Error("No discard candidates");
  return {
    informationMode: "player-perspective",
    analysisVersion: "chinese-discard-1",
    heuristic: true,
    recommendation: options[0]!,
    options,
  };
}
export function createVariantPolicy(): Policy {
  return {
    turn(publicView: PlayerView, context: TurnContext): TurnAction {
      const view = asVariantView(publicView);
      if (context.canTsumo) return { type: "tsumo" };
      if (context.shouminkanOptions.length)
        return { type: "shouminkan", tileType: context.shouminkanOptions[0]! };
      const advice = evaluateVariantDiscards(view);
      for (const type of context.ankanOptions) {
        const c = countsOf(view);
        c[type]! -= 4;
        if (
          distance(view, c, view.melds.length + 1) <=
          advice.recommendation.distance
        )
          return { type: "ankan", tileType: type };
      }
      return { type: "discard", tileId: advice.recommendation.tileId };
    },
    call(publicView: PlayerView, context: CallContext): CallAction {
      const view = asVariantView(publicView);
      if (context.canRon) return { type: "ron" };
      const before = distance(view, countsOf(view));
      const candidates: { action: CallAction; ids: readonly number[] }[] = [];
      if (context.canKan)
        candidates.push({
          action: { type: "daiminkan" },
          ids: view.hand
            .filter((t) => t.type === context.tile.type)
            .slice(0, 3)
            .map((t) => t.id),
        });
      if (context.canPon)
        candidates.push({
          action: { type: "pon" },
          ids: view.hand
            .filter((t) => t.type === context.tile.type)
            .slice(0, 2)
            .map((t) => t.id),
        });
      for (const ids of context.chiOptions)
        candidates.push({ action: { type: "chi", tileIds: ids }, ids });
      for (const candidate of candidates) {
        const c = countsOf(view);
        for (const id of candidate.ids)
          c[view.hand.find((t) => t.id === id)!.type]!--;
        if (candidate.action.type === "daiminkan") {
          if (distance(view, c, view.melds.length + 1) <= before)
            return candidate.action;
          continue;
        }
        let best = 20;
        for (let t = 0; t < 34; t++)
          if (c[t]) {
            c[t]!--;
            best = Math.min(best, distance(view, c, view.melds.length + 1));
            c[t]!++;
          }
        if (best < before) return candidate.action;
      }
      return { type: "pass" };
    },
  };
}

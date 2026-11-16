/**
 * Finished-game records and stats math (slice-2 brief §4 T1/T3).
 *
 * Pure functions over the engine event log and record shapes — no DOM,
 * no storage, no network — so the numbers the Stats screen shows are
 * unit-testable against hand-checked fixtures. The server stores the
 * same sums the client computes here; it never re-derives them.
 */

import type { GameEvent, GameLength, Seat } from "@openmahjong/engine";
import type { GameRecord, HandStats, StatsSums } from "./api.js";
import type { SavedGame } from "./runner.js";
import type { HistoryLine } from "./settings.js";

export const ZERO_HAND_STATS: HandStats = {
  hands: 0,
  riichi: 0,
  dealIns: 0,
  handsWon: 0,
  winPoints: 0,
};

export function newGameId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  // These IDs are deduplication keys, never authentication tokens. Even
  // old runtimes must produce the UUID shape required by the database.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic UUIDv8 for imported legacy rows, with an application-specific
 * noncryptographic 128-bit hash. This is an identity key, not a security hash.
 * The occurrence distinguishes genuinely separate identical stored lines. */
function legacyGameId(identity: string, occurrence: number): string {
  const text = `openmahjong.legacy-history.v1:${identity}:${occurrence}`;
  const words = [0x811c9dc5, 0x9e3779b9, 0x243f6a88, 0xb7e15162];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    for (let lane = 0; lane < words.length; lane++) {
      words[lane] = Math.imul(words[lane]! ^ code, 0x01000193 + lane * 2);
    }
  }
  const bytes = new Uint8Array(16);
  words.forEach((word, lane) => {
    // Avalanche each lane so nearby timestamps do not share visible prefixes.
    word = Math.imul(word ^ (word >>> 16), 0x85ebca6b);
    word = Math.imul(word ^ (word >>> 13), 0xc2b2ae35);
    word ^= word >>> 16;
    for (let offset = 0; offset < 4; offset++) bytes[lane * 4 + offset] = word >>> (offset * 8);
  });
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

/** Reconcile the old dual-written browser stores without deleting either.
 * A full record's replay identifies its human seat; legacy-only summaries
 * have no seat field and use the App's normal human seat 0. A full
 * record wins over at most one matching legacy line, and only within the
 * observed write order and a one-second completion window. Wider matches
 * would risk hiding a separate game with coincidentally equal results. */
export function mergeLocalGameRecords(
  records: readonly GameRecord[],
  legacy: readonly HistoryLine[],
): GameRecord[] {
  const matched = new Set<number>();
  const occurrences = new Map<string, number>();
  const remaining: GameRecord[] = [];
  for (const line of legacy) {
    const identity = JSON.stringify([line.date, line.length, line.humanRank, line.scores]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const time = Date.parse(line.date);
    let nearest = -1;
    let nearestDelay = Infinity;
    records.forEach((record, index) => {
      if (matched.has(index) || record.length !== line.length ||
        record.placement !== line.humanRank || record.score !== line.scores[record.log?.humanSeat ?? 0]) return;
      const delay = Date.parse(record.finishedAt) - time;
      if (delay >= 0 && delay <= 1000 && delay < nearestDelay) {
        nearest = index;
        nearestDelay = delay;
      }
    });
    if (nearest >= 0) {
      matched.add(nearest);
      continue;
    }
    remaining.push({
      id: legacyGameId(identity, occurrence), length: line.length,
      placement: line.humanRank, score: line.scores[0] ?? 0,
      finishedAt: line.date, log: null, stats: { ...ZERO_HAND_STATS },
    });
  }
  return [...remaining, ...records].sort((a, b) =>
    Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
}

/**
 * Hand statistics for one finished game, folded from its event log:
 * - hands: hands dealt (hand-start events, abortive restarts included —
 *   the hand was played);
 * - riichi: the player's riichi declarations;
 * - dealIns: hands the player lost by ron — a win event whose fromSeat
 *   is the player;
 * - handsWon / winPoints: hands the player won, and the points those
 *   wins paid (hand payments plus riichi sticks, the breakdown's
 *   "gained" figure).
 */
export function computeHandStats(
  events: readonly GameEvent[],
  humanSeat: Seat,
): HandStats {
  let hands = 0;
  let riichi = 0;
  let dealIns = 0;
  let handsWon = 0;
  let winPoints = 0;
  for (const ev of events) {
    if (ev.type === "hand-start") {
      hands++;
    } else if (ev.type === "riichi") {
      if (Number(ev["seat"]) === humanSeat) riichi++;
    } else if (ev.type === "win") {
      const winner = Number(ev["seat"]);
      if (ev["winType"] === "ron" && Number(ev["fromSeat"]) === humanSeat) {
        dealIns++;
      }
      if (winner === humanSeat) {
        handsWon++;
        const payments = (ev["payments"] as readonly { amount: number }[]) ?? [];
        winPoints +=
          payments.reduce((s, p) => s + p.amount, 0) +
          Number(ev["stickPoints"] ?? 0);
      }
    }
  }
  return { hands, riichi, dealIns, handsWon, winPoints };
}

export function buildGameRecord(args: {
  id: string;
  length: GameLength;
  placement: number;
  score: number;
  finishedAt: string;
  log: SavedGame | null;
  events: readonly GameEvent[];
  humanSeat: Seat;
}): GameRecord {
  return {
    id: args.id,
    length: args.length,
    placement: args.placement,
    score: args.score,
    finishedAt: args.finishedAt,
    log: args.log,
    stats: args.events.length > 0
      ? computeHandStats(args.events, args.humanSeat)
      : { ...ZERO_HAND_STATS },
  };
}

/** Sum game records into Stats-screen sums (guest view / local math). */
export function sumRecords(
  records: readonly { placement: number; finishedAt: string; stats: HandStats }[],
): StatsSums {
  let wins = 0;
  let placementSum = 0;
  let hands = 0;
  let riichi = 0;
  let dealIns = 0;
  let handsWon = 0;
  let winPoints = 0;
  let since: string | null = null;
  for (const r of records) {
    if (r.placement === 1) wins++;
    placementSum += r.placement;
    hands += r.stats.hands;
    riichi += r.stats.riichi;
    dealIns += r.stats.dealIns;
    handsWon += r.stats.handsWon;
    winPoints += r.stats.winPoints;
    if (!since || r.finishedAt < since) since = r.finishedAt;
  }
  return {
    games: records.length,
    wins,
    placementSum,
    hands,
    riichi,
    dealIns,
    handsWon,
    winPoints,
    since,
  };
}

// ---------------------------------------------------------------------------
// Formatting (rendering 04: every rate carries its sample)
// ---------------------------------------------------------------------------

export interface StatBlock {
  readonly value: string;
  readonly label: string;
  readonly sample?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

/** "Nov 11" from an ISO date, for the "Since …" sample line. */
export function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The six Stats blocks, in rendering order. When `handStats` is false
 * (guest records that predate hand-stat capture), only the three
 * game-level blocks are produced — rates are never invented.
 */
export function formatStatsView(
  sums: StatsSums,
  opts: { handStats: boolean },
): StatBlock[] {
  const blocks: StatBlock[] = [];
  const since = sinceLabel(sums.since);
  blocks.push({
    value: fmt(sums.games),
    label: "Games played",
    ...(since ? { sample: `Since ${since}` } : {}),
  });
  blocks.push({
    value: pct(sums.wins, sums.games),
    label: "Win rate",
    sample: `${sums.wins} of ${sums.games} games`,
  });
  blocks.push({
    value: sums.games > 0 ? (sums.placementSum / sums.games).toFixed(1) : "—",
    label: "Avg placement",
    sample: `${sums.games} games`,
  });
  if (opts.handStats) {
    blocks.push({
      value: pct(sums.riichi, sums.hands),
      label: "Riichi rate",
      sample: `${sums.riichi} of ${sums.hands} hands`,
    });
    blocks.push({
      value: pct(sums.dealIns, sums.hands),
      label: "Deal-in rate",
      sample: `${sums.dealIns} of ${sums.hands} hands`,
    });
    blocks.push({
      value: sums.handsWon > 0 ? fmt(Math.round(sums.winPoints / sums.handsWon)) : "—",
      label: "Avg winning hand",
      sample: `${sums.handsWon} hands won`,
    });
  }
  return blocks;
}

/** The landing record strip: "Games 12 · Won 3 · Avg place 2.4". */
export function formatRecordStrip(sums: StatsSums): {
  games: number;
  wins: number;
  avgPlace: string;
} {
  return {
    games: sums.games,
    wins: sums.wins,
    avgPlace: sums.games > 0 ? (sums.placementSum / sums.games).toFixed(1) : "—",
  };
}

export function placementLabel(rank: number): string {
  return { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }[rank] ?? `#${rank}`;
}

/** "Today" / "Yesterday" / the History date — the home Last game card. */
export function relativeDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayStart = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return historyDateLabel(iso);
}

/** "Mon, Nov 16" — the History row date format (rendering 03). */
export function historyDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// First-sign-in import (brief T4)
// ---------------------------------------------------------------------------

/**
 * Offer the import exactly when: signed in, this device holds local
 * games, the account holds none yet, and the offer has not already been
 * imported or dismissed on this device.
 */
export function shouldOfferImport(args: {
  signedIn: boolean;
  localCount: number;
  serverGames: number | null;
  handled: boolean;
}): boolean {
  return (
    args.signedIn &&
    !args.handled &&
    args.localCount > 0 &&
    args.serverGames === 0
  );
}

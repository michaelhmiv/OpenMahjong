/**
 * The Open Mahjong Practice Card — data, notation and feasibility.
 *
 * The card data ships verbatim in practice-card.json (invented for
 * Open Mahjong from the pattern grammar of American mahjong; no
 * published card was consulted — see the generation record in the
 * design docs). This module is the app's typed view of that file,
 * plus the feasibility checker: check-card.mjs from the card's
 * design phase, re-expressed here so the card's physical legality
 * is guarded by the repo's own tests (test/american-card.test.ts).
 */
import cardData from "./practice-card.json" with { type: "json" };

export const PRACTICE_CARD_LABEL =
  "Practice Card — an original training card, not the official National Mah Jongg League card";

export type AmericanGroup =
  | { readonly kind: "number"; readonly count: number; readonly rank: number; readonly suit: 0 | 1 | 2 }
  | { readonly kind: "wind"; readonly count: number; readonly wind: "N" | "E" | "W" | "S" }
  | { readonly kind: "dragon"; readonly count: number; readonly dragon: "green" | "red" | "white" }
  | { readonly kind: "flower"; readonly count: number };

export interface AmericanHand {
  readonly id: string;
  readonly section: string;
  readonly notation: string;
  readonly groups: readonly AmericanGroup[];
  readonly value: number;
  readonly exposure: "X" | "C";
  readonly minJokers: number;
  readonly suitsUsed: number;
  readonly description: string;
}

export interface AmericanCardSection {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
}

export interface PracticeCard {
  readonly title: string;
  readonly label: string;
  readonly sections: readonly AmericanCardSection[];
  readonly hands: readonly AmericanHand[];
  readonly notationKey: Readonly<Record<string, string>>;
}

export const PRACTICE_CARD: PracticeCard = (
  cardData as { card: PracticeCard }
).card;

export function cardSections(): readonly AmericanCardSection[] {
  return PRACTICE_CARD.sections;
}

export function sectionHands(sectionId: string): readonly AmericanHand[] {
  return PRACTICE_CARD.hands.filter((h) => h.section === sectionId);
}

export function cardHandCount(): number {
  return PRACTICE_CARD.hands.length;
}

/** The glyph a group prints as (a rank digit, a wind letter, D for a
 * dragon, F for a flower), repeated to the group's count. */
export function groupGlyph(group: AmericanGroup): string {
  switch (group.kind) {
    case "number":
      return String(group.rank).repeat(group.count);
    case "wind":
      return group.wind.repeat(group.count);
    case "dragon":
      return "D".repeat(group.count);
    case "flower":
      return "F".repeat(group.count);
  }
}

/** The notation ink class a group renders in. Colour is data: the
 * class follows the group's suit (or its dragon kind), exactly as
 * the approved card renderings typeset it. The three non-palette
 * inks behind s1/drg/drw are recorded in design-rules §17. */
export function groupInkClass(group: AmericanGroup): string {
  switch (group.kind) {
    case "number":
      return `s${group.suit}`;
    case "wind":
      return "wnd";
    case "flower":
      return "fl";
    case "dragon":
      return group.dragon === "green"
        ? "drg"
        : group.dragon === "red"
          ? "drr"
          : "drw";
  }
}

/** A hand's notation as (text, ink class) spans — the printed
 * notation string zipped with the structured groups, the same
 * pairing the rendering generator asserted. */
export function handNotationSpans(
  hand: AmericanHand,
): { text: string; ink: string }[] {
  const tokens = hand.notation.split(" ");
  return hand.groups.map((group, i) => ({
    text: tokens[i] ?? groupGlyph(group),
    ink: groupInkClass(group),
  }));
}

// ---------------------------------------------------------------------------
// Feasibility — the check-card.mjs proof, as a pure function.
//
// The American set: 3 suits (Bams, Craks, Dots) ranks 1-9, four
// copies of each tile; 4 winds and 3 dragons, four copies each;
// 8 flowers; 8 jokers. A hand is feasible when it totals 14 tiles,
// its printed notation regenerates exactly from its groups, no tile
// is demanded beyond its four natural copies except where the
// overflow sits inside a group of three or more (the only places a
// joker may stand — never a single, never a pair), flowers stay
// within eight, and the jokers required equal the declared
// minJokers and stay within eight.
// ---------------------------------------------------------------------------

const COPIES = 4;
const FLOWERS_IN_SET = 8;
const JOKERS_IN_SET = 8;
const HAND_SIZE = 14;

function tileKey(group: AmericanGroup): string {
  switch (group.kind) {
    case "number":
      return `suit${group.suit}:${group.rank}`;
    case "wind":
      return `wind:${group.wind}`;
    case "dragon":
      return `dragon:${group.dragon}`;
    case "flower":
      return "flower";
  }
}

/** Returns the list of feasibility failures; empty means the whole
 * card is physically buildable from the 152-tile set. */
export function checkPracticeCard(card: PracticeCard): string[] {
  const failures: string[] = [];
  const fail = (id: string, msg: string) => failures.push(`${id}: ${msg}`);

  if (card.label !== PRACTICE_CARD_LABEL) {
    fail("CARD", `label mismatch: "${card.label}"`);
  }
  if (!Array.isArray(card.sections) || card.sections.length !== 9) {
    fail("CARD", `expected 9 sections, found ${card.sections?.length}`);
  }
  const sectionIds = new Set((card.sections ?? []).map((s) => s.id));
  const seenIds = new Set<string>();

  for (const hand of card.hands) {
    const id = hand.id || "(no id)";
    if (seenIds.has(id)) fail(id, "duplicate hand id");
    seenIds.add(id);
    if (!sectionIds.has(hand.section)) {
      fail(id, `unknown section "${hand.section}"`);
    }
    if (hand.exposure !== "X" && hand.exposure !== "C") {
      fail(id, `exposure must be "X" or "C", found "${hand.exposure}"`);
    }
    if (!Number.isFinite(hand.value) || hand.value <= 0) {
      fail(id, `missing or invalid value "${hand.value}"`);
    }
    if (!hand.description || hand.description.trim().length === 0) {
      fail(id, "missing description");
    }

    const total = hand.groups.reduce((n, g) => n + g.count, 0);
    if (total !== HAND_SIZE) {
      fail(id, `totals ${total} tiles, must be ${HAND_SIZE}`);
    }

    const regenerated = hand.groups.map(groupGlyph).join(" ");
    if (regenerated !== hand.notation) {
      fail(
        id,
        `notation drift: groups give "${regenerated}", card prints "${hand.notation}"`,
      );
    }

    const demand = new Map<string, number>();
    const absorb = new Map<string, number>();
    let flowerDemand = 0;
    for (const group of hand.groups) {
      if (!Number.isInteger(group.count) || group.count < 1 || group.count > 5) {
        fail(id, `group count ${group.count} outside 1-5`);
      }
      if (group.kind === "flower") {
        flowerDemand += group.count;
      } else {
        const key = tileKey(group);
        demand.set(key, (demand.get(key) ?? 0) + group.count);
        if (group.count >= 3) {
          absorb.set(key, (absorb.get(key) ?? 0) + group.count);
        }
      }
    }
    if (flowerDemand > FLOWERS_IN_SET) {
      fail(id, `needs ${flowerDemand} flowers, only ${FLOWERS_IN_SET} exist`);
    }

    let jokersNeeded = 0;
    for (const [key, d] of demand) {
      if (d > COPIES) {
        const short = d - COPIES;
        const capacity = absorb.get(key) ?? 0;
        if (short > capacity) {
          fail(
            id,
            `${key}: needs ${d} copies but only ${COPIES} exist, and only ${capacity} of them sit in groups of 3+ where a joker may stand — the overflow lands in a single or pair, which a joker can never fill`,
          );
        } else {
          jokersNeeded += short;
        }
      }
    }
    if (jokersNeeded > JOKERS_IN_SET) {
      fail(id, `needs ${jokersNeeded} jokers, only ${JOKERS_IN_SET} exist`);
    }
    if (jokersNeeded !== hand.minJokers) {
      fail(
        id,
        `declared minJokers ${hand.minJokers} but the tiles require ${jokersNeeded}`,
      );
    }

    if (hand.section === "singles-and-pairs") {
      if (hand.groups.some((g) => g.count > 2)) {
        fail(id, "Singles & Pairs hand contains a group larger than a pair");
      }
      if (hand.exposure !== "C") {
        fail(id, "Singles & Pairs hands must be concealed (C)");
      }
    }
  }
  return failures;
}

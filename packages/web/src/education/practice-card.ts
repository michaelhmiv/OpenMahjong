/**
 * The Open Mahjong Practice Card — the original training card the
 * American lessons teach from.
 *
 * The card's one canonical data source is practice-card.json, the
 * Phase-1 source of truth (generation record alongside it in
 * practice-card-generation.md): the card view reads the same file
 * through american-card.ts, and this module is the lessons' typed
 * view of it, so the lessons, the card view and the tests all read
 * one set of facts and can never drift apart. Every hand was
 * invented for Open Mahjong from the pattern grammar of American
 * mahjong; no published card was consulted.
 */
import cardData from "./practice-card.json" with { type: "json" };

export interface PracticeCardGroup {
  readonly count: number;
  readonly kind: "number" | "wind" | "dragon" | "flower";
  readonly rank?: number;
  readonly suit?: number;
  readonly wind?: string;
  readonly dragon?: string;
}
export interface PracticeCardHand {
  readonly id: string;
  readonly section: string;
  readonly notation: string;
  readonly value: number;
  /** "X" = exposures allowed; "C" = concealed only. */
  readonly exposure: "X" | "C";
  readonly minJokers: number;
  readonly suitsUsed: number;
  readonly description: string;
  readonly groups: readonly PracticeCardGroup[];
}
export interface PracticeCardSection {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
}

interface PracticeCardData {
  readonly label: string;
  readonly sections: readonly PracticeCardSection[];
  readonly hands: readonly PracticeCardHand[];
}

const card = (cardData as { card: PracticeCardData }).card;

export const PRACTICE_CARD_LABEL = card.label;
export const PRACTICE_CARD_SECTIONS: readonly PracticeCardSection[] =
  card.sections;
export const PRACTICE_CARD_HANDS: readonly PracticeCardHand[] = card.hands;

export const practiceCardHand = (id: string): PracticeCardHand => {
  const hand = PRACTICE_CARD_HANDS.find((h) => h.id === id);
  if (!hand) throw new Error(`Unknown practice card hand: ${id}`);
  return hand;
};
/** Total tiles a card hand uses: the sum of its group sizes. */
export const practiceCardTiles = (hand: PracticeCardHand): number =>
  hand.groups.reduce((sum, g) => sum + g.count, 0);

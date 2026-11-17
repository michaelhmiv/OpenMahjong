/** Saved practice references contain no hidden tiles, event logs, or outcomes.
 * Resolve the record and its player-perspective decision before presenting it. */
import { SKILLS, type SkillId } from "./curriculum.js";

export const REVIEW_COLLECTION_KEY = "openmahjong.review-practice.v1";
export const MAX_REVIEW_POSITIONS = 50;
// References cover the largest supported (schema-three) log. Resolving the
// record still validates its actual variant, version and decision count.
export const MAX_REFERENCED_DECISIONS = 50_000;
export interface ReviewPracticePosition {
  readonly recordId: string;
  readonly decisionIndex: number;
  readonly skills: readonly SkillId[];
  readonly addedAt: number;
}
export interface ReviewCollection {
  readonly schemaVersion: 1;
  /** Newest first; ties use record ID then decision index. */
  readonly items: readonly ReviewPracticePosition[];
}
const empty = (): ReviewCollection => ({ schemaVersion: 1, items: [] });
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function position(value: unknown): ReviewPracticePosition | null {
  if (!object(value)) return null;
  const { recordId, decisionIndex, skills, addedAt } = value;
  if (typeof recordId !== "string" || !recordId.trim() || recordId.length > 128 ||
      typeof decisionIndex !== "number" || !Number.isSafeInteger(decisionIndex) || decisionIndex < 0 || decisionIndex >= MAX_REFERENCED_DECISIONS ||
      typeof addedAt !== "number" || !Number.isSafeInteger(addedAt) || addedAt < 0 || addedAt > 8_000_000_000_000_000 ||
      !Array.isArray(skills) || skills.length > SKILLS.length ||
      !skills.every((skill) => SKILLS.includes(skill))) return null;
  return { recordId, decisionIndex, skills: SKILLS.filter((skill) => skills.includes(skill)), addedAt };
}
function combine(candidates: readonly ReviewPracticePosition[]): ReviewCollection {
  const unique = new Map<string, ReviewPracticePosition>();
  for (const candidate of candidates) {
    const key = `${candidate.recordId}:${candidate.decisionIndex}`;
    const previous = unique.get(key);
    unique.set(key, previous ? {
      recordId: candidate.recordId, decisionIndex: candidate.decisionIndex,
      addedAt: Math.max(previous.addedAt, candidate.addedAt),
      skills: SKILLS.filter((skill) => previous.skills.includes(skill) || candidate.skills.includes(skill)),
    } : candidate);
  }
  return { schemaVersion: 1, items: [...unique.values()].sort((a, b) => b.addedAt - a.addedAt ||
    (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : a.decisionIndex - b.decisionIndex))
    .slice(0, MAX_REVIEW_POSITIONS) };
}

/** Reject oversized envelopes before traversal; invalid individual entries do
 * not remove valid siblings. Rebuild only the documented reference fields. */
export function parseReviewCollection(value: unknown): ReviewCollection {
  if (!object(value) || value["schemaVersion"] !== 1 || !Array.isArray(value["items"]) ||
      value["items"].length > MAX_REVIEW_POSITIONS) return empty();
  return combine(value["items"].map(position).filter((item): item is ReviewPracticePosition => item !== null));
}

/** Latest timestamp and skill union resolve duplicate references identically
 * on either device. Truncation retains the most recent fifty references. */
export function mergeReviewCollections(a: ReviewCollection, b: ReviewCollection): ReviewCollection {
  return combine([...parseReviewCollection(a).items, ...parseReviewCollection(b).items]);
}

export function addReviewPosition(collection: ReviewCollection, item: ReviewPracticePosition): ReviewCollection {
  return mergeReviewCollections(collection, { schemaVersion: 1, items: [item] });
}
export function loadReviewCollection(): ReviewCollection {
  try {
    const raw = localStorage.getItem(REVIEW_COLLECTION_KEY);
    return parseReviewCollection(raw && raw.length <= 64 * 1024 ? JSON.parse(raw) : null);
  } catch { return empty(); }
}
export function saveReviewCollection(collection: ReviewCollection): void {
  try { localStorage.setItem(REVIEW_COLLECTION_KEY, JSON.stringify(parseReviewCollection(collection))); }
  catch { /* Browser storage is optional; gameplay and review remain usable. */ }
}

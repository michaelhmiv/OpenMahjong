// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILLS } from "../src/education/curriculum.js";
import {
  REVIEW_COLLECTION_KEY, MAX_REVIEW_POSITIONS, addReviewPosition,
  loadReviewCollection, mergeReviewCollections, parseReviewCollection, saveReviewCollection,
  type ReviewCollection, type ReviewPracticePosition,
} from "../src/education/review-collection.js";

const entry = (recordId = "record", decisionIndex = 0, addedAt = 100): ReviewPracticePosition => ({
  recordId, decisionIndex, addedAt, skills: ["shanten"],
});
const collection = (...items: ReviewPracticePosition[]): ReviewCollection => ({ schemaVersion: 1, items });
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("saved review references", () => {
  it("rebuilds only documented fields and never persists hidden game material", () => {
    const parsed = parseReviewCollection({ schemaVersion: 1, seed: "private", items: [{
      ...entry(), skills: ["ukeire", "shanten", "ukeire"], seed: "secret",
      events: [{ type: "deal", tiles: [1, 2, 3] }], hiddenHands: [[0, 1]], log: { decisions: [] },
    }] });
    expect(parsed).toEqual(collection({ ...entry(), skills: ["shanten", "ukeire"] }));
    saveReviewCollection(parsed);
    expect(loadReviewCollection()).toEqual(parsed);
    const raw = localStorage.getItem(REVIEW_COLLECTION_KEY)!;
    expect(raw).not.toMatch(/seed|events|hiddenHands|decisions|log/);
  });

  it("drops malformed references while retaining valid siblings and bounds before traversal", () => {
    const invalid: unknown[] = [null, [], {}, { ...entry(), recordId: "" }, { ...entry(), recordId: "  " },
      { ...entry(), recordId: "x".repeat(129) }, { ...entry(), decisionIndex: -1 },
      { ...entry(), decisionIndex: 50_000 }, { ...entry(), decisionIndex: 0.5 },
      { ...entry(), decisionIndex: Infinity }, { ...entry(), addedAt: NaN },
      { ...entry(), addedAt: -1 }, { ...entry(), addedAt: 8_000_000_000_000_001 },
      { ...entry(), skills: ["unknown"] }, { ...entry(), skills: "shanten" },
      { ...entry(), skills: new Array(SKILLS.length + 1).fill("shanten") }];
    expect(parseReviewCollection({ schemaVersion: 1, items: [entry(), ...invalid] })).toEqual(collection(entry()));
    for (const raw of [null, [], {}, { schemaVersion: 2, items: [entry()] },
      { schemaVersion: 1, items: new Array(MAX_REVIEW_POSITIONS + 1).fill(entry()) }]) {
      expect(parseReviewCollection(raw)).toEqual(collection());
    }
    expect(parseReviewCollection(collection(entry("x".repeat(128), 19_999, 8_000_000_000_000_000)))).toEqual(
      collection(entry("x".repeat(128), 19_999, 8_000_000_000_000_000)),
    );
    expect(parseReviewCollection(collection(entry("long-variant-record", 49_999))))
      .toEqual(collection(entry("long-variant-record", 49_999)));
  });

  it("merges duplicates with deterministic timestamp/skill conflicts and is idempotent", () => {
    const a = collection(entry("one", 4, 100), entry("two", 3, 300));
    const b = collection({ ...entry("one", 4, 200), skills: ["defense", "ukeire"] });
    const merged = mergeReviewCollections(a, b);
    expect(merged).toEqual(collection(entry("two", 3, 300), {
      ...entry("one", 4, 200), skills: ["shanten", "ukeire", "defense"],
    }));
    expect(mergeReviewCollections(b, a)).toEqual(merged);
    expect(mergeReviewCollections(merged, merged)).toEqual(merged);
    expect(parseReviewCollection(collection(...a.items, ...b.items))).toEqual(merged);
    expect(addReviewPosition(merged, entry("one", 4, 150))).toEqual(merged);
    const tiedA = collection({ ...entry("one", 4, 200), skills: ["defense"] });
    const tiedB = collection({ ...entry("one", 4, 200), skills: ["scoring"] });
    expect(mergeReviewCollections(tiedA, tiedB)).toEqual(mergeReviewCollections(tiedB, tiedA));
  });

  it("keeps the newest fifty references and uses stable ties without mutating inputs", () => {
    const a = collection(...Array.from({ length: 50 }, (_, i) => entry("match", i, i)));
    const before = JSON.stringify(a);
    const merged = addReviewPosition(a, entry("new-match", 0, 60));
    expect(merged.items).toHaveLength(50);
    expect(merged.items[0]).toEqual(entry("new-match", 0, 60));
    expect(merged.items.some((item) => item.recordId === "match" && item.decisionIndex === 0)).toBe(false);
    expect(JSON.stringify(a)).toBe(before);
    expect(parseReviewCollection(collection(entry("b", 0), entry("a", 2), entry("a", 1))).items)
      .toEqual([entry("a", 1), entry("a", 2), entry("b", 0)]);
    expect(parseReviewCollection(collection(entry("a:1", 2), entry("a", 12))).items).toHaveLength(2);
  });

  it("handles corrupt or unavailable browser storage without throwing", () => {
    for (const raw of ["invalid-json", JSON.stringify({ schemaVersion: 2, items: [] }), " ".repeat(65 * 1024)]) {
      localStorage.setItem(REVIEW_COLLECTION_KEY, raw);
      expect(loadReviewCollection()).toEqual(collection());
    }
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } });
    expect(loadReviewCollection()).toEqual(collection());
    expect(() => saveReviewCollection(collection(entry()))).not.toThrow();
  });
});

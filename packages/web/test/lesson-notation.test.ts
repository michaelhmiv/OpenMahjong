// @vitest-environment jsdom
/**
 * Lesson notation audit (acceptance-panel regression, 2026-11-17).
 *
 * The rebuild panel's hk-l6 agent found a hard crash: the Hong Kong
 * honors lesson pictured "111z222z333z444z11z" — five copies of East
 * (a triplet plus a pair of the same wind). The step runner resolves
 * each copy against the variant inventory (`t.id % 4 === c`); a fifth
 * copy resolves to nothing and the lesson dead-ended with no way
 * forward. Every notation a lesson shows — step tiles, pictured
 * hands, question tiles, tile-pick rows — must name at most four
 * copies of a kind and every copy must resolve in the inventory,
 * exactly as the runner looks it up.
 */
import { describe, expect, it } from "vitest";
import { parseCounts, variantAdapter } from "@openmahjong/engine";
import { VARIANT_LESSONS } from "../src/education/variant-content.js";
import { AMERICAN_TILE_INVENTORY } from "../src/education/american.js";

function notationsOf(lesson: (typeof VARIANT_LESSONS)[number]): string[] {
  const out: string[] = [];
  for (const step of lesson.steps) {
    if (step.tiles) out.push(step.tiles);
    if (step.hand) out.push(step.hand);
    const q = step.question;
    if (q && "tiles" in q && q.tiles) out.push(q.tiles);
  }
  return out;
}

describe("variant lesson notations resolve in the inventory", () => {
  it("covers all four lesson tracks", () => {
    const variants = new Set(VARIANT_LESSONS.map((l) => l.variant));
    expect(variants.size).toBe(4);
    expect(VARIANT_LESSONS.length).toBe(41);
  });

  for (const lesson of VARIANT_LESSONS) {
    it(`${lesson.id}: every shown notation is a possible set of tiles`, () => {
      // The inventory the runner resolves this lesson's faces
      // against: the variant adapter's for the playable tracks;
      // American is training-only, has no adapter, and its mounter
      // supplies AMERICAN_TILE_INVENTORY instead.
      const inventory =
        (lesson.variant as string) === "american"
          ? AMERICAN_TILE_INVENTORY
          : variantAdapter(lesson.variant).inventory();
      for (const notation of notationsOf(lesson)) {
        const counts = parseCounts(notation);
        counts.forEach((count, type) => {
          expect(count, `${notation}: ${count} copies of type ${type}`).toBeLessThanOrEqual(4);
          for (let c = 0; c < count; c++) {
            const face = inventory.find((t) => t.type === type && t.id % 4 === c);
            expect(face, `${notation}: copy ${c} of type ${type} must resolve`).toBeDefined();
          }
        });
      }
    });
  }

  it("hk-honors: the Big Four Winds hand is four wind triplets and a dragon pair", () => {
    const lesson = VARIANT_LESSONS.find((l) => l.id === "hk-honors")!;
    const step = lesson.steps.find((s) => s.text?.includes("Big Four Winds with a pair"));
    expect(step?.hand).toBeDefined();
    const counts = parseCounts(step!.hand!);
    // Winds (types 27–30) are triplets; the pair is a dragon (31–33).
    for (const t of [27, 28, 29, 30]) expect(counts[t]).toBe(3);
    const pairTypes = [31, 32, 33].filter((t) => counts[t] === 2);
    expect(pairTypes.length).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(14);
  });
});

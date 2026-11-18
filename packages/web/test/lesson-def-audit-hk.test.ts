/**
 * Hong Kong definition audit (owner rule, Nov 17 2026): every term's
 * first mention in the HK track, in isolation, must itself carry a
 * plain-words definition; HK game surfaces must define their terms in
 * the lessons or gloss them in place.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VARIANT_LESSONS } from "../src/education/variant-content.js";
const HK = VARIANT_LESSONS.filter((l) => l.variant === "hong-kong");
const allText = HK.map((l) => l.steps.map((s) => s.text ?? "").join("\n")).join("\n");
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
describe("HK first-use definitions", () => {
  it("teaches tile counting before the inventory check", () => {
    const l1 = HK[0]!;
    const countIdx = l1.steps.findIndex((s) => s.text?.includes("34 ordinary kinds"));
    const qIdx = l1.steps.findIndex((s) => s.question?.id === "hk-inventory");
    expect(countIdx).toBeGreaterThanOrEqual(0);
    expect(countIdx).toBeLessThan(qIdx);
    expect(l1.steps[countIdx]!.text).toContain("its inventory");
    expect(l1.steps[countIdx]!.text).toContain("A kind is one distinct face");
  });
  it("equates flowers with bonus tiles in L1, L4 and L8", () => {
    expect(allText).toContain("also called flowers");
    expect(HK[3]!.steps[0]!.text).toContain("also called flowers");
    expect(allText).toContain("flower is the short name for a bonus tile");
  });
  it("defines pattern, meld, eligible and exposed at first use", () => {
    expect(allText).toContain("A pattern is a named feature of a hand");
    expect(allText).toContain("also called a meld");
    expect(allText).toContain("eligible means allowed to be declared a win");
    expect(allText).toContain("Exposed means placed face-up beside your hand");
  });
  it("teaches every engine pattern name a HK win can show", () => {
    for (const name of ["Full Flush", "One Suit With Honors", "Four Quads", "Last Wall Tile", "Final Discard"])
      expect(allText, name).toContain(name);
    expect(allText).toContain("worth seven fan");
    expect(allText).toContain("worth eighteen fan");
    expect(allText).toContain("winning by robbing an added quad earns one fan");
  });
  it("teaches winds concretely: round wind, seat wind, dealer", () => {
    const l6 = HK[5]!;
    const t = l6.steps.map((s) => s.text ?? "").join("\n");
    expect(t).toContain("the round wind is East");
    expect(t).toContain("your seat wind is South");
    expect(t).toContain("the dealer's seat wind is East");
  });
});
describe("HK surface glosses", () => {
  it("glosses pung/kong/chow, live tiles, hand number and repeat on the table", () => {
    const t = src("variant-table-ui.ts");
    expect(t).toContain("a triplet (pung) is a claim");
    expect(t).toContain("an open quad (kong) is a claim");
    expect(t).toContain("a sequence (chow) is a claim");
    expect(t).toContain("Live tiles are the tiles still left to draw");
    expect(t).toContain("Repeat counts extra hands");
    expect(t).not.toContain("Clear Chapter");
    expect(t).not.toContain("heuristic");
  });
  it("glosses spicy scales, the discarder-all split, meld and circumstances in the calculator", () => {
    const c = src("variant-calculator-ui.ts");
    expect(c).toContain("Half-spicy is the fan conversion taught in the lessons");
    expect(c).toContain("Discarder pays three base shares means");
    expect(c).toContain("A meld is a set you have shown or declared");
    expect(c).toContain("the last unexposed copy is the final copy");
  });
});

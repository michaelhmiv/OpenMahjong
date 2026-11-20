import { describe, expect, it } from "vitest";
import glossaryData from "../src/i18n/glossary.json";
import enData from "../src/i18n/locales/en.json";

/**
 * Glossary gate (brief-i18n-v1 Phase 1, CI layer 1):
 * the locked glossary is well-formed, English forms are filled, every
 * other core locale is explicitly untranslated (null — never invented),
 * and no English string renders the CPU opponent as "AI" (the glossary
 * locks "Bot" in every locale).
 *
 * Call/noun split (resolved Nov 20, 2026, Michael's approval):
 * English lesson prose uses "pung" (96 strings, measured — the
 * Phase 1 count of 61 was wrong) alongside "Pon". Phase 2 research
 * (~/workspace/mahjong-prep/pung-pon-research.md) rules they are
 * NOT the same term: Pon is the riichi call, Pung is the triplet noun
 * used by American / MCR / Hong Kong / Taiwanese copy, and every locale
 * splits call vs noun the same way. The glossary therefore locks them
 * as separate terms (pon / pung), and the MCR pattern names — proper
 * names, not compositions — are locked as their own pattern-* entries.
 * Researched per-locale forms ride as non-locking `research`
 * annotations; locked forms stay null until a native speaker decides.
 */

const GLOSSARY = glossaryData as {
  meta: { locales: string[] };
  terms: Record<string, { en: string; locales: Record<string, string | null> }>;
};
const EN_VALUES = Object.values(
  (enData as { keys: Record<string, { value: string }> }).keys,
).map((k) => k.value);

describe("glossary file", () => {
  it("covers the core 5 locales", () => {
    expect(GLOSSARY.meta.locales).toEqual(["en", "zh-Hans", "zh-Hant", "ja", "ko"]);
  });

  it("has exactly the 28 locked terms (12 terms + pung split + 7 MCR pattern names + 4 winds + 3 dragons + Bot)", () => {
    const ids = Object.keys(GLOSSARY.terms).sort();
    expect(ids).toEqual([
      "bot", "chi", "dora", "dragon-green", "dragon-red", "dragon-white",
      "fu", "furiten", "han", "honba", "kan",
      "pattern-all-pungs", "pattern-double-pung",
      "pattern-four-pure-shifted-pungs", "pattern-mixed-shifted-pungs",
      "pattern-pure-shifted-pungs", "pattern-triple-pung",
      "pattern-two-dragons-pungs",
      "pon", "pung", "riichi", "ron",
      "tsumo", "wind-east", "wind-north", "wind-south", "wind-west",
      "yakuman",
    ]);
  });

  it("locks the call and the noun as separate terms (pon / pung split)", () => {
    // The research finding: Pon is the riichi call, Pung is the triplet
    // noun — one locked term cannot express both (see header comment).
    expect(GLOSSARY.terms["pon"].en).toBe("Pon");
    expect(GLOSSARY.terms["pung"].en).toBe("Pung");
  });

  it("locks the MCR pattern names as their own terms", () => {
    // Proper names, not compositions of the pung noun — each pattern-*
    // term's English form is the pattern name used by the MCR guide
    // keys (learn.mcr.guide.pattern.<slug>.name).
    const patterns: Record<string, string> = {
      "pattern-all-pungs": "All Pungs",
      "pattern-double-pung": "Double Pung",
      "pattern-four-pure-shifted-pungs": "Four Pure Shifted Pungs",
      "pattern-mixed-shifted-pungs": "Mixed Shifted Pungs",
      "pattern-pure-shifted-pungs": "Pure Shifted Pungs",
      "pattern-triple-pung": "Triple Pung",
      "pattern-two-dragons-pungs": "Two Dragons Pungs",
    };
    for (const [id, en] of Object.entries(patterns)) {
      expect(GLOSSARY.terms[id]?.en, id).toBe(en);
    }
  });

  it("fills every English form and leaves every other locale explicitly null", () => {
    for (const [id, term] of Object.entries(GLOSSARY.terms)) {
      expect(term.en.trim().length, `${id} en`).toBeGreaterThan(0);
      for (const locale of ["zh-Hans", "zh-Hant", "ja", "ko"]) {
        expect(term.locales[locale], `${id} ${locale}`).toBeNull();
      }
    }
  });

  it("every locked English form is actually used in the English copy", () => {
    for (const [id, term] of Object.entries(GLOSSARY.terms)) {
      const re = new RegExp(term.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      expect(
        EN_VALUES.some((v) => re.test(v)),
        `${id} (${term.en}) appears in en.json`,
      ).toBe(true);
    }
  });
});

describe("Bot, never AI", () => {
  it("no English string calls the opponent AI", () => {
    const offenders = EN_VALUES.filter((v) => /\bAI\b/.test(v));
    expect(offenders).toEqual([]);
  });

  it("no English string says 'AI opponent'", () => {
    expect(EN_VALUES.filter((v) => /AI opponent/i.test(v))).toEqual([]);
  });
});

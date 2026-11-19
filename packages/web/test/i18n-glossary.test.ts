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
 * Known open question (flagged, not reworded — extraction only):
 * English lesson prose also uses "pung" (61 strings) alongside the locked
 * "Pon". Phase 2 must rule whether "pung" occurrences are the same term
 * before translators render them.
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

  it("has exactly the 20 locked terms (12 terms + 4 winds + 3 dragons + Bot)", () => {
    const ids = Object.keys(GLOSSARY.terms).sort();
    expect(ids).toEqual([
      "bot", "chi", "dora", "dragon-green", "dragon-red", "dragon-white",
      "fu", "furiten", "han", "honba", "kan", "pon", "riichi", "ron",
      "tsumo", "wind-east", "wind-north", "wind-south", "wind-west",
      "yakuman",
    ]);
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

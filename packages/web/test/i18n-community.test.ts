// @vitest-environment jsdom
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCurrentLocale,
  improveTranslationUrl,
  initI18n,
  resetI18nForTests,
  TRANSLATIONS_GUIDE_URL,
} from "../src/i18n/index.js";
import { computeCoverage } from "../../../scripts/i18n-coverage.mjs";
import {
  analyzeApprovalDiff,
  checkLockedForms,
  valueLineOf,
} from "../../../scripts/i18n-approval-gate.mjs";
import { buildImproveTranslationLink } from "../src/app.js";

/**
 * Community review path (community-review-design.md): the `reviewed`
 * status in the loader, the dashboard's community-review coverage, the
 * no-self-approval gate (R1/R2/R3) with the locked-form check (R4), and
 * the "Improve this translation" link. Loader/display fixtures are
 * seeded; the dashboard fixtures are synthetic roots. Display rule
 * (PR #90 ship + PR #92 merge): `approved` always shows, `draft` and
 * `reviewed` show in a machine-translated ship locale, `stale` and
 * `missing` fall back to English.
 */

describe("improveTranslationUrl", () => {
  it("returns null for English (nothing to improve)", () => {
    expect(improveTranslationUrl("en")).toBeNull();
  });

  it("returns the contributor guide URL for a non-English locale", () => {
    expect(improveTranslationUrl("ja")).toBe(TRANSLATIONS_GUIDE_URL);
    expect(improveTranslationUrl("ja")).toBe(
      "https://github.com/michaelhmiv/OpenMahjong/blob/main/docs/translating.md",
    );
  });
});

describe("keyStatus with reviewed entries", () => {
  it("reports reviewed, and t() shows it in a machine-translated locale (not elsewhere)", async () => {
    const mod = (await import("../src/i18n/index.js")) as typeof import("../src/i18n/index.js");
    const enKeys = mod.getEnglishKeys();
    const key = "ui.app.play";
    const enHash = enKeys[key]!.hash;
    const enValue = enKeys[key]!.value;
    const reviewedEntry = { value: "プレイ", hash: enHash, status: "reviewed" as const };
    mod.registerLocale("ja", {
      meta: { locale: "ja" },
      keys: {
        [key]: reviewedEntry,
      },
    });
    // A non-machine-translated locale with the same reviewed entry:
    // review rides with draft, so it falls back to English there.
    mod.registerLocale("fr", {
      meta: { locale: "fr" },
      keys: {
        [key]: reviewedEntry,
      },
    });
    expect(mod.keyStatus(key, "ja")).toBe("reviewed");
    // Reviewed shows in a machine-translated ship locale (PR #90
    // display rule, extended by PR #92): review is a step up from
    // draft, so marking a draft reviewed must never hide it.
    mod.initI18n({ pathname: "/ja/" });
    expect(mod.getCurrentLocale()).toBe("ja");
    expect(mod.t(key)).toBe("プレイ");
    // ...but not in a locale outside MACHINE_TRANSLATED_LOCALES.
    expect(mod.tForLocale(key, "fr", enValue)).toBe(enValue);
    mod.resetI18nForTests();
  });

  it("reports approved for a hash-current approved entry", async () => {
    const mod = (await import("../src/i18n/index.js")) as typeof import("../src/i18n/index.js");
    const enKeys = mod.getEnglishKeys();
    const key = "ui.app.learn";
    const enHash = enKeys[key]!.hash;
    mod.registerLocale("ko", {
      meta: { locale: "ko" },
      keys: {
        [key]: { value: "배우기", hash: enHash, status: "approved" },
      },
    });
    expect(mod.keyStatus(key, "ko")).toBe("approved");
    mod.resetI18nForTests();
  });
});

describe("dashboard community-review coverage", () => {
  function fixtureRoot() {
    const dir = mkdtempSync(join(tmpdir(), "om-i18n-community-"));
    const localesDir = join(dir, "packages", "web", "src", "i18n", "locales");
    mkdirSync(localesDir, { recursive: true });
    const en = {
      meta: { sourceLocale: "en" },
      keys: {
        "a.one": { value: "One", hash: "h1", source: { file: "x.ts", line: 1 }, status: "approved" },
        "a.two": { value: "Two", hash: "h2", source: { file: "x.ts", line: 2 }, status: "approved" },
        "a.three": { value: "Three", hash: "h3", source: { file: "x.ts", line: 3 }, status: "approved" },
        "a.four": { value: "Four", hash: "h4", source: { file: "x.ts", line: 4 }, status: "approved" },
      },
    };
    const glossary = {
      meta: { locales: ["en", "ja"], sourceLocale: "en", note: "" },
      terms: { pon: { en: "Pon", locales: { ja: "ポン" } } },
    };
    writeFileSync(join(localesDir, "en.json"), JSON.stringify(en));
    writeFileSync(
      join(dir, "packages", "web", "src", "i18n", "glossary.json"),
      JSON.stringify(glossary),
    );
    return { dir, localesDir };
  }

  it("counts reviewed separately and reports % community-reviewed", () => {
    const { dir, localesDir } = fixtureRoot();
    try {
      const ja = {
        meta: { locale: "ja" },
        keys: {
          "a.one": { value: "一", hash: "h1", status: "approved" },
          "a.two": { value: "二", hash: "h2", status: "reviewed" },
          "a.three": { value: "三", hash: "h3", status: "draft" },
          "a.four": { value: "四", hash: "WRONG", status: "approved" },
        },
      };
      writeFileSync(join(localesDir, "ja.json"), JSON.stringify(ja));
      const report = computeCoverage(dir);
      const lang = report.languages["ja"];
      expect(lang.approved).toBe(1);
      expect(lang.reviewed).toBe(1);
      expect(lang.draft).toBe(1);
      expect(lang.stale).toBe(1);
      expect(lang.missing).toBe(0);
      expect(lang.percentApproved).toBe(25);
      expect(lang.percentCommunityReviewed).toBe(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gates on community-reviewed, not on approved alone", () => {
    const { dir, localesDir } = fixtureRoot();
    try {
      // Every shipped locale 100% reviewed and 0% approved passes the
      // gate: community review is the working bar in the community
      // era. (All four shipped draft locales need files in the
      // fixture — a shipped locale with no file is missing-file and
      // fails the gate on its own.)
      for (const locale of ["ja", "ko", "zh-Hans", "zh-Hant"]) {
        const data = {
          meta: { locale },
          keys: {
            "a.one": { value: "一", hash: "h1", status: "reviewed" },
            "a.two": { value: "二", hash: "h2", status: "reviewed" },
            "a.three": { value: "三", hash: "h3", status: "reviewed" },
            "a.four": { value: "四", hash: "h4", status: "reviewed" },
          },
        };
        writeFileSync(join(localesDir, `${locale}.json`), JSON.stringify(data));
      }
      const report = computeCoverage(dir);
      expect(report.languages["ja"].percentApproved).toBe(0);
      expect(report.languages["ja"].percentCommunityReviewed).toBe(100);
      // No baseline in the fixture root, so every key is new/changed —
      // and every one of them is reviewed, so the gate passes.
      expect(report.languages["ja"].newChanged).toBe(4);
      expect(report.languages["ja"].newChangedReviewed).toBe(4);
      expect(report.gate).toBe("pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("approval gate (no self-approval)", () => {
  const enKeys = {
    "a.one": { value: "Declare Pon to open your hand." },
    "a.two": { value: "A pung is an open triplet." },
  };
  const glossary = {
    terms: {
      pon: { en: "Pon", locales: { ja: "ポン" } },
      kan: { en: "Kan", locales: { ja: "カン" } },
    },
  };
  const entry = (value: string, status: string) => ({ value, hash: "h", status });

  it("R1: value changed + approved in the same PR fails", () => {
    const { failures } = analyzeApprovalDiff({
      baseFiles: { ja: { keys: { "a.one": entry("旧い訳", "draft") } } },
      headFiles: { ja: { keys: { "a.one": entry("新しい訳ポン", "approved") } } },
      enKeys, glossary,
    });
    expect(failures.some((f) => f.includes("R1"))).toBe(true);
  });

  it("R2: value changed + reviewed in the same PR fails", () => {
    const { failures } = analyzeApprovalDiff({
      baseFiles: { ja: { keys: { "a.one": entry("旧い訳", "draft") } } },
      headFiles: { ja: { keys: { "a.one": entry("新しい訳ポン", "reviewed") } } },
      enKeys, glossary,
    });
    expect(failures.some((f) => f.includes("R2"))).toBe(true);
  });

  it("value changed + draft passes R1/R2", () => {
    const { failures } = analyzeApprovalDiff({
      baseFiles: { ja: { keys: { "a.one": entry("旧い訳", "draft") } } },
      headFiles: { ja: { keys: { "a.one": entry("新しい訳ポン", "draft") } } },
      enKeys, glossary,
    });
    expect(failures).toEqual([]);
  });

  it("R3: status flip by the wording's author fails; by a second person passes", () => {
    const base = { ja: { keys: { "a.one": entry("訳ポン", "draft") } } };
    const head = { ja: { keys: { "a.one": entry("訳ポン", "reviewed") } } };
    const valueAuthorOf = () => ({ name: "Aya", email: "aya@example.jp" });
    const self = analyzeApprovalDiff({
      baseFiles: base, headFiles: head, enKeys, glossary, valueAuthorOf,
      prAuthors: [{ name: "Aya", email: "aya@example.jp" }],
    });
    expect(self.failures.some((f) => f.includes("R3"))).toBe(true);
    const other = analyzeApprovalDiff({
      baseFiles: base, headFiles: head, enKeys, glossary, valueAuthorOf,
      prAuthors: [{ name: "Ben", email: "ben@example.com" }],
    });
    expect(other.failures).toEqual([]);
  });

  it("R3 without git history warns instead of failing", () => {
    const { failures, warnings } = analyzeApprovalDiff({
      baseFiles: { ja: { keys: { "a.one": entry("訳ポン", "draft") } } },
      headFiles: { ja: { keys: { "a.one": entry("訳ポン", "reviewed") } } },
      enKeys, glossary,
    });
    expect(failures).toEqual([]);
    expect(warnings.some((w) => w.includes("R3 skipped"))).toBe(true);
  });

  it("a deleted entry fails", () => {
    const { failures } = analyzeApprovalDiff({
      baseFiles: { ja: { keys: { "a.one": entry("訳", "draft") } } },
      headFiles: { ja: { keys: {} } },
      enKeys, glossary,
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it("R4: a changed value that drops the locked form fails", () => {
    const failures = checkLockedForms(
      [{ locale: "ja", key: "a.one", enValue: "Declare Pon to open your hand.", newValue: "開いた手札を宣言する。" }],
      glossary,
    );
    expect(failures.length).toBe(1);
    expect(failures[0]).toMatch(/locked.*ポン/);
  });

  it("R4: a changed value that keeps the locked form passes", () => {
    expect(
      checkLockedForms(
        [{ locale: "ja", key: "a.one", enValue: "Declare Pon to open your hand.", newValue: "ポンを宣言して手札を開く。" }],
        glossary,
      ),
    ).toEqual([]);
  });

  it("R4: the pung exception skips the Pon-form requirement", () => {
    expect(
      checkLockedForms(
        [{ locale: "ja", key: "a.two", enValue: "A pung is an open triplet.", newValue: "ポンはオープンな刻子です。" }],
        glossary,
      ),
    ).toEqual([]);
    // Without the exception, a value that drops the form would fail;
    // with "pung" in the English source it must not.
    expect(
      checkLockedForms(
        [{ locale: "ja", key: "a.two", enValue: "A pung is an open triplet.", newValue: "刻子はオープンな組み合わせです。" }],
        glossary,
      ),
    ).toEqual([]);
  });

  it("R4: a null (undecided) locked form is skipped", () => {
    const undecided = { terms: { pon: { en: "Pon", locales: { ja: null } } } };
    expect(
      checkLockedForms(
        [{ locale: "ja", key: "a.one", enValue: "Declare Pon.", newValue: "宣言する。" }],
        undecided,
      ),
    ).toEqual([]);
  });

  it("valueLineOf finds a key's value line in pretty-printed locale JSON", () => {
    const text = [
      "{",
      '  "meta": {',
      '    "locale": "ja"',
      "  },",
      '  "keys": {',
      '    "a.one": {',
      '      "value": "一",',
      '      "hash": "h1",',
      '      "status": "draft"',
      "    },",
      '    "a.two": {',
      '      "value": "二",',
      '      "hash": "h2",',
      '      "status": "draft"',
      "    }",
      "  }",
      "}",
    ].join("\n");
    expect(valueLineOf(text, "a.one")).toBe(7);
    expect(valueLineOf(text, "a.two")).toBe(12);
    expect(valueLineOf(text, "a.missing")).toBeNull();
  });
});

describe("Improve this translation link", () => {
  it("is null in English and a guide link in a non-English locale", () => {
    resetI18nForTests();
    expect(getCurrentLocale()).toBe("en");
    expect(buildImproveTranslationLink()).toBeNull();

    initI18n({ pathname: "/ja/" });
    expect(getCurrentLocale()).toBe("ja");
    const link = buildImproveTranslationLink();
    expect(link).not.toBeNull();
    expect(link!.tagName).toBe("A");
    expect(link!.getAttribute("href")).toBe(TRANSLATIONS_GUIDE_URL);
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toBe("noreferrer");
    expect(link!.textContent).toBe("Improve this translation");
    resetI18nForTests();
  });
});

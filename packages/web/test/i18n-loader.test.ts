import { describe, expect, it } from "vitest";
import {
  SHIPPED_LOCALES,
  getCurrentLocale,
  initI18n,
  interpolate,
  keyStatus,
  registerLocale,
  resetI18nForTests,
  resolveLocale,
  t,
} from "../src/i18n/index.js";
import { SHIPPED_LOCALES as COVERAGE_SHIPPED } from "../../../scripts/i18n-coverage.mjs";
import enData from "../src/i18n/locales/en.json";

/**
 * Runtime loader (brief-i18n-v1 Phase 1): locale resolution, English
 * fallback, per-key status, interpolation. English is the only shipped
 * locale, so every lookup resolves to the English source string.
 */

describe("resolveLocale", () => {
  it("returns English when nothing matches", () => {
    expect(resolveLocale(["fr-FR", "de"])).toBe("en");
    expect(resolveLocale([])).toBe("en");
  });

  it("matches a shipped locale exactly", () => {
    expect(resolveLocale(["ja-JP"], ["en", "ja"])).toBe("ja");
    expect(resolveLocale(["zh-Hant-TW"], ["en", "zh-Hant"])).toBe("zh-Hant");
  });

  it("maps written Chinese by region and script", () => {
    const avail = ["en", "zh-Hans", "zh-Hant"];
    expect(resolveLocale(["zh-CN"], avail)).toBe("zh-Hans");
    expect(resolveLocale(["zh-TW"], avail)).toBe("zh-Hant");
    expect(resolveLocale(["zh-HK"], avail)).toBe("zh-Hant");
    expect(resolveLocale(["zh"], avail)).toBe("zh-Hans");
    expect(resolveLocale(["zh-Hans"], avail)).toBe("zh-Hans");
  });

  it("matches on the primary subtag and tolerates underscores", () => {
    expect(resolveLocale(["ja_JP"], ["en", "ja"])).toBe("ja");
    expect(resolveLocale(["ko-KR"], ["en", "ko"])).toBe("ko");
  });

  it("prefers the first language in the list", () => {
    expect(resolveLocale(["ja", "ko"], ["en", "ja", "ko"])).toBe("ja");
    expect(resolveLocale(["ko", "ja"], ["en", "ja", "ko"])).toBe("ko");
  });

  it("resolves everything to English while only English ships", () => {
    expect(resolveLocale(["ja-JP", "zh-CN", "ko-KR"])).toBe("en");
  });
});

describe("t() lookup with English fallback", () => {
  it("returns the English source for a known key", () => {
    resetI18nForTests();
    expect(t("ui.app.play")).toBe("Play");
    expect(t("ui.app.learn")).toBe("Learn");
    expect(t("ui.app.games")).toBe("Games");
    expect(t("ui.app.more")).toBe("More");
  });

  it("returns the key id itself for an unknown key", () => {
    resetI18nForTests();
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("falls back to English for a missing key in a registered locale", () => {
    resetI18nForTests();
    registerLocale("xx-missing", {
      meta: { locale: "xx-missing", status: "in-progress" },
      keys: {},
    });
    initI18n({ languages: ["xx-missing"], available: ["en", "xx-missing"] });
    expect(getCurrentLocale()).toBe("xx-missing");
    expect(t("ui.app.play")).toBe("Play");
    expect(keyStatus("ui.app.play", "xx-missing")).toBe("missing");
    resetI18nForTests();
  });

  it("shows a translation only when it is approved and current", () => {
    resetI18nForTests();
    const enEntry = (enData as { keys: Record<string, { value: string; hash: string }> }).keys["ui.app.play"]!;
    registerLocale("xx-approved", {
      meta: { locale: "xx-approved", status: "in-progress" },
      keys: {
        "ui.app.play": { value: "Jouer", hash: enEntry.hash, status: "approved" },
      },
    });
    initI18n({ languages: ["xx-approved"], available: ["en", "xx-approved"] });
    expect(getCurrentLocale()).toBe("xx-approved");
    expect(keyStatus("ui.app.play", "xx-approved")).toBe("approved");
    expect(t("ui.app.play")).toBe("Jouer");
    resetI18nForTests();
  });
});

describe("interpolate", () => {
  it("fills positional placeholders in order", () => {
    expect(interpolate("You have {0}; one group is still open.", ["5m"])).toBe(
      "You have 5m; one group is still open.",
    );
    expect(interpolate("{0} receives {1} points", ["East", "8000"])).toBe(
      "East receives 8000 points",
    );
  });

  it("leaves unknown placeholders visible instead of failing silently", () => {
    expect(interpolate("Hand value {0} points")).toBe("Hand value {0} points");
  });

  it("passes a string with no placeholders through unchanged", () => {
    expect(interpolate("Play")).toBe("Play");
  });
});

describe("keyStatus", () => {
  it("reports approved for every key in English", () => {
    resetI18nForTests();
    expect(keyStatus("ui.app.play")).toBe("approved");
    expect(keyStatus("learn.riichi.tu1.title")).toBe("approved");
  });

  it("reports missing for an unknown key", () => {
    expect(keyStatus("no.such.key")).toBe("missing");
  });

  it("reports missing for an untranslated locale", () => {
    expect(keyStatus("ui.app.play", "ja")).toBe("missing");
    expect(keyStatus("ui.app.play", "zh-Hans")).toBe("missing");
  });
});

describe("initI18n", () => {
  it("resolves from the given browser language list", () => {
    expect(initI18n({ languages: ["ja-JP"] })).toBe("en");
    expect(getCurrentLocale()).toBe("en");
    resetI18nForTests();
  });

  it("makes no network call and never leaves English in Phase 1", () => {
    // The loader imports static JSON only; initI18n is pure resolution.
    initI18n({ languages: ["zh-CN", "ja", "ko"] });
    expect(getCurrentLocale()).toBe("en");
    expect(t("ui.app.play")).toBe("Play");
    resetI18nForTests();
  });
});

describe("shipped-locale agreement", () => {
  it("the loader and the coverage script ship the same locales", () => {
    expect([...SHIPPED_LOCALES]).toEqual([...COVERAGE_SHIPPED]);
    expect(SHIPPED_LOCALES).toEqual(["en"]);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
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
 *
 * Activation paths are the URL locale and the remembered choice only:
 * the approved Track B design forbids a silent browser-detection
 * switch, so the browser list never activates a locale (see
 * i18n-routing.test.ts for the detection / sheet decision).
 */

beforeEach(() => {
  localStorage.clear();
  resetI18nForTests();
});

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

describe("keyStatus", () => {
  it("reports approved for every key in English", () => {
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

describe("t() lookup with English fallback", () => {
  it("returns the English source for a known key", () => {
    expect(t("ui.app.play")).toBe("Play");
    expect(t("ui.app.learn")).toBe("Learn");
    expect(t("ui.app.games")).toBe("Games");
    expect(t("ui.app.more")).toBe("More");
  });

  it("returns the key id itself for an unknown key", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("falls back to English for a missing key in a registered locale", () => {
    registerLocale("ko", {
      meta: { locale: "ko", status: "in-progress" },
      keys: {},
    });
    localStorage.setItem("openmahjong.locale.v1", "ko");
    initI18n({ available: ["en", "ko"] });
    expect(getCurrentLocale()).toBe("ko");
    expect(t("ui.app.play")).toBe("Play");
    expect(keyStatus("ui.app.play", "ko")).toBe("missing");
  });

  it("shows a translation only when it is approved and current", () => {
    const enEntry = (enData as { keys: Record<string, { value: string; hash: string }> }).keys["ui.app.play"]!;
    registerLocale("ja", {
      meta: { locale: "ja", status: "in-progress" },
      keys: {
        "ui.app.play": { value: "Jouer", hash: enEntry.hash, status: "approved" },
      },
    });
    localStorage.setItem("openmahjong.locale.v1", "ja");
    initI18n({ available: ["en", "ja"] });
    expect(getCurrentLocale()).toBe("ja");
    expect(keyStatus("ui.app.play", "ja")).toBe("approved");
    expect(t("ui.app.play")).toBe("Jouer");
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

describe("initI18n", () => {
  it("stays English on a clean first visit: the browser list never activates a locale", () => {
    // Approved Track B design: detection is offered by the
    // confirmation sheet, never silently switched to. Even with a
    // Japanese browser list, first visit is English until the user
    // picks — in the sheet or in the switcher.
    Object.defineProperty(window.navigator, "languages", {
      value: ["ja-JP"],
      configurable: true,
    });
    expect(initI18n()).toBe("en");
    expect(getCurrentLocale()).toBe("en");
  });

  it("activates the remembered choice", () => {
    localStorage.setItem("openmahjong.locale.v1", "ja");
    expect(initI18n({ available: ["en", "ja"] })).toBe("ja");
    expect(getCurrentLocale()).toBe("ja");
  });

  it("activates the URL locale", () => {
    expect(initI18n({ pathname: "/ja/", available: ["en", "ja"] })).toBe("ja");
    expect(getCurrentLocale()).toBe("ja");
  });

  it("makes no network call and never leaves English in Phase 1", () => {
    // The loader imports static JSON only; initI18n is pure resolution.
    initI18n();
    expect(getCurrentLocale()).toBe("en");
    expect(t("ui.app.play")).toBe("Play");
  });
});

describe("shipped-locale agreement", () => {
  it("the loader and the coverage script ship the same locales", () => {
    expect([...SHIPPED_LOCALES]).toEqual([...COVERAGE_SHIPPED]);
    expect(SHIPPED_LOCALES).toEqual(["en"]);
  });
});

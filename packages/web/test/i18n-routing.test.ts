// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import {
  SHIPPED_LOCALES,
  applyLocaleDocumentTags,
  canonicalUrlForLocale,
  detectLocale,
  firstVisitDetectedLocale,
  getCurrentLocale,
  initI18n,
  localeFromPath,
  pathForLocale,
  resetI18nForTests,
} from "../src/i18n/index.js";
import { SHIPPED_LOCALES as COVERAGE_SHIPPED } from "../../../scripts/i18n-coverage.mjs";

/**
 * Per-language URL structure + detection plumbing (brief-i18n-v1,
 * Phase 2 Track A) + Track B switcher semantics: English at the root,
 * one URL per shipped locale (e.g. /ja/, /zh-Hant/), browser detection
 * wired to the loader, remembered choice in localStorage (same pattern
 * as existing settings). Browser detection never activates a locale
 * on its own (approved Track B design: a detected locale is offered
 * by the first-visit confirmation sheet, never silently switched to),
 * so with no URL locale and no remembered choice the session is
 * English and `firstVisitDetectedLocale()` reports what the sheet
 * should offer. No locale ships in this track, so every resolution
 * still lands on English and the app renders exactly as before.
 */

beforeEach(() => {
  localStorage.clear();
  resetI18nForTests();
});

describe("localeFromPath", () => {
  it("reads a supported locale from the first path segment", () => {
    expect(localeFromPath("/ja/")).toBe("ja");
    expect(localeFromPath("/ja/learn/")).toBe("ja");
    expect(localeFromPath("/ja")).toBe("ja");
    expect(localeFromPath("/zh-Hant/")).toBe("zh-Hant");
    expect(localeFromPath("/zh-hant/calculator/")).toBe("zh-Hant");
    expect(localeFromPath("/zh-Hans/")).toBe("zh-Hans");
    expect(localeFromPath("/ko/")).toBe("ko");
    expect(localeFromPath("/en/")).toBe("en");
  });

  it("returns null for the root and for the app's own top-level routes", () => {
    expect(localeFromPath("/")).toBeNull();
    expect(localeFromPath("/learn/")).toBeNull();
    expect(localeFromPath("/riichi/")).toBeNull();
    expect(localeFromPath("/calculator/")).toBeNull();
    expect(localeFromPath("/privacy")).toBeNull();
    expect(localeFromPath("/fr/")).toBeNull();
  });
});

describe("pathForLocale", () => {
  it("prefixes a non-English locale and strips any existing prefix", () => {
    expect(pathForLocale("ja", "/")).toBe("/ja/");
    expect(pathForLocale("ja", "/learn/")).toBe("/ja/learn/");
    expect(pathForLocale("zh-Hant", "/ko/learn/")).toBe("/zh-Hant/learn/");
    expect(pathForLocale("ja", "/privacy")).toBe("/ja/privacy");
  });

  it("returns the bare path for English", () => {
    expect(pathForLocale("en", "/")).toBe("/");
    expect(pathForLocale("en", "/ja/learn/")).toBe("/learn/");
    expect(pathForLocale("en", "/privacy")).toBe("/privacy");
  });
});

describe("canonicalUrlForLocale", () => {
  it("puts English at the root and other locales under their prefix", () => {
    expect(canonicalUrlForLocale("en")).toBe("https://openmahjong.app/");
    expect(canonicalUrlForLocale("ja")).toBe("https://openmahjong.app/ja/");
    expect(canonicalUrlForLocale("zh-Hant")).toBe("https://openmahjong.app/zh-Hant/");
  });
});

describe("initI18n path precedence", () => {
  it("prefers the URL path locale over a remembered choice", () => {
    localStorage.setItem("openmahjong.locale.v1", "ko");
    expect(
      initI18n({ pathname: "/ja/", available: ["en", "ja", "ko"] }),
    ).toBe("ja");
    resetI18nForTests();
  });

  it("prefers a remembered choice over the browser list", () => {
    localStorage.setItem("openmahjong.locale.v1", "ko");
    expect(initI18n({ available: ["en", "ja", "ko"] })).toBe("ko");
    resetI18nForTests();
  });

  it("does NOT silently activate the browser-detected locale: first visit stays English", () => {
    // Approved Track B design: detection is offered by the
    // confirmation sheet, never silently switched to. The browser
    // list is therefore not an initI18n input at all — it is read by
    // detectLocale() / firstVisitDetectedLocale() for the sheet.
    expect(initI18n({ pathname: "/learn/", available: ["en", "ja", "ko"] })).toBe("en");
    resetI18nForTests();
  });

  it("a path locale for an unshipped locale still resolves to English", () => {
    // Drafts are data, not live: /ja/ serves English until ja ships.
    expect(initI18n({ pathname: "/ja/" })).toBe("en");
    expect(getCurrentLocale()).toBe("en");
    resetI18nForTests();
  });
});

describe("detectLocale", () => {
  it("reads the browser list among the available locales", () => {
    expect(detectLocale(["ko-KR"], ["en", "ja", "ko"])).toBe("ko");
    expect(detectLocale(["ja-JP"], ["en", "ja", "ko"])).toBe("ja");
    expect(detectLocale(["zh-TW"], ["en", "zh-Hans", "zh-Hant"])).toBe("zh-Hant");
    expect(detectLocale(["zh-CN"], ["en", "zh-Hans", "zh-Hant"])).toBe("zh-Hans");
    expect(detectLocale(["fr-FR"], ["en", "ja", "ko"])).toBe("en");
  });

  it("resolves to English while only English ships, whatever the browser says", () => {
    expect(detectLocale(["ja-JP"])).toBe("en");
    expect(detectLocale(["ko-KR"])).toBe("en");
  });
});

describe("firstVisitDetectedLocale", () => {
  it("offers the detected locale on a clean first visit", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: null,
        pathname: "/",
        languages: ["ja-JP"],
        available: ["en", "ja", "ko"],
      }),
    ).toBe("ja");
  });

  it("offers nothing when the browser already matches English", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: null,
        pathname: "/",
        languages: ["en-US"],
        available: ["en", "ja", "ko"],
      }),
    ).toBeNull();
  });

  it("offers nothing when a choice is already remembered", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: "en",
        pathname: "/",
        languages: ["ja-JP"],
        available: ["en", "ja", "ko"],
      }),
    ).toBeNull();
  });

  it("offers nothing when the URL already carries a locale", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: null,
        pathname: "/ja/",
        languages: ["ja-JP"],
        available: ["en", "ja", "ko"],
      }),
    ).toBeNull();
  });

  it("offers nothing while only English ships", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: null,
        pathname: "/",
        languages: ["ja-JP"],
      }),
    ).toBeNull();
  });
});

describe("applyLocaleDocumentTags", () => {
  it("sets lang + canonical for English and adds no unshipped alternates", () => {
    document.documentElement.lang = "";
    document.head.querySelectorAll('link[rel="alternate"][data-om-i18n]').forEach((el) => el.remove());
    applyLocaleDocumentTags("en");
    expect(document.documentElement.lang).toBe("en");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://openmahjong.app/");
    const alternates = [...document.querySelectorAll('link[rel="alternate"][data-om-i18n]')].map(
      (el) => `${el.getAttribute("hreflang")}=${el.getAttribute("href")}`,
    );
    expect(alternates).toEqual([
      "x-default=https://openmahjong.app/",
      "en=https://openmahjong.app/",
    ]);
  });

  it("is idempotent: a second call replaces the alternates instead of duplicating them", () => {
    applyLocaleDocumentTags("en");
    applyLocaleDocumentTags("en");
    expect(
      document.querySelectorAll('link[rel="alternate"][data-om-i18n]').length,
    ).toBe(2);
  });
});

describe("shipped-locale agreement across all three lists", () => {
  it("loader, coverage script, and static server ship the same locales", () => {
    const serverSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "server.mjs"),
      "utf8",
    );
    const m = serverSrc.match(/const SHIPPED_LOCALES = (\[[^\]]*\]);/);
    expect(m, "server.mjs must declare SHIPPED_LOCALES").toBeTruthy();
    const serverShipped = JSON.parse(m![1]!) as string[];
    expect(serverShipped).toEqual([...SHIPPED_LOCALES]);
    expect(serverShipped).toEqual([...COVERAGE_SHIPPED]);
    expect(serverShipped).toEqual(["en"]);
  });
});

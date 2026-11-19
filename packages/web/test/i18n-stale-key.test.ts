import { describe, expect, it } from "vitest";
import {
  keyStatus,
  registerLocale,
  resetI18nForTests,
  t,
  initI18n,
  getCurrentLocale,
} from "../src/i18n/index.js";
import enData from "../src/i18n/locales/en.json";

/**
 * Stale-key gate (brief-i18n-v1 Phase 1, CI layer 1):
 * if an English source string's hash changes, translations of that key
 * are stale — the app falls back to English and the dashboard counts the
 * key unapproved until it is re-translated and re-approved.
 *
 * The activated fixture is registered under "ja" (a supported locale
 * id) with invented data ("Jouer", ...), and activated through the URL
 * — the only activation inputs initI18n honours (URL > remembered >
 * English). Browser detection never activates a locale (Track B
 * design), so the old `initI18n({ languages: [...] })` activation is
 * gone; the loader tests activate the same way. "xx-lesson-changed"
 * is a registration-only fixture for the explicit-locale keyStatus
 * check in the last test.
 */

const EN_KEYS = (enData as { keys: Record<string, { value: string; hash: string }> }).keys;

function fixtureLocale(
  key: string,
  entry: { value: string; hash: string; status: "approved" | "draft" | "stale" },
) {
  registerLocale("ja", {
    meta: { locale: "ja", status: "in-progress" },
    keys: { [key]: entry },
  });
  initI18n({ pathname: "/ja/", available: ["en", "ja"] });
  expect(getCurrentLocale()).toBe("ja");
}

describe("stale-key gate", () => {
  it("an approved, current translation is shown", () => {
    resetI18nForTests();
    const en = EN_KEYS["ui.app.play"]!;
    fixtureLocale("ui.app.play", { value: "Jouer", hash: en.hash, status: "approved" });
    expect(keyStatus("ui.app.play")).toBe("approved");
    expect(t("ui.app.play")).toBe("Jouer");
    resetI18nForTests();
  });

  it("a translation whose English hash changed is stale and falls back to English", () => {
    resetI18nForTests();
    const en = EN_KEYS["ui.app.play"]!;
    // The translator rendered an older English source (different hash).
    fixtureLocale("ui.app.play", {
      value: "Jouer (old)",
      hash: "0000000000000000000000000000000000000000000000000000000000000000",
      status: "approved",
    });
    expect(en.hash).not.toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(keyStatus("ui.app.play")).toBe("stale");
    expect(t("ui.app.play")).toBe("Play");
    resetI18nForTests();
  });

  it("a draft translation is never shown, even with a matching hash", () => {
    resetI18nForTests();
    const en = EN_KEYS["ui.app.play"]!;
    fixtureLocale("ui.app.play", { value: "Jouer?", hash: en.hash, status: "draft" });
    expect(keyStatus("ui.app.play")).toBe("draft");
    expect(t("ui.app.play")).toBe("Play");
    resetI18nForTests();
  });

  it("a key marked stale in its own entry is stale", () => {
    resetI18nForTests();
    const en = EN_KEYS["ui.app.play"]!;
    fixtureLocale("ui.app.play", { value: "Jouer", hash: en.hash, status: "stale" });
    expect(keyStatus("ui.app.play")).toBe("stale");
    expect(t("ui.app.play")).toBe("Play");
    resetI18nForTests();
  });

  it("a changed English hash makes the real shipped locale stale, not approved", () => {
    // Same mechanism the dashboard uses: hash comparison against en.json.
    resetI18nForTests();
    const en = EN_KEYS["learn.riichi.tu1.title"]!;
    fixtureLocale("learn.riichi.tu1.title", {
      value: "Les tuiles",
      hash: en.hash,
      status: "approved",
    });
    expect(keyStatus("learn.riichi.tu1.title")).toBe("approved");
    // English changes: the stored hash no longer matches the current one.
    const changedHash = "f".repeat(64);
    expect(changedHash).not.toBe(en.hash);
    registerLocale("xx-lesson-changed", {
      meta: { locale: "xx-lesson-changed", status: "in-progress" },
      keys: {
        "learn.riichi.tu1.title": { value: "Les tuiles", hash: changedHash, status: "approved" },
      },
    });
    expect(keyStatus("learn.riichi.tu1.title", "xx-lesson-changed")).toBe("stale");
    resetI18nForTests();
  });
});

import { describe, expect, it } from "vitest";
import { computeCoverage } from "../../../scripts/i18n-coverage.mjs";
import { getCurrentLocale, resetI18nForTests, t } from "../src/i18n/index.js";

/**
 * Release gate, verified with drafts present (brief-i18n-v1, Phase 2
 * Track A). The four core locales hold machine drafts only: 0% approved,
 * so the gate MUST block any of them from shipping. The live gate still
 * passes because only English is shipped — the blocking is proven here
 * by the hypothetical: every draft locale fails the 100%-approved
 * condition the gate enforces, so adding any of them to SHIPPED_LOCALES
 * would flip the gate to fail.
 */

const DRAFT_LOCALES = ["zh-Hans", "zh-Hant", "ja", "ko"] as const;

describe("release gate with draft locales present", () => {
  it("the live gate passes: only English ships", () => {
    const report = computeCoverage();
    expect(report.gate).toBe("pass");
    expect(report.gateFailures).toEqual([]);
    expect(report.shippedLocales).toEqual(["en"]);
  });

  it("every draft locale is 0% approved and would fail the gate if shipped", () => {
    const report = computeCoverage();
    for (const locale of DRAFT_LOCALES) {
      const lang = report.languages[locale];
      expect(lang.shipped, `${locale} must not be shipped`).toBe(false);
      expect(lang.approved, `${locale} must have zero approved strings`).toBe(0);
      expect(lang.percentApproved, `${locale} must be 0% approved`).toBe(0);
      expect(lang.draft, `${locale} must hold drafts`).toBeGreaterThan(0);
      expect(lang.missing, `${locale} must have zero missing keys`).toBe(0);
      expect(lang.stale, `${locale} must have zero stale keys`).toBe(0);
      // The gate condition, applied hypothetically: shipped AND <100%
      // approved fails. Every draft locale satisfies it.
      expect(lang.percentApproved).toBeLessThan(100);
    }
  });

  it("drafts are data, not live: the app still renders English", () => {
    resetI18nForTests();
    expect(getCurrentLocale()).toBe("en");
    expect(t("ui.app.play")).toBe("Play");
    expect(t("learn.riichi.tu1.step01.text")).toContain("Mahjong is played with tiles.");
  });
});

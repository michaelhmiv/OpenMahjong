import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  loadBaseline,
  writeBaseline,
} from "../../../scripts/i18n-coverage.mjs";
import { getCurrentLocale, resetI18nForTests, t } from "../src/i18n/index.js";

/**
 * Release gate, verified with the core 5 shipped as machine
 * translations (brief-i18n-v1, PR #90 ship step; owner ruling Nov 19,
 * 2026: SHIP NOW, community reviews later).
 *
 * The four core locales hold machine drafts only: 0% approved. The
 * gate still passes, because baseline.json grandfathers every key
 * that shipped — the gate measures only keys that change AFTER the
 * snapshot, and right now there are none. The gate is proven to
 * still bite by the synthetic case below: change one English string
 * in a scratch copy and the gate fails on all four locales.
 *
 * Gate bar (community-review design §7.1, DECIDED Nov 19, 2026):
 * community-reviewed (`reviewed` + `approved`) on new/changed
 * strings, not approved-only.
 */

const DRAFT_LOCALES = ["zh-Hans", "zh-Hant", "ja", "ko"] as const;
const SHIPPED = ["en", "zh-Hans", "zh-Hant", "ja", "ko"];

describe("release gate with the core 5 shipped", () => {
  it("the live gate passes: five locales ship, baseline present", () => {
    const report = computeCoverage();
    expect(report.baseline).toBe("present");
    expect(report.gate).toBe("pass");
    expect(report.gateFailures).toEqual([]);
    expect(report.shippedLocales).toEqual(SHIPPED);
  });

  it("every draft locale is 0% approved but has zero new/changed keys", () => {
    const report = computeCoverage();
    for (const locale of DRAFT_LOCALES) {
      const lang = report.languages[locale];
      expect(lang.shipped, `${locale} must be shipped`).toBe(true);
      expect(lang.approved, `${locale} must have zero approved strings`).toBe(0);
      expect(lang.percentApproved, `${locale} must be 0% approved`).toBe(0);
      expect(lang.draft, `${locale} must hold drafts`).toBe(3807);
      // Exactly one missing key: the intentionally-English "Improve
      // this translation" link (design §1.1) — it renders in English
      // in every locale because the guide it opens is in English.
      expect(lang.missing, `${locale} must have one missing key`).toBe(1);
      expect(lang.stale, `${locale} must have zero stale keys`).toBe(0);
      expect(lang.newChanged, `${locale} must have zero new/changed keys`).toBe(0);
      expect(lang.newChangedApproved).toBe(0);
      expect(lang.percentApprovedNewChanged).toBe(100);
      expect(lang.newChangedReviewed).toBe(0);
      expect(lang.percentCommunityReviewedNewChanged).toBe(100);
    }
  });

  it("the baseline snapshots every shipped key", () => {
    const baseline = loadBaseline();
    expect(baseline).not.toBeNull();
    for (const locale of SHIPPED) {
      expect(
        Object.keys(baseline!.locales[locale]).length,
        `${locale} baseline coverage`,
      ).toBe(3808);
    }
  });

  it("the app renders the shipped drafts, not English fallback", () => {
    resetI18nForTests();
    expect(getCurrentLocale()).toBe("en");
    expect(t("ui.app.play")).toBe("Play");
  });
});

describe("release gate still bites on later changes (synthetic root)", () => {
  it("changing one English string fails the gate on all four draft locales", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const tmp = mkdtempSync(join(tmpdir(), "om-i18n-gate-"));
    try {
      const i18nSrc = join(repoRoot, "packages", "web", "src", "i18n");
      const i18nDst = join(tmp, "packages", "web", "src", "i18n");
      cpSync(i18nSrc, i18nDst, { recursive: true });
      // Simulate an English source change: new value + new hash.
      const enPath = join(i18nDst, "locales", "en.json");
      const en = JSON.parse(readFileSync(enPath, "utf8"));
      en.keys["ui.app.play"].value = "Play a game";
      en.keys["ui.app.play"].hash = "f".repeat(64);
      writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
      const report = computeCoverage(tmp);
      expect(report.gate).toBe("fail");
      expect(report.gateFailures).toHaveLength(4);
      for (const locale of DRAFT_LOCALES) {
        const lang = report.languages[locale];
        expect(lang.newChanged).toBe(1);
        expect(lang.newChangedApproved).toBe(0);
        expect(lang.newChangedReviewed).toBe(0);
        expect(
          report.gateFailures.some((f: string) => f.startsWith(`${locale}:`)),
          `${locale} must be in the failures`,
        ).toBe(true);
      }
      // English itself stays green: its own entry is approved.
      expect(report.languages["en"].newChangedApproved).toBe(1);
      expect(report.languages["en"].newChangedReviewed).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("baseline snapshots a missing key at its English hash, never a stale one", () => {
  function scratchCopy() {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const tmp = mkdtempSync(join(tmpdir(), "om-i18n-baseline-"));
    const i18nSrc = join(repoRoot, "packages", "web", "src", "i18n");
    const i18nDst = join(tmp, "packages", "web", "src", "i18n");
    cpSync(i18nSrc, i18nDst, { recursive: true });
    return { tmp, i18nDst };
  }

  it("a key missing from a locale is snapshotted (English fallback is the shipped rendering)", () => {
    const { tmp, i18nDst } = scratchCopy();
    try {
      // Delete one key from ja.json, as if it were intentionally
      // English-only (the Improve link is the real case).
      const jaPath = join(i18nDst, "locales", "ja.json");
      const ja = JSON.parse(readFileSync(jaPath, "utf8"));
      const en = JSON.parse(readFileSync(join(i18nDst, "locales", "en.json"), "utf8"));
      expect(ja.keys["ui.app.learn"]).toBeDefined();
      delete ja.keys["ui.app.learn"];
      writeFileSync(jaPath, JSON.stringify(ja, null, 2) + "\n");
      const baseline = writeBaseline(tmp);
      expect(baseline.locales["ja"]["ui.app.learn"]).toBe(
        en.keys["ui.app.learn"].hash,
      );
      // And the gate still passes: the absence is the accepted state.
      expect(computeCoverage(tmp).gate).toBe("pass");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("a stale entry is NOT snapshotted, so it counts as new/changed immediately", () => {
    const { tmp, i18nDst } = scratchCopy();
    try {
      const jaPath = join(i18nDst, "locales", "ja.json");
      const ja = JSON.parse(readFileSync(jaPath, "utf8"));
      ja.keys["ui.app.play"].hash = "0".repeat(64);
      writeFileSync(jaPath, JSON.stringify(ja, null, 2) + "\n");
      const baseline = writeBaseline(tmp);
      expect(baseline.locales["ja"]["ui.app.play"]).toBeUndefined();
      const report = computeCoverage(tmp);
      expect(report.gate).toBe("fail");
      expect(report.languages["ja"].newChanged).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODULES } from "../src/education/curriculum.js";
import { variantLessons } from "../src/education/variant-content.js";
import { AMERICAN_LESSONS } from "../src/education/american.js";
import enData from "../src/i18n/locales/en.json";

/**
 * Extraction drift gate (brief-i18n-v1 Phase 1, CI layer 1):
 * en.json must be exactly what scripts/extract-i18n.mjs produces from
 * the current sources — a hand edit, a missed string, or a stale file
 * fails the build. The extractor is the single source of truth for keys.
 *
 * Also asserts the inventory covers all 52 lesson titles (riichi 11 +
 * Hong Kong 10 + MCR 10 + Taiwanese 10 + American 11).
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const EN_VALUES = new Set(
  Object.values(
    (enData as { keys: Record<string, { value: string }> }).keys,
  ).map((k) => k.value),
);

describe("extraction drift gate", () => {
  it("en.json matches the extractor output (no drift)", () => {
    // Throws (non-zero exit) if en.json is stale; --check never writes.
    execSync("node scripts/extract-i18n.mjs --check", { cwd: ROOT, stdio: "pipe" });
  }, 60_000);

  it("covers all 52 lesson titles", () => {
    const titles = [
      ...MODULES.map((m) => m.title),
      ...variantLessons("hong-kong").map((l) => l.title),
      ...variantLessons("mcr").map((l) => l.title),
      ...variantLessons("taiwanese").map((l) => l.title),
      ...AMERICAN_LESSONS.map((l) => l.title),
    ];
    expect(titles).toHaveLength(52);
    const missing = titles.filter((title) => !EN_VALUES.has(title));
    expect(missing, `lesson titles missing from en.json: ${missing.join("; ")}`).toEqual([]);
  });

  it("the inventory is complete: 3,000+ keys across all surfaces", () => {
    const count = Object.keys(
      (enData as { keys: Record<string, unknown> }).keys,
    ).length;
    expect(count).toBeGreaterThan(3000);
  });
});

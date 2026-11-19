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

  it("nested tx() composes: an inner tx() inside an outer fallback template is its own key, not part of the outer value", () => {
    // app.ts builds a tile's aria-label as one outer tx() whose
    // template spans are themselves tx() calls (safe-against text,
    // selected/activate text). The template-branch rule says a display
    // fragment nested inside the fallback template's ${...} spans is
    // its own string: the outer key holds only the {N} placeholders,
    // and each inner fragment holds its own key. If the rule regressed,
    // the outer value would contain the inner text (and the inner keys
    // would collide or vanish).
    const keys = (enData as { keys: Record<string, { value: string }> })
      .keys;
    expect(keys["ui.app.v-0-1-2-3"]!.value).toBe("{0}{1}{2}");
    expect(keys["ui.app.safe-against-every-riichi-player"]!.value).toBe(
      ", safe against every riichi player",
    );
    expect(keys["ui.app.selected-activate-to-discard"]!.value).toBe(
      ", selected; activate to discard",
    );
    expect(keys["ui.app.activate-to-select"]!.value).toBe(
      "; activate to select",
    );
    expect(keys["ui.app.you"]!.value).toBe("· You");
    expect(keys["ui.app.dealer"]!.value).toBe("· Dealer");
  });
});

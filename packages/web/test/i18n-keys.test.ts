import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import enData from "../src/i18n/locales/en.json";

/**
 * Missing-key gate (brief-i18n-v1 Phase 1, CI layer 1):
 * every key referenced by a t("..."), tx("...", "English source"),
 * or tForLocale("...", locale, "English source") call site in
 * packages/web/src must exist in en.json. The reverse direction — no orphan keys in en.json — is covered by
 * i18n-extraction.test.ts, which asserts en.json is exactly the
 * extractor's output (the extractor only emits keys it found in code,
 * lesson data, or content pages).
 *
 * Phase 1 wiring is deliberately minimal: only the four tab labels go
 * through t() so far. The other 3,700+ keys are extracted and waiting
 * for Phase 2's component wiring; they are not orphans, they are the
 * inventory.
 *
 * REWIRE (brief-i18n-v1, this PR): Phase 2 is done — every render file
 * is wired through t()/tx(), enforced by scripts/check-i18n-wiring.mjs
 * (CI layer 3) and by i18n-derived-keys.test.ts (derived keys computed
 * from ids at render time). The comment above is history: the keys are
 * no longer waiting, they are the inventory AND the wiring.
 */

const SRC = "packages/web/src";
const enKeys = new Set(Object.keys((enData as { keys: Record<string, unknown> }).keys));

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function referencedKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  // t("key"), tx("key", "English source"), and tForLocale("key",
  // locale, "English source"): the first string argument is the key
  // in all three forms.
  const re = /\b(?:tx|tForLocale|t)\(\s*["']([^"']+)["']/g;
  for (const file of tsFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const key = m[1]!;
      const list = found.get(key) ?? [];
      list.push(file);
      found.set(key, list);
    }
  }
  return found;
}

describe("missing-key gate", () => {
  it("every t() / tx() call-site key exists in en.json", () => {
    const refs = referencedKeys();
    expect(refs.size).toBeGreaterThan(0);
    const missing = [...refs.entries()].filter(([key]) => !enKeys.has(key));
    expect(
      missing,
      `t() keys missing from en.json: ${missing.map(([k, fs]) => `${k} (${fs.join(", ")})`).join("; ")}`,
    ).toEqual([]);
  });

  it("the four wired tab labels resolve to the previous literals", () => {
    const keys = (enData as { keys: Record<string, { value: string }> }).keys;
    expect(keys["ui.app.play"]?.value).toBe("Play");
    expect(keys["ui.app.learn"]?.value).toBe("Learn");
    expect(keys["ui.app.games"]?.value).toBe("Games");
    expect(keys["ui.app.more"]?.value).toBe("More");
  });

  it("en.json is well-formed: every key has a value, a hash, and a source", () => {
    const keys = (enData as { keys: Record<string, { value?: unknown; hash?: unknown; source?: unknown; status?: unknown }> }).keys;
    for (const [key, entry] of Object.entries(keys)) {
      expect(typeof entry.value, `${key} value`).toBe("string");
      expect(typeof entry.hash, `${key} hash`).toBe("string");
      expect(entry.hash, `${key} hash`).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.source, `${key} source`).toBeTruthy();
      expect(entry.status, `${key} status`).toBe("approved");
    }
  });

  it("key ids are namespaced and stable (no spaces, no empty segments)", () => {
    // Segments may contain uppercase ids (e.g. Practice Card hand codes
    // like BK-1), which the extractor preserves verbatim.
    for (const key of enKeys) {
      expect(key, key).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
    }
  });
});

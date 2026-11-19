import { describe, expect, it } from "vitest";
import { placeholderMismatch, placeholdersOf, tileRefsOf } from "../../../scripts/i18n-coverage.mjs";
import enData from "../src/i18n/locales/en.json";

/**
 * Placeholder-mismatch gate (brief-i18n-v1 Phase 1, CI layer 1):
 * placeholders / numbers / tile references must match across locales.
 * The shipped draft locales are checked by the coverage dashboard's
 * placeholder scan (approved entries) and by the translate driver's
 * per-batch validation — so the gate itself is proven here with
 * seeded mismatch fixtures below (mutation evidence is recorded in
 * the PR body).
 */

describe("placeholder extraction", () => {
  it("finds positional placeholders in order", () => {
    expect(placeholdersOf("You have {0}; one group is still open.")).toEqual(["0"]);
    expect(placeholdersOf("{0} receives {1} points")).toEqual(["0", "1"]);
    expect(placeholdersOf("Play")).toEqual([]);
  });

  it("finds tile-notation references", () => {
    expect(tileRefsOf("Discard 5m or 2p")).toEqual(["5m", "2p"]);
    expect(tileRefsOf("Play")).toEqual([]);
  });
});

describe("placeholderMismatch", () => {
  it("passes when placeholders and tile refs match exactly", () => {
    expect(placeholderMismatch("You have {0}.", "Vous avez {0}.")).toEqual([]);
    expect(placeholderMismatch("{0} receives {1} points", "{0} reçoit {1} points")).toEqual([]);
  });

  it("passes when a translation reorders placeholders (valid i18n)", () => {
    expect(placeholderMismatch("{0} receives {1} points", "{1} points pour {0}")).toEqual([]);
  });

  it("fails on a missing placeholder (seeded mismatch)", () => {
    const problems = placeholderMismatch(
      "{0} receives {1} points",
      "{0} reçoit des points",
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/placeholders differ/);
  });

  it("fails on an invented placeholder (seeded mismatch)", () => {
    const problems = placeholderMismatch("Play", "Jouer {9}");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/placeholders differ/);
  });

  it("fails when tile references differ (seeded mismatch)", () => {
    const problems = placeholderMismatch("Discard 5m or 2p", "Défaussez 5m ou 3p");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/tile references differ/);
  });

  it("passes on every real English string against itself", () => {
    const keys = (enData as { keys: Record<string, { value: string }> }).keys;
    const failures: string[] = [];
    for (const [key, entry] of Object.entries(keys)) {
      const problems = placeholderMismatch(entry.value, entry.value);
      if (problems.length > 0) failures.push(`${key}: ${problems.join("; ")}`);
    }
    expect(failures).toEqual([]);
  });
});

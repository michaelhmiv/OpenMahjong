#!/usr/bin/env node
/**
 * i18n coverage dashboard + release gate (brief-i18n-v1, Phase 1).
 *
 * Reads the key files in packages/web/src/i18n/locales/ and the locked
 * glossary, and reports per-language % approved on new/changed strings.
 *
 * Baseline (PR #90 ship step, community-review design §4.2):
 * `packages/web/src/i18n/baseline.json` snapshots {key: hash} for the
 * strings shipped at a release. A key counts as new/changed only when
 * its hash differs from the baseline (or it has no baseline entry).
 * With no baseline file present, every key in en.json counts as
 * new/changed (the Phase 1 behaviour). The initial baseline IS the
 * one-time waiver for the machine-translation ship (owner ruling
 * Nov 19, 2026: SHIP NOW, community reviews later): every key that
 * shipped as a draft is grandfathered, and the gate measures only
 * keys that change after the snapshot. Generate it with
 * `node scripts/i18n-coverage.mjs --write-baseline`.
 *
 * Usage:
 *   node scripts/i18n-coverage.mjs            # human-readable report
 *   node scripts/i18n-coverage.mjs --json out/i18n-coverage.json
 *   node scripts/i18n-coverage.mjs --gate     # exit 1 if any SHIPPED
 *                                             # locale is <100% approved
 *                                             # on new/changed strings
 *   node scripts/i18n-coverage.mjs --write-baseline
 *                                             # (re)generate baseline.json
 *                                             # from the shipped locales
 *
 * SHIPPED_LOCALES must match the loader's SHIPPED_LOCALES in
 * packages/web/src/i18n/index.ts; the i18n-loader test asserts they agree.
 * Only shipped locales are gated — unshipped locales report 0% and are
 * listed, never failed.
 *
 * Cost: $0. This script reads local files only; it makes no network calls.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SHIPPED_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko"];
export const SUPPORTED_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko"];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const I18N_DIR = join(ROOT, "packages", "web", "src", "i18n");
const LOCALES_DIR = join(I18N_DIR, "locales");
export const BASELINE_PATH = join(I18N_DIR, "baseline.json");

/** Load baseline.json when present, else null (Phase 1 behaviour:
 *  every key counts as new/changed). */
export function loadBaseline(root = ROOT) {
  try {
    return JSON.parse(
      readFileSync(join(root, "packages", "web", "src", "i18n", "baseline.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

/** Snapshot {key: hash} for every hash-current entry in each shipped
 *  locale, and write it to baseline.json. A stale entry (hash mismatch
 *  vs English) is deliberately NOT snapshotted, so it counts as
 *  new/changed immediately. Returns the baseline object. */
export function writeBaseline(root = ROOT) {
  const localesDir = join(root, "packages", "web", "src", "i18n", "locales");
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const locales = {};
  for (const locale of SHIPPED_LOCALES) {
    let file;
    try {
      file = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8"));
    } catch {
      continue;
    }
    const snap = {};
    for (const [key, enEntry] of Object.entries(en.keys)) {
      const entry = file.keys?.[key];
      if (entry && entry.hash === enEntry.hash) snap[key] = entry.hash;
    }
    locales[locale] = snap;
  }
  const baseline = {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: "scripts/i18n-coverage.mjs --write-baseline",
      note: "Initial-ship snapshot (owner ruling Nov 19, 2026: SHIP NOW, community reviews later). Every shipped key hash-current at ship time is the baseline, so the release gate measures only keys that change AFTER this snapshot. This is the one-time waiver for the initial machine-translation ship; it does not exempt later changes.",
    },
    locales,
  };
  const outPath = join(root, "packages", "web", "src", "i18n", "baseline.json");
  writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
  return baseline;
}

/** Positional `{0}`, `{1}`, ... placeholders in a string, in order. */
export function placeholdersOf(value) {
  return [...String(value).matchAll(/\{(\d+)\}/g)].map((m) => m[1]);
}

/** Tile-notation references in a string (e.g. `5m`, `2p`, `9s`, `1z`). */
export function tileRefsOf(value) {
  return [...String(value).matchAll(/\b[1-9][mpsz]\b/g)].map((m) => m[0]);
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join(",");
  const sb = [...b].sort().join(",");
  return sa === sb;
}

/** Placeholder / tile-reference mismatch between an English source string
 *  and a translated string. Returns a list of problems (empty = match).
 *  Placeholder ORDER may differ across languages (reordering is valid
 *  i18n); the SETS must match, and the translation must not invent a
 *  placeholder the English string does not have. */
export function placeholderMismatch(enValue, translatedValue) {
  const problems = [];
  const enPh = placeholdersOf(enValue);
  const trPh = placeholdersOf(translatedValue);
  if (!sameSet(enPh, trPh)) {
    problems.push(
      `placeholders differ: en {${enPh.join(",")}} vs translation {${trPh.join(",")}}`,
    );
  }
  const enTiles = tileRefsOf(enValue);
  const trTiles = tileRefsOf(translatedValue);
  if (!sameSet(enTiles, trTiles)) {
    problems.push(
      `tile references differ: en [${enTiles.join(",")}] vs translation [${trTiles.join(",")}]`,
    );
  }
  return problems;
}

export function computeCoverage(root = ROOT) {
  const localesDir = join(root, "packages", "web", "src", "i18n", "locales");
  const i18nDir = join(root, "packages", "web", "src", "i18n");
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const glossary = JSON.parse(readFileSync(join(i18nDir, "glossary.json"), "utf8"));
  const enKeys = en.keys;
  const total = Object.keys(enKeys).length;
  const baseline = loadBaseline(root);

  const languages = {};
  for (const locale of SUPPORTED_LOCALES) {
    let file;
    try {
      file = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), "utf8"));
    } catch {
      file = null;
    }
    const shipped = SHIPPED_LOCALES.includes(locale);
    if (!file) {
      languages[locale] = {
        locale, shipped, status: "missing-file",
        total, approved: 0, draft: 0, stale: 0, missing: total,
        percentApproved: 0, placeholderMismatches: [], glossaryFilled: 0,
        glossaryTotal: Object.keys(glossary.terms).length,
        newChanged: total, newChangedApproved: 0, percentApprovedNewChanged: 0,
      };
      continue;
    }
    if (file.meta?.status === "untranslated") {
      languages[locale] = {
        locale, shipped, status: "untranslated",
        total, approved: 0, draft: 0, stale: 0, missing: total,
        percentApproved: 0, placeholderMismatches: [],
        glossaryFilled: 0,
        glossaryTotal: Object.keys(glossary.terms).length,
        newChanged: total, newChangedApproved: 0, percentApprovedNewChanged: 0,
      };
      continue;
    }
    let approved = 0;
    let draft = 0;
    let stale = 0;
    let missing = 0;
    let newChanged = 0;
    let newChangedApproved = 0;
    const mismatches = [];
    for (const [key, enEntry] of Object.entries(enKeys)) {
      // New/changed vs the baseline: no baseline entry for this key,
      // or the baseline hash differs from the current English hash.
      // With no baseline file, every key is new/changed.
      const baseHash = baseline?.locales?.[locale]?.[key];
      const isNewChanged = baseHash !== enEntry.hash;
      if (isNewChanged) {
        newChanged++;
        const entry = file.keys?.[key];
        if (entry && entry.hash === enEntry.hash && entry.status === "approved") {
          newChangedApproved++;
        }
      }
      const entry = file.keys?.[key];
      if (!entry) { missing++; continue; }
      if (entry.hash !== enEntry.hash) { stale++; continue; }
      if (entry.status === "approved") {
        approved++;
        const problems = placeholderMismatch(enEntry.value, entry.value);
        if (problems.length > 0) mismatches.push({ key, problems });
      } else if (entry.status === "draft") draft++;
      else stale++;
    }
    const glossaryFilled = Object.values(glossary.terms).filter(
      (t) => locale === "en" ? Boolean(t.en) : t.locales?.[locale] != null,
    ).length;
    languages[locale] = {
      locale, shipped,
      status: shipped ? "shipped" : "in-progress",
      total, approved, draft, stale, missing,
      percentApproved: total === 0 ? 100 : Math.round((approved / total) * 1000) / 10,
      placeholderMismatches: mismatches,
      glossaryFilled,
      glossaryTotal: Object.keys(glossary.terms).length,
      newChanged,
      newChangedApproved,
      percentApprovedNewChanged:
        newChanged === 0 ? 100 : Math.round((newChangedApproved / newChanged) * 1000) / 10,
    };
  }

  // The gate measures new/changed strings only: a shipped locale fails
  // when any key that changed after the baseline is not yet approved.
  // The initial baseline grandfathers the machine-translation ship
  // (all ship-time keys are baseline, so newChanged is 0 and the gate
  // passes); any key added or re-sourced afterwards must earn approval.
  const gateFailures = Object.values(languages)
    .filter((l) => l.shipped && l.newChangedApproved < l.newChanged)
    .map((l) => `${l.locale}: ${l.newChangedApproved}/${l.newChanged} new/changed approved (needs 100%)`);
  return {
    generatedAt: new Date().toISOString(),
    totalKeys: total,
    shippedLocales: [...SHIPPED_LOCALES],
    baseline: baseline ? "present" : "absent",
    languages,
    gate: gateFailures.length === 0 ? "pass" : "fail",
    gateFailures,
  };
}

export function renderHuman(report) {
  const lines = [];
  lines.push("i18n coverage — per-language % approved on new/changed strings");
  lines.push(`English keys (new/changed): ${report.totalKeys}`);
  lines.push(`Baseline: ${report.baseline ?? "absent"}${report.baseline === "present" ? " (gate measures keys changed after the snapshot)" : " (every key counts as new/changed)"}`);
  lines.push("");
  lines.push(
    "locale    shipped  approved  draft  stale  missing  % approved  new/changed  glossary",
  );
  for (const locale of SUPPORTED_LOCALES) {
    const l = report.languages[locale];
    const pad = (v, n) => String(v).padEnd(n);
    lines.push(
      `${pad(locale, 10)}${pad(l.shipped ? "yes" : "no", 9)}${pad(l.approved, 10)}${pad(l.draft, 7)}${pad(l.stale, 7)}${pad(l.missing, 9)}${pad(`${l.percentApproved}%`, 12)}${pad(`${l.newChangedApproved}/${l.newChanged}`, 13)}${l.glossaryFilled}/${l.glossaryTotal}`,
    );
  }
  lines.push("");
  lines.push(`Release gate: ${report.gate.toUpperCase()}`);
  if (report.gateFailures.length > 0) {
    for (const f of report.gateFailures) lines.push(`  FAIL: ${f}`);
  } else {
    lines.push("  Every shipped locale is 100% approved on new/changed strings.");
  }
  const mismatchCount = Object.values(report.languages).reduce(
    (n, l) => n + l.placeholderMismatches.length, 0,
  );
  lines.push(`Placeholder/tile-reference mismatches: ${mismatchCount}`);
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--write-baseline")) {
    const baseline = writeBaseline();
    const counts = Object.fromEntries(
      Object.entries(baseline.locales).map(([loc, snap]) => [loc, Object.keys(snap).length]),
    );
    console.log(`Wrote ${BASELINE_PATH} (${JSON.stringify(counts)})`);
    return;
  }
  const report = computeCoverage();
  const jsonIdx = args.indexOf("--json");
  if (jsonIdx !== -1 && args[jsonIdx + 1]) {
    const outPath = resolve(args[jsonIdx + 1]);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Wrote ${outPath}`);
  }
  console.log(renderHuman(report));
  if (args.includes("--gate") && report.gate !== "pass") {
    console.error("i18n release gate FAILED — see failures above.");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

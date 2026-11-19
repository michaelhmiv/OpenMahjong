#!/usr/bin/env node
/**
 * i18n coverage dashboard + release gate (brief-i18n-v1, Phase 1).
 *
 * Reads the key files in packages/web/src/i18n/locales/ and the locked
 * glossary, and reports per-language % approved on new/changed strings.
 *
 * Phase 1: there is no baseline file yet, so every key in en.json counts
 * as new/changed. (Phase 2's first translation run introduces a baseline;
 * until then "new/changed" == "all keys".)
 *
 * Usage:
 *   node scripts/i18n-coverage.mjs            # human-readable report
 *   node scripts/i18n-coverage.mjs --json out/i18n-coverage.json
 *   node scripts/i18n-coverage.mjs --gate     # exit 1 if any SHIPPED
 *                                             # locale is <100% approved
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

export const SHIPPED_LOCALES = ["en"];
export const SUPPORTED_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko"];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const I18N_DIR = join(ROOT, "packages", "web", "src", "i18n");
const LOCALES_DIR = join(I18N_DIR, "locales");

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
      };
      continue;
    }
    let approved = 0;
    let draft = 0;
    let stale = 0;
    let missing = 0;
    const mismatches = [];
    for (const [key, enEntry] of Object.entries(enKeys)) {
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
    };
  }

  const gateFailures = Object.values(languages)
    .filter((l) => l.shipped && l.percentApproved < 100)
    .map((l) => `${l.locale}: ${l.percentApproved}% approved (needs 100%)`);
  return {
    generatedAt: new Date().toISOString(),
    totalKeys: total,
    shippedLocales: [...SHIPPED_LOCALES],
    languages,
    gate: gateFailures.length === 0 ? "pass" : "fail",
    gateFailures,
  };
}

export function renderHuman(report) {
  const lines = [];
  lines.push("i18n coverage — per-language % approved on new/changed strings");
  lines.push(`English keys (new/changed): ${report.totalKeys}`);
  lines.push("");
  lines.push(
    "locale    shipped  approved  draft  stale  missing  % approved  glossary",
  );
  for (const locale of SUPPORTED_LOCALES) {
    const l = report.languages[locale];
    const pad = (v, n) => String(v).padEnd(n);
    lines.push(
      `${pad(locale, 10)}${pad(l.shipped ? "yes" : "no", 9)}${pad(l.approved, 10)}${pad(l.draft, 7)}${pad(l.stale, 7)}${pad(l.missing, 9)}${pad(`${l.percentApproved}%`, 12)}${l.glossaryFilled}/${l.glossaryTotal}`,
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

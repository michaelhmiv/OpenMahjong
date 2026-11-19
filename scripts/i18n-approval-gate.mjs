#!/usr/bin/env node
/**
 * i18n approval gate — no self-approval (community-review-design.md §3).
 *
 * A community correction must NOT be self-approved: the person who wrote
 * a translation's wording can never be the person who marks it `reviewed`
 * or `approved`. This script enforces the separation mechanically, from
 * the diff between a base ref and a head ref (a pull request):
 *
 *   R1  a key whose `value` changed in the PR must not be marked
 *       `approved` in the same PR.
 *   R2  a key whose `value` changed in the PR must not be marked
 *       `reviewed` in the same PR either — the wording and its review
 *       are separate PRs.
 *   R3  a key whose `status` flips to `reviewed`/`approved` with the
 *       value unchanged is rejected when the PR author is the author of
 *       the commit that last changed that key's `value` (checked with
 *       `git blame` on the base file). If git history is unavailable,
 *       R3 degrades to a warning and R1/R2 still enforce.
 *   R4  every key whose `value` changed is checked against the locked
 *       glossary forms for that locale: if the English source renders a
 *       locked term, the new value must contain that locale's locked
 *       form (when the form is decided — null forms are skipped). The
 *       "pung" exception: keys whose English source contains "pung" skip
 *       the Pon-form requirement until the pung-vs-Pon ruling lands
 *       (community-review-design.md §1.4).
 *
 * The script reads only the diff and local files; it makes no network
 * calls and sends no data anywhere. Git authorship is a tripwire, not a
 * security boundary — it stops honest mistakes and drive-by self-approval.
 * The backstop is the GitHub PR review itself (branch protection is a
 * maintainer action; see the design doc §3.2).
 *
 * Usage:
 *   node scripts/i18n-approval-gate.mjs [--base <ref>] [--head <ref>]
 *       [--author <name-or-email>] [--repo <path>]
 *   Defaults: --base origin/main, --head HEAD, --author $GITHUB_ACTOR.
 *   Exit 1 on any failure, 0 on pass (warnings do not fail).
 *
 * Cost: $0. Local files and git only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const I18N_DIR = join(ROOT, "packages", "web", "src", "i18n");
const LOCALES_DIR = join(I18N_DIR, "locales");

/** Locked terms whose English form is distinctive enough to check by
 *  word match. The four bare wind names are excluded: "East" / "South" /
 *  "West" / "North" are common words in the English copy ("East only",
 *  "East + South"), so requiring the locked wind form in every value that
 *  mentions them would false-positive. Wrong wind renderings are a
 *  human-review matter. */
export const CHECKED_TERMS = [
  "bot", "chi", "dora", "dragon-green", "dragon-red", "dragon-white",
  "fu", "furiten", "han", "honba", "kan", "pon", "riichi", "ron",
  "tsumo", "yakuman",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does the English source render a locked term? Word-boundary match on
 *  the English form, case-insensitive ("Pon" matches "Pon" and "pon";
 *  "Chi" must not match inside another word). */
export function englishRendersTerm(enValue, termEn) {
  return new RegExp(`\\b${escapeRegExp(termEn)}\\b`, "i").test(enValue);
}

/** R4: check changed keys' new values against the locked glossary forms.
 *  `changed` is [{ locale, key, enValue, newValue }]; `glossary` is the
 *  parsed glossary.json. Returns failure strings (empty = pass). */
export function checkLockedForms(changed, glossary) {
  const failures = [];
  for (const { locale, key, enValue, newValue } of changed) {
    if (locale === "en") continue;
    for (const termId of CHECKED_TERMS) {
      const term = glossary.terms?.[termId];
      if (!term) continue;
      const locked = term.locales?.[locale];
      if (locked == null || locked === "") continue; // form not decided yet
      if (!englishRendersTerm(enValue, term.en)) continue;
      // Open pung question: the English source says "pung" while the
      // locked term is "Pon" — do not demand the Pon form there until
      // the ruling lands (community-review-design.md §1.4).
      if (termId === "pon" && /\bpung\b/i.test(enValue)) continue;
      if (!newValue.includes(locked)) {
        failures.push(
          `${locale} ${key}: English renders locked term "${term.en}" but ` +
            `the new value does not contain the locked ${locale} form ` +
            `"${locked}" — use the locked form, or change the glossary ` +
            `itself in a dedicated glossary PR (see docs/translating.md).`,
        );
      }
    }
  }
  return failures;
}

/**
 * Pure diff analysis (no git): compare base and head locale files.
 *
 * `baseFiles` / `headFiles`: { [locale]: parsed locale JSON | null }
 * (`null` = file absent at that ref). `enKeys` is en.json's keys at head.
 * `glossary` is the head glossary.json. `valueAuthorOf` (optional) is
 * `(locale, key) => { name, email } | null` — the author of the commit
 * that last changed that key's `value` at base; when omitted, R3 is
 * skipped with a warning. `prAuthors` is the set of { name, email }
 * author identities behind the PR's own commits (for R3).
 *
 * Returns { failures, warnings } (string lists).
 */
export function analyzeApprovalDiff({
  baseFiles, headFiles, enKeys, glossary, valueAuthorOf = null, prAuthors = [],
}) {
  const failures = [];
  const warnings = [];
  const changedForGlossary = [];

  const locales = new Set([...Object.keys(baseFiles), ...Object.keys(headFiles)]);
  for (const locale of [...locales].sort()) {
    const base = baseFiles[locale];
    const head = headFiles[locale];
    if (!head) {
      failures.push(`${locale}: locale file deleted in this PR — delete the locale instead by removing it from SUPPORTED_LOCALES; do not delete the file.`);
      continue;
    }
    if (!base) continue; // new locale file: every key is new, R1/R2 need a base to compare; a brand-new locale ships as draft and is gated by coverage, not by this script.
    const baseKeys = base.keys ?? {};
    const headKeys = head.keys ?? {};
    const keyIds = new Set([...Object.keys(baseKeys), ...Object.keys(headKeys)]);
    for (const key of [...keyIds].sort()) {
      const b = baseKeys[key];
      const h = headKeys[key];
      if (!h) {
        failures.push(`${locale} ${key}: entry deleted in this PR — restore it (a missing entry counts against the locale in the dashboard; delete the English key instead if the string is gone).`);
        continue;
      }
      if (!b) continue; // brand-new key in this locale: no base to compare; coverage + placeholder gates cover it.
      const valueChanged = h.value !== b.value;
      const statusChanged = h.status !== b.status;
      if (valueChanged) {
        changedForGlossary.push({
          locale, key,
          enValue: enKeys[key]?.value ?? "",
          newValue: h.value,
        });
        if (h.status === "approved") {
          failures.push(
            `${locale} ${key}: value changed and status is "approved" in the same PR (R1) — a new or corrected wording must land as "draft" and be reviewed in a later PR by someone else.`,
          );
        } else if (h.status === "reviewed") {
          failures.push(
            `${locale} ${key}: value changed and status is "reviewed" in the same PR (R2) — the wording and its review are separate PRs; land the wording as "draft" first.`,
          );
        }
      } else if (
        statusChanged &&
        (h.status === "reviewed" || h.status === "approved") &&
        (b.status === "draft" || b.status === "reviewed")
      ) {
        // Status-only flip to reviewed/approved: the flipper must not be
        // the author of the current wording (R3).
        if (!valueAuthorOf) {
          warnings.push(
            `${locale} ${key}: status flipped ${b.status} -> ${h.status}, but no git history was available to check the wording's author (R3 skipped — run with history present).`,
          );
        } else {
          const author = valueAuthorOf(locale, key);
          if (!author) {
            warnings.push(
              `${locale} ${key}: status flipped ${b.status} -> ${h.status}, but the wording's author could not be determined from git history (R3 skipped for this key).`,
            );
          } else {
            const same = prAuthors.some(
              (p) =>
                (p.name && author.name && p.name.toLowerCase() === author.name.toLowerCase()) ||
                (p.email && author.email && p.email.toLowerCase() === author.email.toLowerCase()),
            );
            if (same) {
              failures.push(
                `${locale} ${key}: status flipped ${b.status} -> ${h.status} by the author of the current wording (${author.name ?? author.email}) (R3) — a correction must be reviewed by a second person.`,
              );
            }
          }
        }
      }
    }
  }

  failures.push(...checkLockedForms(changedForGlossary, glossary));
  return { failures, warnings };
}

// ---------------------------------------------------------------------------
// Git-backed CLI
// ---------------------------------------------------------------------------

function git(repo, args) {
  // maxBuffer: locale files are megabytes (en.json is ~1.9 MB); the
  // 1 MB default would make `git show` throw and the file look deleted.
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitOrNull(repo, args) {
  try {
    return git(repo, args);
  } catch {
    return null;
  }
}

/** Line number (1-based) of a key's `"value":` line in a file's text, or
 *  null when the key block cannot be found. Locale files are
 *  deterministically pretty-printed, one key per block. */
export function valueLineOf(fileText, key) {
  const lines = fileText.split("\n");
  const keyRe = new RegExp(`^\\s*"${escapeRegExp(key)}"\\s*:\\s*\\{\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    if (!keyRe.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
      if (/^\s*"value"\s*:/.test(lines[j])) return j + 1;
      if (/^\s*\}/.test(lines[j])) break;
    }
    return null;
  }
  return null;
}

/** Author of a line in a file at a ref, via `git blame --porcelain`. */
function blameAuthor(repo, ref, relPath, line) {
  const out = gitOrNull(repo, [
    "blame", "-L", `${line},${line}`, "--porcelain", ref, "--", relPath,
  ]);
  if (!out) return null;
  const name = /^author (.+)$/m.exec(out)?.[1] ?? null;
  const email = /^author-mail <(.+)>$/m.exec(out)?.[1] ?? null;
  if (!name && !email) return null;
  return { name, email };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
  };
  const base = flag("--base", "origin/main");
  const head = flag("--head", "HEAD");
  const repo = resolve(flag("--repo", ROOT));
  const authorFlag = flag("--author", process.env.GITHUB_ACTOR ?? "");

  // Author identities behind the PR's own commits (R3 compares against
  // these, not against a single username: a GitHub username and a git
  // author name are different strings for the same person).
  let prAuthors = [];
  const logOut = gitOrNull(repo, ["log", "--format=%an%x1f%ae%x1e", `${base}..${head}`]);
  if (logOut) {
    for (const rec of logOut.split("\x1e")) {
      const [name, email] = rec.split("\x1f").map((s) => s?.trim());
      if (name || email) prAuthors.push({ name: name || null, email: email || null });
    }
  }
  if (authorFlag && !prAuthors.some((p) => p.name === authorFlag || p.email === authorFlag)) {
    // The caller named an author (e.g. GITHUB_ACTOR) but no commit in the
    // range carries it — keep it as an extra identity to compare against.
    prAuthors.push({ name: authorFlag, email: null });
  }
  const haveHistory = logOut !== null;

  const changed = git(repo, [
    "diff", "--name-only", `${base}...${head}`, "--",
    "packages/web/src/i18n/locales", "packages/web/src/i18n/glossary.json",
  ]).split("\n").map((s) => s.trim()).filter(Boolean);
  if (changed.length === 0) {
    console.log("i18n approval gate: no locale or glossary files changed — pass.");
    return;
  }

  const showAt = (ref, relPath) => gitOrNull(repo, ["show", `${ref}:${relPath}`]);
  const baseFiles = {};
  const headFiles = {};
  for (const rel of changed.filter((p) => p.endsWith(".json") && p.includes("/locales/"))) {
    const locale = rel.split("/").pop().replace(/\.json$/, "");
    const b = showAt(base, rel);
    const h = showAt(head, rel);
    baseFiles[locale] = b ? JSON.parse(b) : null;
    headFiles[locale] = h ? JSON.parse(h) : null;
  }
  const enKeys = JSON.parse(
    showAt(head, "packages/web/src/i18n/locales/en.json") ??
      readFileSync(join(LOCALES_DIR, "en.json"), "utf8"),
  ).keys;
  const glossary = JSON.parse(
    showAt(head, "packages/web/src/i18n/glossary.json") ??
      readFileSync(join(I18N_DIR, "glossary.json"), "utf8"),
  );

  // R3 blame lookup, bound to the base file text (read once per locale).
  const baseTexts = {};
  const valueAuthorOf = haveHistory
    ? (locale, key) => {
        const rel = `packages/web/src/i18n/locales/${locale}.json`;
        if (!(rel in baseTexts)) baseTexts[rel] = showAt(base, rel);
        const text = baseTexts[rel];
        if (!text) return null;
        const line = valueLineOf(text, key);
        if (line === null) return null;
        return blameAuthor(repo, base, rel, line);
      }
    : null;

  const { failures, warnings } = analyzeApprovalDiff({
    baseFiles, headFiles, enKeys, glossary, valueAuthorOf, prAuthors,
  });
  for (const w of warnings) console.log(`WARN: ${w}`);
  if (failures.length > 0) {
    console.error(`i18n approval gate FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `i18n approval gate: pass (${changed.length} i18n file(s) changed${warnings.length ? `, ${warnings.length} warning(s)` : ""}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

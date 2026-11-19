#!/usr/bin/env node
/**
 * i18n review-queue generator (brief-i18n-v1, Phase 2 Track A).
 *
 * Builds the queue native reviewers work from: per language, every draft
 * string grouped by namespace with the English source alongside, plus a
 * status file with draft/reviewed/approved counts. Nothing is marked
 * approved here — approval is by a native speaker reading the string in
 * context, not by this script.
 *
 * The queue lives OUTSIDE the repo (~/workspace/mahjong-prep/i18n-review-queue/)
 * so the repo does not carry a second copy of all 4 × 3,716 strings.
 * The repo holds the draft locale files themselves
 * (packages/web/src/i18n/locales/<locale>.json).
 *
 * Usage:
 *   node scripts/i18n-review-queue.mjs [--out <dir>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DRAFT_GLOSSARY } from "./i18n-translate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const LOCALES_DIR = join(ROOT, "packages", "web", "src", "i18n", "locales");

const LOCALES = ["zh-Hans", "zh-Hant", "ja", "ko"];

function namespaceOf(key, namespaces) {
  let best = "";
  for (const ns of namespaces) {
    if ((key === ns || key.startsWith(`${ns}.`)) && ns.length > best.length) best = ns;
  }
  return best || key.split(".")[0];
}

function main() {
  const outArg = process.argv.indexOf("--out");
  const outDir = resolve(
    outArg !== -1 ? process.argv[outArg + 1] : join(process.env.HOME ?? "", "workspace", "mahjong-prep", "i18n-review-queue"),
  );
  mkdirSync(outDir, { recursive: true });
  const en = JSON.parse(readFileSync(join(LOCALES_DIR, "en.json"), "utf8"));
  const namespaces = Object.keys(en.meta.namespaces ?? {});
  const summary = [];

  for (const locale of LOCALES) {
    const file = JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), "utf8"));
    const grouped = {};
    let draft = 0;
    let reviewed = 0;
    let approved = 0;
    let missing = 0;
    let stale = 0;
    for (const [key, enEntry] of Object.entries(en.keys)) {
      const ns = namespaceOf(key, namespaces);
      (grouped[ns] ??= []).push({
        key,
        en: enEntry.value,
        draft: file.keys?.[key]?.value ?? null,
        status: (() => {
          const entry = file.keys?.[key];
          if (!entry) { missing++; return "missing"; }
          if (entry.hash !== enEntry.hash) { stale++; return "stale"; }
          if (entry.status === "approved") { approved++; return "approved"; }
          if (entry.status === "draft") { draft++; return "draft"; }
          stale++;
          return "stale";
        })(),
        source: enEntry.source,
        placeholders: enEntry.placeholders ?? [],
      });
    }
    const glossary = Object.entries(
      JSON.parse(readFileSync(join(ROOT, "packages", "web", "src", "i18n", "glossary.json"), "utf8")).terms,
    ).map(([termId, term]) => ({
      term: termId,
      en: term.en,
      note: term.note ?? "",
      draft: DRAFT_GLOSSARY[locale]?.[term.en] ?? DRAFT_GLOSSARY[locale]?.[termId] ?? null,
      status: "draft",
    }));
    const queue = {
      meta: {
        locale,
        generatedAt: new Date().toISOString(),
        generatedBy: "scripts/i18n-review-queue.mjs",
        note: "Machine drafts for native-speaker review. Nothing here is approved. A reviewer marks a string reviewed/approved only after reading it in context; the locked glossary forms are decided with the reviewer, not taken from the draft column.",
      },
      counts: {
        total: Object.keys(en.keys).length,
        draft, reviewed, approved, missing, stale,
        glossaryDraftTerms: glossary.filter((g) => g.draft).length,
        glossaryTotalTerms: glossary.length,
      },
      glossary,
      namespaces: grouped,
    };
    writeFileSync(join(outDir, `${locale}.json`), JSON.stringify(queue, null, 2) + "\n");
    summary.push({ locale, ...queue.counts, namespaces: Object.keys(grouped).length });
    console.log(`${locale}: ${draft} draft, ${approved} approved, ${missing} missing, ${stale} stale, ${glossary.filter((g) => g.draft).length}/${glossary.length} glossary drafts`);
  }

  const status = [
    "# i18n review queue — core 5 (Phase 2 Track A)",
    "",
    "Generated from the machine drafts in `packages/web/src/i18n/locales/`.",
    "Per-language queues: `<locale>.json` — every draft string grouped by",
    "namespace with the English source alongside, plus the draft glossary",
    "forms. Status per string: draft / reviewed / approved.",
    "",
    "**No native reviewers have been sourced yet.** Nothing in this queue",
    "is approved, and nothing ships until a native speaker per language",
    "has reviewed and approved 100% of the strings (release gate).",
    "",
    "| locale | total | draft | reviewed | approved | missing | stale | glossary drafts |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summary.map((s) => `| ${s.locale} | ${s.total} | ${s.draft} | ${s.reviewed} | ${s.approved} | ${s.missing} | ${s.stale} | ${s.glossaryDraftTerms}/${s.glossaryTotalTerms} |`),
    "",
    "## Open questions for Michael (from the Phase 1 open items)",
    "",
    "- **\"pung\" vs locked \"Pon\":** 96 keys contain \"pung\" in the",
    "  English source (75 American lessons, 17 MCR, 2 calculator, 2",
    "  play) — the Phase 1 README said 61, which does not match the",
    "  current extraction; 96 is the measured count. Drafts render",
    "  \"pung\" occurrences with the Pon draft form (e.g. \"Open triplet",
    "  (pung / pon)\" -> 明刻（碰）). Michael to rule whether \"pung\"",
    "  occurrences are the same term as \"Pon\" before reviewers lock",
    "  the glossary. (The locked glossary's own note for Pon already",
    "  reads \"A three-of-a-kind meld (pung)\".)",
    "- **index.html meta \"against the CPU\" vs \"Bot\":** flagged, not",
    "  reworded. The meta description still says \"against the CPU\"; the",
    "  glossary locks \"Bot\" for the in-app opponent. No key uses the",
    "  standalone word \"Bot\" yet, so Bot rendering is a review-queue item.",
    "",
    "## How a reviewer works the queue",
    "",
    "1. Open `<locale>.json`, pick a namespace, read each draft against",
    "   its English source in the app context (Play / Learn / calculator /",
    "   review).",
    "2. Fix wording in place; change `status` from `draft` to `reviewed`",
    "   when the wording is right, `approved` when it has been read in",
    "   context and is final. Placeholders `{0}`, `{1}` must survive",
    "   exactly; tile notation like `5m` must survive exactly.",
    "3. Glossary: confirm or correct each draft form. A translation that",
    "   renders a locked term differently is a defect, not a preference.",
    "4. Approved strings go back into `packages/web/src/i18n/locales/`",
    "   with status `approved` and the matching source hash (a later PR,",
    "   after review — this track never marks anything approved).",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "STATUS.md"), status);
  console.log(`wrote ${outDir}`);
}

main();

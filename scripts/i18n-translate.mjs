#!/usr/bin/env node
/**
 * i18n machine-translation driver (brief-i18n-v1, Phase 2 Track A).
 *
 * Batch-translates the English key file into one core locale with a cheap
 * OpenRouter model (Flash / Turbo class). Every output entry is a machine
 * DRAFT: status "draft", never "approved", with the English source hash
 * recorded so the translation memory works. Nothing this script writes
 * ships — the release gate blocks any locale that is not 100% approved.
 *
 * Auth: the API key comes from the environment (OPENROUTER_API_KEY). The
 * key itself is never printed, logged, or written to any file. The ruled
 * source for that key is Pi's credential store, exactly as the Pydantic
 * harness launcher does (see the `openrouter_harness` skill); the
 * custom.openrouter connector's key is a known-broken copy and is never
 * used here.
 *
 * Pricing below was verified live against OpenRouter /api/v1/models on
 * 2026-11-18 (see scripts/i18n-benchmark.md). Cost per run is computed
 * from the usage the API itself reports on every call, so the spend in
 * the PR body is the provider-reported spend, not an estimate.
 *
 * Usage:
 *   node scripts/i18n-translate.mjs benchmark --model <slug> --locale <locale> [--out <dir>]
 *   node scripts/i18n-translate.mjs translate --model <slug> --locale <locale> [--limit <n>] [--batch <n>]
 *
 * benchmark: translates the fixed 40-string sample
 *   (scripts/i18n-benchmark-sample.json) and writes a result JSON with the
 *   raw outputs, placeholder/tile/glossary validation, and usage + cost.
 * translate: translates every key in en.json that has no draft with a
 *   matching hash yet (translation memory: unchanged strings are never
 *   re-billed), validates each batch, retries failures twice, and writes
 *   the locale file plus a per-run cost log JSON.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const I18N_DIR = join(ROOT, "packages", "web", "src", "i18n");
const LOCALES_DIR = join(I18N_DIR, "locales");

export const PRICES_PER_MILLION = {
  // Verified 2026-11-18 via OpenRouter /api/v1/models. No `qwen-turbo`
  // id exists on OpenRouter; qwen/qwen-plus is the live Turbo-class Qwen.
  "qwen/qwen-plus": { input: 0.26, output: 0.78 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

export const LOCALE_NAMES = {
  "zh-Hans": "Simplified Chinese ( mainland China / Singapore )",
  "zh-Hant": "Traditional Chinese ( Taiwan / Hong Kong )",
  ja: "Japanese",
  ko: "Korean",
};

/**
 * Draft locked-glossary forms used as the translation instruction for each
 * locale. These are DRAFTS, not locked decisions: the locked glossary
 * (packages/web/src/i18n/glossary.json) stays null for every non-English
 * locale until a native speaker decides each form. The draft forms below
 * are the standard transliterations / terms used by mahjong players in
 * each language, recorded here so the benchmark and the bulk run use the
 * same forms — a draft that renders a locked term differently is a defect
 * to fix in the draft pass, not something to ship. "Bot" is rendered
 * without the word "AI" in every locale (brief hard floor).
 */
export const DRAFT_GLOSSARY = {
  "zh-Hans": {
    Ron: "荣和", Riichi: "立直", Tsumo: "自摸", Dora: "宝牌", Kan: "杠",
    Pon: "碰", Chi: "吃", Han: "番", Fu: "符", Yakuman: "役满",
    Honba: "本场", Furiten: "振听", Bot: "机器人对手",
    "East": "东", "South": "南", "West": "西",
    "North": "北", "Green dragon": "绿发", "Red dragon": "红中",
    "White dragon": "白板",
  },
  "zh-Hant": {
    Ron: "榮和", Riichi: "立直", Tsumo: "自摸", Dora: "寶牌", Kan: "槓",
    Pon: "碰", Chi: "吃", Han: "番", Fu: "符", Yakuman: "役滿",
    Honba: "本場", Furiten: "振聽", Bot: "機器人對手",
    "East": "東", "South": "南", "West": "西",
    "North": "北", "Green dragon": "綠發", "Red dragon": "紅中",
    "White dragon": "白板",
  },
  ja: {
    Ron: "ロン", Riichi: "リーチ", Tsumo: "ツモ", Dora: "ドラ", Kan: "カン",
    Pon: "ポン", Chi: "チー", Han: "翻", Fu: "符", Yakuman: "役満",
    Honba: "本場", Furiten: "フリテン", Bot: "ボット",
    "East": "東", "South": "南", "West": "西",
    "North": "北", "Green dragon": "發", "Red dragon": "中",
    "White dragon": "白",
  },
  ko: {
    Ron: "론", Riichi: "리치", Tsumo: "쯔모", Dora: "도라", Kan: "깡",
    Pon: "퐁", Chi: "치", Han: "판", Fu: "부", Yakuman: "야쿠만",
    Honba: "혼바", Furiten: "후리텐", Bot: "봇",
    "East": "동", "South": "남", "West": "서",
    "North": "북", "Green dragon": "발", "Red dragon": "중",
    "White dragon": "백",
  },
};

export function costOf(model, usage) {
  const p = PRICES_PER_MILLION[model];
  if (!p) return null;
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  return (input * p.input + output * p.output) / 1_000_000;
}

function placeholdersOf(value) {
  return [...String(value).matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
}

function tileRefsOf(value) {
  return [...String(value).matchAll(/\b[1-9][mpsz]\b/g)].map((m) => m[0]).sort();
}

/** Hard validation: placeholder sets must match exactly. A dropped or
 *  invented {n} breaks interpolation, so it blocks the draft. */
export function validateEntry(key, enValue, translated) {
  const problems = [];
  if (typeof translated !== "string" || translated.trim() === "") {
    problems.push("empty translation");
    return problems;
  }
  const enPh = placeholdersOf(enValue);
  const trPh = placeholdersOf(translated);
  if (enPh.join(",") !== trPh.join(",")) {
    problems.push(`placeholders differ: en {${enPh.join(",")}} vs translation {${trPh.join(",")}}`);
  }
  return problems;
}

/** Soft validation: tile-notation references (e.g. `5m`, `1s`). A
 *  mismatch is recorded as a reviewer flag, not a draft blocker — the
 *  extractor's regex also matches prose suit mentions such as "1s and
 *  9s" ("1s" = ones of characters), which translations legitimately
 *  render without the notation. The meaning is what the reviewer checks. */
export function tileRefProblems(enValue, translated) {
  const problems = [];
  const enTiles = tileRefsOf(enValue);
  const trTiles = tileRefsOf(translated);
  if (enTiles.join(",") !== trTiles.join(",")) {
    problems.push(`tile references differ: en [${enTiles.join(",")}] vs translation [${trTiles.join(",")}]`);
  }
  return problems;
}

/** Glossary check: for every locked English term present in the source
 *  as a whole word (case-insensitive, so mid-sentence "ron" counts but
 *  "Chinese" does not match "Chi" and "furiten" does not match "Fu"),
 *  the translation must contain the draft form. A whole-word survival of
 *  the English term is a defect; a rendering with neither the draft form
 *  nor the English term is also flagged for the reviewer. Returns a list
 *  of problems. */
export function glossaryProblems(locale, enValue, translated) {
  const forms = DRAFT_GLOSSARY[locale] ?? {};
  const problems = [];
  for (const [term, form] of Object.entries(forms)) {
    const inSource = new RegExp(`\\b${term}s?\\b`, "i").test(enValue);
    if (!inSource) continue;
    const hasForm = translated.includes(form);
    const leftEnglish = new RegExp(`\\b${term}s?\\b`, "i").test(translated);
    if (leftEnglish && !hasForm) {
      problems.push(`locked term "${term}" left in English`);
    } else if (!hasForm && !leftEnglish) {
      problems.push(`locked term "${term}" rendered without draft form "${form}"`);
    }
  }
  return problems;
}

function buildPrompt(locale, entries) {
  const glossary = DRAFT_GLOSSARY[locale] ?? {};
  const glossaryLines = Object.entries(glossary)
    .map(([en, form]) => `  - "${en}" -> "${form}"`)
    .join("\n");
  return {
    system:
      `You translate UI and lesson strings for Open Mahjong, a free open-source mahjong app, from English to ${LOCALE_NAMES[locale] ?? locale}.\n` +
      `Rules:\n` +
      `- Plain, factual copy. No slogans, no marketing language, no "no ads" / "no gacha" claims.\n` +
      `- The CPU opponent is always called the Bot term below — never "AI", never "artificial intelligence".\n` +
      `- Keep every {0}, {1}, ... placeholder EXACTLY as written, same numbers, no additions, no removals. Placeholder order may change only if the target grammar requires it.\n` +
      `- Keep tile notation like 5m, 2p, 9s, 1z EXACTLY as written.\n` +
      `- Keep numbers, punctuation of scores, and the words "mahjong" usage natural in the target language.\n` +
      `- Mahjong terms use these exact forms (locked glossary drafts):\n${glossaryLines}\n` +
      `- Translate the meaning, not word for word. Lesson prose should read like a teacher speaking plainly.\n` +
      `- Return ONLY a JSON object mapping each input key to its translation. No commentary, no markdown fences.`,
    user: JSON.stringify(entries, null, 1),
  };
}

async function callOpenRouter(model, system, user, apiKey) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://openmahjong.app/",
      "X-Title": "Open Mahjong i18n draft translation",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage ?? {};
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Some models wrap the JSON in fences despite the instruction.
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`unparseable model output: ${content.slice(0, 300)}`);
  }
  return { parsed, usage };
}

async function translateBatch(model, locale, entries, apiKey, attempt = 0) {
  const { system, user } = buildPrompt(locale, entries);
  try {
    return await callOpenRouter(model, system, user, apiKey);
  } catch (err) {
    if (attempt < 2 && /429|5\d\d|unparseable/.test(String(err.message))) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return translateBatch(model, locale, entries, apiKey, attempt + 1);
    }
    throw err;
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0];
  const model = args.model;
  const locale = args.locale;
  if (!mode || !model || !locale) {
    console.error("usage: i18n-translate.mjs <benchmark|translate> --model <slug> --locale <locale> [--limit n] [--batch n] [--out dir]");
    process.exit(2);
  }
  if (!PRICES_PER_MILLION[model]) {
    console.error(`unknown model ${model} — add its verified OpenRouter price to PRICES_PER_MILLION first`);
    process.exit(2);
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set (see the script header for the ruled key source)");
    process.exit(2);
  }
  const en = JSON.parse(readFileSync(join(LOCALES_DIR, "en.json"), "utf8"));
  const enKeys = en.keys;

  const totals = { promptTokens: 0, completionTokens: 0, costUsd: 0, calls: 0 };

  if (mode === "benchmark") {
    const sample = JSON.parse(readFileSync(join(HERE, "i18n-benchmark-sample.json"), "utf8"));
    const entries = {};
    for (const key of sample.keys) entries[key] = enKeys[key].value;
    const { parsed, usage } = await translateBatch(model, locale, entries, apiKey);
    totals.promptTokens += usage.prompt_tokens ?? 0;
    totals.completionTokens += usage.completion_tokens ?? 0;
    totals.costUsd += costOf(model, usage) ?? 0;
    totals.calls += 1;
    const results = [];
    for (const key of sample.keys) {
      const value = parsed[key];
      results.push({
        key,
        en: enKeys[key].value,
        translated: typeof value === "string" ? value : null,
        validation: validateEntry(key, enKeys[key].value, value),
        glossary: typeof value === "string" ? glossaryProblems(locale, enKeys[key].value, value) : ["missing output"],
      });
    }
    const outDir = resolve(args.out ?? join(HERE, "i18n-benchmark-results"));
    mkdirSync(outDir, { recursive: true });
    const slug = model.replace("/", "__");
    const outPath = join(outDir, `${locale}.${slug}.json`);
    writeFileSync(outPath, JSON.stringify({
      model, locale, sampleKeys: sample.keys.length,
      usage, costUsd: totals.costUsd, results,
    }, null, 2) + "\n");
    const bad = results.filter((r) => r.validation.length > 0 || r.glossary.length > 0);
    console.log(`benchmark ${model} -> ${locale}: ${results.length} strings, ${bad.length} with problems, cost $${totals.costUsd.toFixed(4)} (${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens)`);
    console.log(`wrote ${outPath}`);
    return;
  }

  if (mode === "translate") {
    const batchSize = Number(args.batch ?? 60);
    const limit = args.limit ? Number(args.limit) : Infinity;
    const localePath = join(LOCALES_DIR, `${locale}.json`);
    let existing = { keys: {} };
    if (existsSync(localePath)) {
      const parsed = JSON.parse(readFileSync(localePath, "utf8"));
      if (parsed.meta?.status !== "untranslated") existing = parsed;
    }
    // Translation memory: skip keys that already have a draft from the
    // same English hash. Unchanged strings are never re-billed.
    const tmHits = Object.entries(enKeys).filter(([key, entry]) => {
      const cur = existing.keys?.[key];
      return cur && cur.hash === entry.hash && typeof cur.value === "string" && cur.value !== "";
    }).length;
    const todo = Object.entries(enKeys)
      .filter(([key, entry]) => {
        const cur = existing.keys?.[key];
        return !(cur && cur.hash === entry.hash && typeof cur.value === "string" && cur.value !== "");
      })
      .slice(0, limit);
    console.log(`translate ${model} -> ${locale}: ${todo.length} keys to draft (${tmHits} already drafted with matching hash, skipped)`);
    const failures = [];
    const problems = [];
    const tileRefFlags = [];
    for (let i = 0; i < todo.length; i += batchSize) {
      const chunk = todo.slice(i, i + batchSize);
      const entries = {};
      for (const [key, entry] of chunk) entries[key] = entry.value;
      let out;
      try {
        out = await translateBatch(model, locale, entries, apiKey);
      } catch (err) {
        console.error(`batch ${i / batchSize + 1} FAILED: ${err.message}`);
        for (const [key] of chunk) failures.push({ key, reason: String(err.message).slice(0, 200) });
        continue;
      }
      totals.promptTokens += out.usage.prompt_tokens ?? 0;
      totals.completionTokens += out.usage.completion_tokens ?? 0;
      totals.costUsd += costOf(model, out.usage) ?? 0;
      totals.calls += 1;
      for (const [key, entry] of chunk) {
        const value = out.parsed[key];
        const vProblems = validateEntry(key, entry.value, value);
        const gProblems = typeof value === "string" ? glossaryProblems(locale, entry.value, value) : [];
        const tProblems = typeof value === "string" ? tileRefProblems(entry.value, value) : [];
        if (typeof value !== "string" || value.trim() === "" || vProblems.length > 0) {
          failures.push({ key, reason: vProblems.join("; ") || "empty/missing output" });
          continue;
        }
        if (gProblems.length > 0) problems.push({ key, problems: gProblems });
        if (tProblems.length > 0) tileRefFlags.push({ key, problems: tProblems });
        existing.keys[key] = {
          value,
          hash: entry.hash,
          status: "draft",
          source: entry.source,
          placeholders: entry.placeholders ?? [],
          ...(entry.dynamic ? { dynamic: true } : {}),
        };
      }
      console.log(`batch ${i / batchSize + 1}/${Math.ceil(todo.length / batchSize)}: ${chunk.length} keys, cost so far $${totals.costUsd.toFixed(4)}`);
      await sleep(400);
    }
    const drafted = Object.keys(existing.keys).length;
    const file = {
      meta: {
        locale,
        status: "draft",
        sourceLocale: "en",
        generatedBy: "scripts/i18n-translate.mjs",
        generatedAt: new Date().toISOString(),
        keyCount: drafted,
        model,
        note: "Machine drafts, status draft throughout. No string here is approved and none ships: the release gate blocks any locale that is not 100% approved. Native-speaker review queue: ~/workspace/mahjong-prep/i18n-review-queue/.",
      },
      keys: existing.keys,
    };
    writeFileSync(localePath, JSON.stringify(file, null, 2) + "\n");
    const logPath = join(HERE, `i18n-cost-log-${locale}.json`);
    writeFileSync(logPath, JSON.stringify({
      model, locale, generatedAt: new Date().toISOString(),
      keysDraftedTotal: drafted, keysAttempted: todo.length,
      failures, glossaryFlags: problems, tileRefFlags,
      usage: totals, costUsd: totals.costUsd,
    }, null, 2) + "\n");
    console.log(`done ${locale}: ${drafted}/${Object.keys(enKeys).length} keys drafted, ${failures.length} failures, ${problems.length} glossary flags, ${tileRefFlags.length} tile-ref flags, total cost $${totals.costUsd.toFixed(4)} (${totals.promptTokens} in / ${totals.completionTokens} out tokens, ${totals.calls} calls)`);
    console.log(`wrote ${localePath} and ${logPath}`);
    return;
  }

  console.error(`unknown mode ${mode}`);
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

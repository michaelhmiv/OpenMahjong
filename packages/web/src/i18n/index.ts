/**
 * i18n runtime loader — Phase 1 (brief-i18n-v1, sequencing step 1).
 *
 * English is the source and the only shipped locale. Every other core
 * locale (zh-Hans, zh-Hant, ja, ko) is an explicitly untranslated stub:
 * lookups fall back to English, and the dashboard reports them 0%.
 *
 * Rules this module enforces:
 * - No network call to any translation provider, ever. All strings are
 *   static files shipped with the app.
 * - Only `approved` strings in a locale are ever shown. A missing, draft,
 *   or stale key falls back to English in the app and is counted as
 *   unapproved by the dashboard.
 * - Translation memory is keyed by source hash: a locale entry carries
 *   the hash of the English string it was translated from. If the English
 *   hash changes, the entry is stale until re-translated and re-approved.
 */

import enData from "./locales/en.json";
import glossaryData from "./glossary.json";

export type KeyStatus = "approved" | "draft" | "stale" | "missing";

export interface LocaleKeyEntry {
  value: string;
  /** sha256 of the English source string this entry was translated from. */
  hash: string;
  status: "approved" | "draft" | "stale";
  source?: { file: string; line: number };
  placeholders?: string[];
  dynamic?: boolean;
}

export interface LocaleFile {
  meta: {
    locale?: string;
    status?: string;
    sourceLocale?: string;
    generatedBy?: string;
    generatedAt?: string;
    keyCount?: number;
    note?: string;
  };
  keys: Record<string, LocaleKeyEntry>;
}

export interface GlossaryTerm {
  en: string;
  note?: string;
  locales: Record<string, string | null>;
}

export interface GlossaryFile {
  meta: { locales: string[]; sourceLocale: string; note: string };
  terms: Record<string, GlossaryTerm>;
}

/** English is the source locale. */
export const SOURCE_LOCALE = "en";

/** Core 5 locales (brief §Scope). Only English ships in Phase 1. */
export const SUPPORTED_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko"] as const;

/** Locales actually shipped by the app. Phase 1: English only. */
export const SHIPPED_LOCALES: readonly string[] = ["en"];

/** localStorage key for the remembered language choice. */
export const REMEMBERED_LOCALE_KEY = "openmahjong.locale.v1";

const EN = enData as unknown as LocaleFile;
export const GLOSSARY = glossaryData as unknown as GlossaryFile;

/** Registered locale data. English is built in; other locales register
 *  their file here when they ship (Phase 2). Unregistered locales have
 *  no data, so every lookup falls back to English. */
const registry = new Map<string, LocaleFile>([["en", EN]]);

export function registerLocale(id: string, data: LocaleFile): void {
  registry.set(id, data);
}

export function getLocaleData(id: string): LocaleFile | undefined {
  return registry.get(id);
}

export function getEnglishKeys(): Record<string, LocaleKeyEntry> {
  return EN.keys;
}

let currentLocale = SOURCE_LOCALE;

export function getCurrentLocale(): string {
  return currentLocale;
}

/** Normalise a BCP 47 tag: `zh_CN` -> `zh-Hans` is NOT done here; this
 *  only canonicalises separators and casing (`zh-cn` -> `zh-CN`,
 *  `zh-hant` -> `zh-Hant`). Region/script mapping lives in resolveLocale. */
export function normalizeLocaleTag(tag: string): string {
  const parts = tag.replace(/_/g, "-").split("-").filter(Boolean);
  if (parts.length === 0) return "";
  const [lang, ...rest] = parts;
  const out = [lang!.toLowerCase()];
  for (const p of rest) {
    if (p.length === 4) out.push(p[0]!.toUpperCase() + p.slice(1).toLowerCase());
    else if (p.length === 2) out.push(p.toUpperCase());
    else out.push(p.toLowerCase());
  }
  return out.join("-");
}

/** Best match for a browser language list among `available` locales.
 *  Exact tag match wins; then a primary-subtag match, with the
 *  conventional written-Chinese mapping (zh-CN/SG -> zh-Hans,
 *  zh-TW/HK/MO -> zh-Hant, bare zh -> zh-Hans). Falls back to English. */
export function resolveLocale(
  languages: readonly string[],
  available: readonly string[] = SHIPPED_LOCALES,
): string {
  const avail = new Set(available.map(normalizeLocaleTag));
  const tryTag = (tag: string): string | null => {
    const norm = normalizeLocaleTag(tag);
    if (avail.has(norm)) return norm;
    return null;
  };
  for (const lang of languages) {
    const exact = tryTag(lang);
    if (exact) return exact;
    const norm = normalizeLocaleTag(lang);
    const [primary, ...rest] = norm.split("-");
    if (primary === "zh") {
      const region = rest[rest.length - 1] ?? "";
      const script = rest.find((p) => p === "Hans" || p === "Hant");
      const candidate = script ?? (region === "TW" || region === "HK" || region === "MO" ? "Hant" : "Hans");
      const mapped = `zh-${candidate}`;
      if (avail.has(mapped)) return mapped;
    } else if (primary) {
      for (const a of avail) {
        if (a.split("-")[0] === primary) return a;
      }
    }
  }
  return SOURCE_LOCALE;
}

/** Per-key status in a locale, readable by the dashboard.
 *  - "approved": translated, approved, and its hash matches the current
 *    English source — the only status the app ever shows.
 *  - "draft": translated but not yet native-speaker approved.
 *  - "stale": translated from an older English source (hash mismatch).
 *  - "missing": no entry in that locale (or no such key in English). */
export function keyStatus(key: string, locale: string = currentLocale): KeyStatus {
  const en = EN.keys[key];
  if (!en) return "missing";
  if (locale === SOURCE_LOCALE) return "approved";
  const entry = registry.get(locale)?.keys[key];
  if (!entry) return "missing";
  if (entry.hash !== en.hash) return "stale";
  return entry.status;
}

/** Interpolate positional `{0}`, `{1}`, ... placeholders. Unknown
 *  placeholders are left as-is so a broken template is visible, not silent. */
export function interpolate(
  template: string,
  args: readonly (string | number)[] = [],
): string {
  return template.replace(/\{(\d+)\}/g, (m, n) => {
    const v = args[Number(n)];
    return v === undefined ? m : String(v);
  });
}

/** Look up a key in the current locale with English fallback.
 *  Only `approved` entries are shown; anything else (missing, draft,
 *  stale) returns the English source. A key with no English entry at
 *  all returns the key id itself, so the gap is visible. */
export function t(key: string, ...args: readonly (string | number)[]): string {
  const en = EN.keys[key];
  if (!en) return key;
  if (keyStatus(key) !== "approved") return interpolate(en.value, args);
  const entry = registry.get(currentLocale)?.keys[key];
  return interpolate(entry?.value ?? en.value, args);
}

/** The locked glossary form of a term in a locale, or null when that
 *  locale has no locked form yet (Phase 1: every non-English locale). */
export function lockedTerm(termId: string, locale: string): string | null {
  const term = GLOSSARY.terms[termId];
  if (!term) return null;
  if (locale === SOURCE_LOCALE) return term.en;
  return term.locales[locale] ?? null;
}

function readRemembered(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(REMEMBERED_LOCALE_KEY);
  } catch {
    return null;
  }
}

export function getRememberedLocale(): string | null {
  const v = readRemembered();
  return v && SUPPORTED_LOCALES.includes(v as (typeof SUPPORTED_LOCALES)[number])
    ? v
    : null;
}

export function setRememberedLocale(id: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(REMEMBERED_LOCALE_KEY, id);
  } catch {
    // Remembering the choice is best-effort; detection still works.
  }
}

function browserLanguages(): readonly string[] {
  try {
    if (typeof navigator === "undefined") return [];
    return (navigator.languages ?? [navigator.language]).filter(Boolean);
  } catch {
    return [];
  }
}

/** Resolve and activate the locale for this session. A remembered choice
 *  wins over browser detection; detection picks the best match among
 *  `available` (default: shipped locales); anything else is English.
 *  Returns the active locale. Plumbing only in Phase 1 — no UI reads
 *  this yet. */
export function initI18n(opts?: {
  languages?: readonly string[];
  available?: readonly string[];
}): string {
  const remembered = getRememberedLocale();
  const langs = remembered
    ? [remembered]
    : (opts?.languages ?? browserLanguages());
  currentLocale = resolveLocale(langs, opts?.available ?? SHIPPED_LOCALES);
  return currentLocale;
}

/** Test/Phase 2 helper: reset the active locale to English. */
export function resetI18nForTests(): void {
  currentLocale = SOURCE_LOCALE;
}

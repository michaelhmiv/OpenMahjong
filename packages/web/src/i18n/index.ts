/**
 * i18n runtime loader — Phase 1 (brief-i18n-v1, sequencing step 1)
 * + Phase 2 Track A routing/detection plumbing + Track B switcher
 * + core-5 ship (PR #90).
 *
 * English is the source. The four core locales (zh-Hans, zh-Hant, ja,
 * ko) ship as machine translations (owner ruling Nov 19, 2026: SHIP
 * NOW, community reviews later), clearly marked as such in the
 * switcher, and community review follows.
 *
 * Rules this module enforces:
 * - No network call to any translation provider, ever. All strings are
 *   static files shipped with the app.
 * - Display rule (ship step, PR #90): an `approved` string is always shown.
 *   A `draft` string is shown only in a locale listed in
 *   MACHINE_TRANSLATED_LOCALES — the initial-ship waiver locales —
 *   where the language-level "Machine translated" marking makes the
 *   status honest. A draft in any other locale falls back to English,
 *   as does a `stale` or `missing` key everywhere. Wave 2 locales
 *   therefore stay under the approved-only rule until a ruling ships
 *   them the same way. A `reviewed` entry is shown exactly where a
 *   draft is shown (machine-translated locales): review is a step up
 *   from draft, not a separate display tier, so marking a draft
 *   reviewed must never make it disappear. `reviewed` also counts
 *   toward community-review coverage and the release gate — see
 *   community-review-design.md.
 * - Translation memory is keyed by source hash: a locale entry carries
 *   the hash of the English string it was translated from. If the English
 *   hash changes, the entry is stale until re-translated and re-approved.
 */

import enData from "./locales/en.json";
import jaData from "./locales/ja.json";
import koData from "./locales/ko.json";
import zhHansData from "./locales/zh-Hans.json";
import zhHantData from "./locales/zh-Hant.json";
import glossaryData from "./glossary.json";

export type KeyStatus = "approved" | "reviewed" | "draft" | "stale" | "missing";

export interface LocaleKeyEntry {
  value: string;
  /** sha256 of the English source string this entry was translated from. */
  hash: string;
  status: "approved" | "reviewed" | "draft" | "stale";
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

/** Core 5 locales (brief §Scope). All five ship: English plus the
 *  four machine-translated core locales (PR #90). */
export const SUPPORTED_LOCALES = ["en", "zh-Hans", "zh-Hant", "ja", "ko"] as const;

/** Locales actually shipped by the app: the core 5 (PR #90). */
export const SHIPPED_LOCALES: readonly string[] = ["en", "zh-Hans", "zh-Hant", "ja", "ko"];

/** Locales that ship as machine translations, awaiting community
 *  review (owner ruling, Nov 19, 2026: SHIP NOW, community reviews
 *  later). The switcher marks these — a "Machine translated" note
 *  on the row, a footnote on the Language screen, a line on the
 *  first-visit sheet — so a machine translation is never mistaken
 *  for reviewed copy. Dormant until a listed locale actually ships
 *  (SHIPPED_LOCALES still gates the list). When community review
 *  completes for a locale, remove it here and the marking
 *  disappears with it. Wave 2 locales are never listed here: they
 *  stay hidden until they ship. */
export const MACHINE_TRANSLATED_LOCALES: readonly string[] = ["zh-Hans", "zh-Hant", "ja", "ko"];

/** Whether a locale ships as a machine translation (see above). */
export function isMachineTranslated(id: string): boolean {
  return MACHINE_TRANSLATED_LOCALES.includes(id);
}

/** Switcher display metadata for every supported locale (Track B
 *  design, frame 05). `native` is the language's own name, `english`
 *  is its English name — both are fixed labels, not translated copy:
 *  the list shows the native name over the English name in every
 *  locale, so "日本語 / Japanese" reads the same in a Japanese
 *  session as in an English one. Order is the list order: English
 *  first (the source locale), then the rest alphabetical by English
 *  name — Japanese, Korean, Simplified Chinese, Traditional Chinese.
 *  The current locale is never hoisted, so rows never jump around. */
export interface LocaleMeta {
  id: string;
  native: string;
  english: string;
}

export const LOCALE_META: readonly LocaleMeta[] = [
  { id: "en", native: "English", english: "English" },
  { id: "ja", native: "日本語", english: "Japanese" },
  { id: "ko", native: "한국어", english: "Korean" },
  { id: "zh-Hans", native: "简体中文", english: "Simplified Chinese" },
  { id: "zh-Hant", native: "繁體中文", english: "Traditional Chinese" },
];

/** Metadata for shipped locales only, in list order. Unshipped
 *  locales are hidden, not listed (design decision 3). Today this
 *  is English alone; when the core 4 ship as machine translations
 *  (owner ruling Nov 19, 2026) they are listed with the
 *  machine-translation marking — see isMachineTranslated. */
export function shippedLocaleMeta(): LocaleMeta[] {
  return LOCALE_META.filter((m) => SHIPPED_LOCALES.includes(m.id));
}

/** Metadata for one locale id, or undefined for an unknown id. */
export function localeMeta(id: string): LocaleMeta | undefined {
  return LOCALE_META.find((m) => m.id === id);
}

/** localStorage key for the remembered language choice. */
export const REMEMBERED_LOCALE_KEY = "openmahjong.locale.v1";

const EN = enData as unknown as LocaleFile;
export const GLOSSARY = glossaryData as unknown as GlossaryFile;

/** Registered locale data. English is built in; the four core locales
 *  register their files here at import (PR #90) — they ship as machine
 *  translations, so their draft entries display under the display rule
 *  above. An unregistered locale has no data, so every lookup falls
 *  back to English. */
const registry = new Map<string, LocaleFile>([["en", EN]]);

export function registerLocale(id: string, data: LocaleFile): void {
  registry.set(id, data);
}

// Core-5 ship (PR #90): the machine-translated locale files are part
// of the bundle, registered at import like English.
registerLocale("ja", jaData as unknown as LocaleFile);
registerLocale("ko", koData as unknown as LocaleFile);
registerLocale("zh-Hans", zhHansData as unknown as LocaleFile);
registerLocale("zh-Hant", zhHantData as unknown as LocaleFile);

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
 *    English source — always shown by the app.
 *  - "reviewed": one community reviewer — not the author of the wording —
 *    has read the string in context in the app and confirms the wording.
 *    Counts toward community-review coverage and the release gate.
 *    Display follows isDisplayable(): a reviewed entry shows in a
 *    machine-translated ship locale, like a draft; elsewhere it falls
 *    back to English.
 *  - "draft": translated but not yet native-speaker approved. Shown
 *    only in a machine-translated ship locale (see isDisplayable);
 *    elsewhere it falls back to English.
 *  - "stale": translated from an older English source (hash mismatch).
 *  - "missing": no entry in that locale (or no such key in English). */
export function keyStatus(key: string, locale: string = currentLocale): KeyStatus {
  const en = EN.keys[key];
  if (!en) return "missing";
  if (locale === SOURCE_LOCALE) return "approved";
  const entry = registry.get(locale)?.keys[key];
  if (!entry) return "missing";
  if (entry.hash !== en.hash) return "stale";
  if (entry.status === "reviewed") return "reviewed";
  return entry.status;
}

/** Interpolate positional `{0}`, `{1}`, ... placeholders. Args are
 *  `unknown` deliberately: tx() call sites pass a template's own
 *  interpolations verbatim (array indexing, optional lookups), so the
 *  type must admit `string | undefined` and friends. An argument that
 *  was supplied — even undefined — renders exactly as a template
 *  literal would (String(undefined) === "undefined"), so the English
 *  output stays byte-identical to the template it replaced. Only a
 *  placeholder with NO supplied argument is left as-is, so a broken
 *  template stays visible instead of silently rendering "undefined". */
export function interpolate(
  template: string,
  args: readonly unknown[] = [],
): string {
  return template.replace(/\{(\d+)\}/g, (m, n) => {
    const i = Number(n);
    if (i >= args.length) return m;
    return String(args[i]);
  });
}

/** Key slug for a display string — the runtime twin of slugify() in
 *  scripts/extract-i18n.mjs. Renderers use it to derive keys for data
 *  whose English source lives in a module-scope record (MCR pattern
 *  guide: learn.mcr.guide.pattern.${slugify(name)}.name). The two
 *  implementations must stay identical; the derived-key coverage test
 *  (packages/web/test/i18n-keys.test.ts) asserts every derived key
 *  exists in en.json with the expected English value. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!slug) return "v";
  return /^[0-9]/.test(slug) ? `v-${slug}` : slug;
}

/** Whether a key's entry in a locale is shown by the app (display
 *  rule, PR #90 ship step, extended by the community-review path,
 *  PR #92): `approved` always; `draft` and `reviewed` only in a
 *  machine-translated ship locale, where the language-level marking
 *  keeps it honest. `stale` and `missing` never show. Statuses are
 *  already hash-checked by keyStatus(), so a draft here is current.
 *  `reviewed` rides with `draft` deliberately: a reviewed entry is a
 *  draft one community member confirmed, so it must show wherever a
 *  draft shows — otherwise marking a draft reviewed would hide it. */
export function isDisplayable(key: string, locale: string = currentLocale): boolean {
  const status = keyStatus(key, locale);
  if (status === "approved") return true;
  if ((status === "draft" || status === "reviewed") && isMachineTranslated(locale)) return true;
  return false;
}

/** Look up a key in the current locale with English fallback.
 *  Shown entries follow isDisplayable(): approved always, draft and
 *  reviewed only in a machine-translated ship locale; anything else
 *  (missing, stale, or a draft/reviewed in any other locale) returns
 *  the English source. A key with no English entry at all returns the
 *  key id itself, so the gap is visible. */
export function t(key: string, ...args: readonly unknown[]): string {
  const en = EN.keys[key];
  if (!en) return key;
  if (!isDisplayable(key)) return interpolate(en.value, args);
  const entry = registry.get(currentLocale)?.keys[key];
  return interpolate(entry?.value ?? en.value, args);
}

/** The English plural "-s" for templates that carry the plural as an
 *  arg (`"{0} recorded game{1}"`). Only English marks the plural this
 *  way — ja/ko/zh don't — so passing a raw "s" leaks Latin letters
 *  onto their screens ("0記録されたゲームs"). The fallback template
 *  keeps its own ternary: it renders English. */
export function pluralS(count: number): string {
  return currentLocale === SOURCE_LOCALE && count !== 1 ? "s" : "";
}

/** Translate with an explicit English default: `tx("ui.app.language",
 *  "Language")`. The extractor records the fallback as the key's
 *  English source in en.json (see scripts/extract-i18n.mjs), which
 *  is the mechanism by which a string that only exists behind a
 *  translate call gets its key — `t()` alone cannot do that, because
 *  the extractor only inventories string literals it finds in code.
 *  At runtime this is `t()` when the key exists in en.json; when it
 *  does not (extractor drift — the missing-key gate fails CI first),
 *  the English default renders instead of the key id. */
export function tx(
  key: string,
  fallback: string,
  ...args: readonly unknown[]
): string {
  if (!EN.keys[key]) return interpolate(fallback, args);
  return t(key, ...args);
}

/** Look up a key in a specific locale (not the current one), with
 *  English fallback. Shown entries follow isDisplayable() — the same
 *  rule as `t()`, applied to the named locale. `fallback` is the
 *  key's English source (same role as in `tx()` — the extractor
 *  records it in en.json); it renders only when the key has no
 *  English entry at all. The first-visit sheet uses this: its title
 *  and primary button are in the *detected* language while the
 *  session is still English. For a machine-translated locale those
 *  strings are its drafts, and the sheet carries the
 *  machine-translation line at the decision point, so the sheet never
 *  presents draft copy as reviewed copy. */
export function tForLocale(
  key: string,
  locale: string,
  fallback: string,
  ...args: readonly unknown[]
): string {
  const en = EN.keys[key];
  if (locale !== SOURCE_LOCALE && en && isDisplayable(key, locale)) {
    const entry = registry.get(locale)?.keys[key];
    if (entry) return interpolate(entry.value, args);
  }
  if (!en) return interpolate(fallback, args);
  return interpolate(en.value, args);
}

/** The locked glossary form of a term in a locale, or null when that
 *  locale has no locked form yet (Phase 1: every non-English locale). */
export function lockedTerm(termId: string, locale: string): string | null {
  const term = GLOSSARY.terms[termId];
  if (!term) return null;
  if (locale === SOURCE_LOCALE) return term.en;
  return term.locales[locale] ?? null;
}

/** Contributor guide for translation corrections (community review path,
 *  see ~/workspace/mahjong-prep/community-review-design.md). The in-app
 *  "Improve this translation" link opens this page on GitHub, which names
 *  the exact locale file per language and the no-git (web editor) flow —
 *  a non-developer landing on the raw 38,000-line JSON file would have no
 *  instructions. One URL for every locale: the guide links onward to the
 *  per-locale files. */
export const TRANSLATIONS_GUIDE_URL =
  "https://github.com/michaelhmiv/OpenMahjong/blob/main/docs/translating.md";

/** URL the "Improve this translation" link opens for a locale. English
 *  has no translation to improve, so it returns null and the caller shows
 *  no link. */
export function improveTranslationUrl(locale: string = currentLocale): string | null {
  if (!locale || locale === SOURCE_LOCALE) return null;
  return TRANSLATIONS_GUIDE_URL;
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

/** First path segment is a supported locale tag (e.g. `/ja/`,
 *  `/zh-Hant/learn/`) -> that locale; anything else -> null. The app's
 *  own top-level routes (`/riichi/`, `/learn/`, `/calculator/`,
 *  `/privacy`) are not locale tags. English lives at the root and has no
 *  prefix, but `/en/...` parses as English so old links still resolve. */
export function localeFromPath(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  if (!first) return null;
  const norm = normalizeLocaleTag(first);
  for (const loc of SUPPORTED_LOCALES) {
    if (normalizeLocaleTag(loc) === norm) return loc;
  }
  return null;
}

/** Rewrite a pathname into a locale's URL: strip any locale prefix
 *  first, then prefix with `/{locale}` unless the locale is English
 *  (root). The remainder of the path is preserved exactly. */
export function pathForLocale(locale: string, pathname: string): string {
  const withoutPrefix = localeFromPath(pathname)
    ? pathname.replace(/^\/[^/]+/, "") || "/"
    : pathname;
  if (locale === SOURCE_LOCALE) return withoutPrefix;
  return withoutPrefix === "/" ? `/${locale}/` : `/${locale}${withoutPrefix}`;
}

/** Canonical URL for a locale (English at the root). */
export const SITE_ORIGIN = "https://openmahjong.app";

export function canonicalUrlForLocale(locale: string): string {
  return locale === SOURCE_LOCALE
    ? `${SITE_ORIGIN}/`
    : `${SITE_ORIGIN}/${locale}/`;
}

/** Set the document's language + canonical + hreflang alternates for the
 *  active locale. Alternates list SHIPPED locales only: an unshipped
 *  locale (drafts exist, nothing approved) must never be pointed at by a
 *  crawler, since its URL would serve English content. */
export function applyLocaleDocumentTags(locale: string): void {
  try {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    let canonical = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrlForLocale(locale);
    const wanted = new Map<string, string>();
    wanted.set("x-default", canonicalUrlForLocale(SOURCE_LOCALE));
    for (const loc of SHIPPED_LOCALES) {
      wanted.set(loc === SOURCE_LOCALE ? "en" : loc, canonicalUrlForLocale(loc));
    }
    for (const el of [
      ...document.querySelectorAll('link[rel="alternate"][data-om-i18n]'),
    ]) {
      el.remove();
    }
    for (const [hreflang, href] of wanted) {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = hreflang;
      link.href = href;
      link.setAttribute("data-om-i18n", "");
      document.head.appendChild(link);
    }
  } catch {
    // Document tags are progressive enhancement; the app still renders.
  }
}

/** Best match for the browser language list among `available`
 *  (default: shipped locales). This is detection only — it never
 *  activates a locale by itself. The first-visit confirmation sheet
 *  (Track B design) is the only surface that acts on a detected
 *  locale, so a browser set to Japanese never silently re-renders
 *  the app in a language the user cannot read back out of. */
export function detectLocale(
  languages?: readonly string[],
  available: readonly string[] = SHIPPED_LOCALES,
): string {
  return resolveLocale(languages ?? browserLanguages(), available);
}

/** First-visit sheet decision (Track B design, frame 03): the
 *  detected locale the sheet should offer, or null when no sheet
 *  is due. A sheet is due only when there is no remembered choice,
 *  no locale in the URL (an explicit URL choice suppresses it), and
 *  browser detection yields a shipped locale other than English. */
export function firstVisitDetectedLocale(opts?: {
  remembered?: string | null;
  pathname?: string;
  languages?: readonly string[];
  available?: readonly string[];
}): string | null {
  const remembered =
    opts?.remembered !== undefined ? opts.remembered : getRememberedLocale();
  if (remembered) return null;
  const pathname =
    opts?.pathname ??
    (typeof location !== "undefined" ? location.pathname : "");
  if (localeFromPath(pathname)) return null;
  const detected = detectLocale(opts?.languages, opts?.available);
  return detected === SOURCE_LOCALE ? null : detected;
}

/** Resolve and activate the locale for this session. Precedence:
 *  URL path locale > remembered choice > English. Browser detection
 *  deliberately does NOT activate a locale here: the approved
 *  switcher design (Track B) shows a confirmation sheet for a
 *  detected locale instead of silently switching, so first-visit
 *  activation is English until the user picks — in the sheet or in
 *  the switcher. `detectLocale()` / `firstVisitDetectedLocale()`
 *  expose detection to the sheet. A path locale for an unshipped
 *  locale still resolves to English. Returns the active locale. */
export function initI18n(opts?: {
  available?: readonly string[];
  pathname?: string;
}): string {
  const remembered = getRememberedLocale();
  const pathLocale = localeFromPath(
    opts?.pathname ??
      (typeof location !== "undefined" ? location.pathname : ""),
  );
  const langs = pathLocale ? [pathLocale] : remembered ? [remembered] : null;
  currentLocale = langs
    ? resolveLocale(langs, opts?.available ?? SHIPPED_LOCALES)
    : SOURCE_LOCALE;
  return currentLocale;
}

/** Test/Phase 2 helper: reset the active locale to English. */
export function resetI18nForTests(): void {
  currentLocale = SOURCE_LOCALE;
}

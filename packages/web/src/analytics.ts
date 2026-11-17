/**
 * Google Analytics (GA4) — DARK integration.
 *
 * One config constant gates everything: while ANALYTICS_CONFIG's
 * measurementId is empty (as shipped), no script element is ever
 * created, no network call is made, and track() is a no-op — the
 * site behaves exactly as it did before this module existed.
 *
 * Go-live is a separate, deliberate one-value PR (sequenced after
 * the AdSense decision, per the approved SEO/GA plan): set
 * measurementId to "G-LRSE9PK5F4" (GA4 property 564917239,
 * "Open Mahjong"). That PR also carries the /privacy Analytics
 * section; until then there is nothing to disclose because nothing
 * is collected.
 *
 * When configured, initAnalytics() dynamically injects the gtag.js
 * script and bootstraps it with the site's non-personalized stance
 * baked in: consent defaults deny ad storage / ad user data / ad
 * personalization, and the config disables advertising signals.
 * No user_id is ever set, Google Signals stays off in the GA4
 * admin, and there is no server-side Measurement Protocol.
 *
 * The event taxonomy is deliberately small and client-only. track()
 * is the only way app code emits events, and the typed wrappers
 * below are the whole vocabulary. NEVER tracked: per-move events,
 * scores, hand contents, or any user identifier.
 */

import type { VariantId, VariantLength } from "@openmahjong/engine";

export interface AnalyticsConfig {
  /** GA4 Measurement ID, e.g. "G-LRSE9PK5F4". */
  readonly measurementId: string;
}

/** The single gate for Analytics. Empty = dark (nothing loads,
 *  nothing is tracked). Go-live (only as its own PR, after the
 *  AdSense decision): measurementId "G-LRSE9PK5F4". */
export const ANALYTICS_CONFIG: AnalyticsConfig = {
  measurementId: "",
};

export function analyticsConfigured(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
): boolean {
  return config.measurementId.trim() !== "";
}

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const SCRIPT_MARKER = "data-om-analytics";

/**
 * Inject the gtag.js script and bootstrap it — only when
 * configured, and only once per measurement id (re-init is a
 * no-op, so there is never a second script or a duplicate
 * config). Returns whether analytics is active for this page.
 * `doc`/`win` are injectable for tests; they default to the
 * globals.
 */
export function initAnalytics(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): boolean {
  if (!analyticsConfigured(config)) return false;
  const id = config.measurementId.trim();
  const w = win as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  if (!w.gtag) {
    const layer = w.dataLayer;
    w.gtag = (...args: unknown[]) => {
      layer.push(args);
    };
  }
  if (doc.querySelector(`script[${SCRIPT_MARKER}="${id}"]`)) return true;

  w.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  w.gtag("js", new Date());
  w.gtag("config", id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.setAttribute(SCRIPT_MARKER, id);
  doc.head.append(script);
  return true;
}

export type AnalyticsParams = Readonly<Record<string, string | boolean>>;

/**
 * The one event sink. With the shipped (empty) config this is a
 * pure no-op: no DOM writes, no dataLayer, no network. When
 * configured it lazily initializes (idempotently) and emits the
 * event through gtag.
 */
export function track(
  event: string,
  params: AnalyticsParams = {},
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  if (!analyticsConfigured(config)) return;
  if (!initAnalytics(config, doc, win)) return;
  (win as GtagWindow).gtag?.("event", event, params);
}

// -- the event vocabulary ------------------------------------------------------

export type AnalyticsVariant = VariantId | "riichi";

export function trackGameStarted(
  variant: AnalyticsVariant,
  length: VariantLength,
  guided: boolean,
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("game_started", { variant, length, guided }, config, doc, win);
}

export function trackGameFinished(
  variant: AnalyticsVariant,
  length: VariantLength,
  guided: boolean,
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("game_finished", { variant, length, guided }, config, doc, win);
}

export function trackLessonStarted(
  lessonId: string,
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("lesson_started", { lesson_id: lessonId }, config, doc, win);
}

export function trackLessonCompleted(
  lessonId: string,
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("lesson_completed", { lesson_id: lessonId }, config, doc, win);
}

export function trackCalculatorUsed(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("calculator_used", {}, config, doc, win);
}

export function trackScorekeeperSessionFinished(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("scorekeeper_session_finished", {}, config, doc, win);
}

export function trackReviewOpened(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("review_opened", {}, config, doc, win);
}

export function trackSignInCompleted(
  config: AnalyticsConfig = ANALYTICS_CONFIG,
  doc: Document = document,
  win: Window = window,
): void {
  track("sign_in_completed", {}, config, doc, win);
}

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_CONFIG,
  analyticsConfigured,
  initAnalytics,
  track,
  trackCalculatorUsed,
  trackGameFinished,
  trackGameStarted,
  trackLessonCompleted,
  trackLessonStarted,
  trackReviewOpened,
  trackScorekeeperSessionFinished,
  trackSignInCompleted,
  type AnalyticsConfig,
} from "../src/analytics.js";

/**
 * GA4 dark integration: the shipped config is empty, so nothing
 * loads and nothing is tracked. With a config set (the future
 * go-live PR), init injects exactly one gtag script with the
 * non-personalized consent/config stance, and the typed wrappers
 * emit exactly the specified event shapes.
 */

const TEST_CONFIG: AnalyticsConfig = { measurementId: "G-TEST12345" };

type TestWindow = Window & { dataLayer?: unknown[]; gtag?: unknown };

function layer(): unknown[][] {
  return ((window as TestWindow).dataLayer ?? []) as unknown[][];
}

function events(): unknown[][] {
  return layer().filter((entry) => entry[0] === "event");
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as TestWindow).dataLayer;
  delete (window as TestWindow).gtag;
});

describe("dark by default (shipped config)", () => {
  it("the shipped config is empty, so analytics is not configured", () => {
    expect(ANALYTICS_CONFIG).toEqual({ measurementId: "" });
    expect(analyticsConfigured()).toBe(false);
    expect(analyticsConfigured({ measurementId: "   " })).toBe(false);
    expect(analyticsConfigured(TEST_CONFIG)).toBe(true);
  });

  it("initAnalytics with the shipped config creates nothing", () => {
    expect(initAnalytics()).toBe(false);
    expect(document.head.querySelector("script")).toBeNull();
    expect((window as TestWindow).dataLayer).toBeUndefined();
    expect((window as TestWindow).gtag).toBeUndefined();
  });

  it("track() and every wrapper are pure no-ops while dark", () => {
    track("game_started", { variant: "riichi" });
    trackGameStarted("riichi", "east", true);
    trackGameFinished("mcr", "full", false);
    trackLessonStarted("tu1");
    trackLessonCompleted("tu1");
    trackCalculatorUsed();
    trackScorekeeperSessionFinished();
    trackReviewOpened();
    trackSignInCompleted();
    expect(document.head.querySelector("script")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect((window as TestWindow).dataLayer).toBeUndefined();
    expect((window as TestWindow).gtag).toBeUndefined();
  });
});

describe("configured (the go-live shape)", () => {
  it("init injects exactly one gtag script for the measurement id", () => {
    expect(initAnalytics(TEST_CONFIG)).toBe(true);
    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    const script = scripts[0]!;
    expect(script.getAttribute("src")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-TEST12345",
    );
    expect(script.hasAttribute("async")).toBe(true);
    expect(script.getAttribute("data-om-analytics")).toBe("G-TEST12345");
  });

  it("bootstrap order is consent defaults, js, then config — ads denied, signals off", () => {
    initAnalytics(TEST_CONFIG);
    const entries = layer();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "granted",
      },
    ]);
    expect(entries[1]?.[0]).toBe("js");
    expect(entries[1]?.[1]).toBeInstanceOf(Date);
    expect(entries[2]).toEqual([
      "config",
      "G-TEST12345",
      { allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
  });

  it("re-init is a no-op: no second script, no duplicate bootstrap", () => {
    initAnalytics(TEST_CONFIG);
    expect(initAnalytics(TEST_CONFIG)).toBe(true);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(layer()).toHaveLength(3);
  });

  it("track() lazily initializes and emits the event through gtag", () => {
    track("custom_event", { variant: "riichi" }, TEST_CONFIG);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(events()).toEqual([["event", "custom_event", { variant: "riichi" }]]);
  });

  it("game wrappers pass exactly {variant, length, guided}", () => {
    trackGameStarted("hong-kong", "south", true, TEST_CONFIG);
    trackGameFinished("riichi", "east", false, TEST_CONFIG);
    expect(events()).toEqual([
      ["event", "game_started", { variant: "hong-kong", length: "south", guided: true }],
      ["event", "game_finished", { variant: "riichi", length: "east", guided: false }],
    ]);
  });

  it("lesson wrappers pass exactly {lesson_id}", () => {
    trackLessonStarted("tu4", TEST_CONFIG);
    trackLessonCompleted("hk-tiles", TEST_CONFIG);
    expect(events()).toEqual([
      ["event", "lesson_started", { lesson_id: "tu4" }],
      ["event", "lesson_completed", { lesson_id: "hk-tiles" }],
    ]);
  });

  it("the parameterless wrappers emit empty params", () => {
    trackCalculatorUsed(TEST_CONFIG);
    trackScorekeeperSessionFinished(TEST_CONFIG);
    trackReviewOpened(TEST_CONFIG);
    trackSignInCompleted(TEST_CONFIG);
    expect(events()).toEqual([
      ["event", "calculator_used", {}],
      ["event", "scorekeeper_session_finished", {}],
      ["event", "review_opened", {}],
      ["event", "sign_in_completed", {}],
    ]);
  });
});

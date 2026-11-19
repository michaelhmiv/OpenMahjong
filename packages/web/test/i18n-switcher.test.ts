// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, buildFirstVisitSheet } from "../src/app.js";
import {
  LOCALE_META,
  MACHINE_TRANSLATED_LOCALES,
  detectLocale,
  firstVisitDetectedLocale,
  getCurrentLocale,
  isMachineTranslated,
  registerLocale,
  resetI18nForTests,
  shippedLocaleMeta,
  tForLocale,
  tx,
  type LocaleFile,
} from "../src/i18n/index.js";
import enData from "../src/i18n/locales/en.json";

/**
 * Language switcher (brief-i18n-v1, Phase 2 Track B; design
 * i18n-switcher-v1, Michael-approved 2026-11-19): More-tab LANGUAGE
 * section, drilled-in Language list (shipped locales only), and the
 * first-visit confirmation sheet. Only English ships in this track,
 * so the production behaviour is English-only — the sheet is dormant
 * until the first non-English locale ships, and its positive path is
 * proven here with a registered test locale, never with the design
 * mock's unapproved Japanese strings.
 *
 * Machine-translation marking (owner ruling Nov 19, 2026: SHIP NOW,
 * community reviews later): the core 4 locales will ship with draft
 * PR #90 as machine translations, and the switcher must mark them —
 * a row note, a Language-screen footnote, a sheet line. The marking
 * is keyed off MACHINE_TRANSLATED_LOCALES and is dormant while only
 * English ships; the 5-locale rendering is verified by capture in a
 * scratch flip (see the PR body), not by these tests, because
 * SHIPPED_LOCALES is still ["en"] on this branch.
 */

const EN_KEYS = (
  enData as { keys: Record<string, { value: string; hash: string }> }
).keys;

function testJaLocale(status: "approved" | "draft"): LocaleFile {
  // Test-only Japanese strings (obviously fake, never the design
  // mock's copy): the approved entry proves the sheet reads the
  // detected locale's approved strings; the draft entry proves a
  // draft never shows.
  return {
    meta: { locale: "ja" },
    keys: {
      "ui.app.language.sheet.title": {
        value: "テストタイトル",
        hash: EN_KEYS["ui.app.language.sheet.title"]!.hash,
        status,
      },
      "ui.app.language.sheet.use": {
        value: "テストボタン",
        hash: EN_KEYS["ui.app.language.sheet.use"]!.hash,
        status,
      },
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  resetI18nForTests();
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  Object.defineProperty(window.navigator, "languages", {
    value: ["en-US"],
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function bootGuest(): App {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  return new App(root);
}

describe("tx()", () => {
  it("returns the English source for a known key, ignoring the fallback", () => {
    expect(tx("ui.app.language", "WRONG")).toBe("Language");
  });

  it("renders the fallback for an unknown key instead of the key id", () => {
    expect(tx("ui.app.no-such-key", "Fallback text")).toBe("Fallback text");
  });

  it("interpolates the fallback's placeholders", () => {
    expect(tx("ui.app.no-such-key", "Switch to {0}?", "Japanese")).toBe(
      "Switch to Japanese?",
    );
  });

  it("interpolates a known key's placeholders", () => {
    expect(
      tx("ui.app.language.sheet.sub", "WRONG", "Japanese"),
    ).toBe("Your browser is set to Japanese. Switch Open Mahjong to Japanese?");
  });
});

describe("tForLocale()", () => {
  it("shows the detected locale's approved strings", () => {
    registerLocale("ja", testJaLocale("approved"));
    expect(
      tForLocale("ui.app.language.sheet.title", "ja", "Display in {0}?", "日本語"),
    ).toBe("テストタイトル");
    expect(tForLocale("ui.app.language.sheet.use", "ja", "Use {0}", "日本語")).toBe(
      "テストボタン",
    );
  });

  it("falls back to English for a draft entry — a draft never shows", () => {
    registerLocale("ja", testJaLocale("draft"));
    expect(
      tForLocale("ui.app.language.sheet.title", "ja", "Display in {0}?", "日本語"),
    ).toBe("Display in 日本語?");
  });

  it("falls back to English for an unregistered locale", () => {
    expect(
      tForLocale("ui.app.language.sheet.title", "ko", "Display in {0}?", "한국어"),
    ).toBe("Display in 한국어?");
  });

  it("renders the fallback for an unknown key", () => {
    expect(tForLocale("ui.app.no-such-key", "ja", "Fallback {0}", "x")).toBe(
      "Fallback x",
    );
  });

  it("returns the English value for English itself", () => {
    expect(
      tForLocale("ui.app.language.sheet.title", "en", "Display in {0}?", "English"),
    ).toBe("Display in English?");
  });
});

describe("locale metadata", () => {
  it("lists English first, then alphabetical by English name", () => {
    expect(LOCALE_META.map((m) => m.id)).toEqual([
      "en",
      "ja",
      "ko",
      "zh-Hans",
      "zh-Hant",
    ]);
  });

  it("names Simplified vs Traditional Chinese unambiguously", () => {
    const hans = LOCALE_META.find((m) => m.id === "zh-Hans");
    const hant = LOCALE_META.find((m) => m.id === "zh-Hant");
    expect(hans?.native).toBe("简体中文");
    expect(hans?.english).toBe("Simplified Chinese");
    expect(hant?.native).toBe("繁體中文");
    expect(hant?.english).toBe("Traditional Chinese");
  });

  it("ships English only: unshipped locales stay hidden", () => {
    expect(shippedLocaleMeta()).toEqual([
      { id: "en", native: "English", english: "English" },
    ]);
  });
});

describe("switcher in the app (English only ships)", () => {
  it("shows no sheet on boot, even with a Japanese browser language", async () => {
    Object.defineProperty(window.navigator, "languages", {
      value: ["ja-JP"],
      configurable: true,
    });
    bootGuest();
    await settle();
    expect(root.querySelector(".i18n-sheet")).toBeNull();
    expect(root.querySelector(".i18n-scrim")).toBeNull();
    expect(getCurrentLocale()).toBe("en");
  });

  it("shows no sheet on boot when a choice is already remembered", async () => {
    localStorage.setItem("openmahjong.locale.v1", "en");
    Object.defineProperty(window.navigator, "languages", {
      value: ["ja-JP"],
      configurable: true,
    });
    bootGuest();
    await settle();
    expect(root.querySelector(".i18n-sheet")).toBeNull();
  });

  it("More carries a LANGUAGE section between SETTINGS and ABOUT", async () => {
    bootGuest();
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const labels = [...root.querySelectorAll("#screen-more .sec-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["ACCOUNT", "SETTINGS", "LANGUAGE", "ABOUT"]);
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    );
    expect(row?.querySelector(".ttl2")?.textContent).toBe("Language");
    expect(row?.querySelector(".i18n-val")?.textContent).toBe("English");
  });

  it("Language screen lists shipped locales only, current marked twice", async () => {
    bootGuest();
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    );
    (row as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector("#screen-language")).not.toBeNull();
    expect(root.querySelector("#screen-language .i18n-head h1")?.textContent).toBe(
      "Language",
    );
    const rows = [...root.querySelectorAll("#screen-language .i18n-row")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector(".nm")?.textContent).toBe("English");
    expect(rows[0]?.classList.contains("cur")).toBe(true);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.querySelector(".i18n-check")).not.toBeNull();
    // No tab bar on a drilled-in screen (nav law).
    expect(root.querySelector(".tabbar")?.hasAttribute("hidden")).toBe(true);
    const notes = [...root.querySelectorAll("#screen-language .i18n-note")].map(
      (el) => el.textContent,
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("/ja/");
    expect(notes[1]).toContain("More languages are coming:");
    expect(notes[1]).toContain("Vietnamese");
    // Back returns to More; tapping the current locale does too.
    root.querySelector<HTMLButtonElement>("#screen-language .i18n-back")?.click();
    await settle();
    expect(root.querySelector("#screen-more.active")).not.toBeNull();
  });

  it("tapping the current locale returns to More without navigating", async () => {
    bootGuest();
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    );
    (row as HTMLButtonElement).click();
    await settle();
    root.querySelector<HTMLButtonElement>("#screen-language .i18n-row")?.click();
    await settle();
    // chooseLocale only navigates when the target differs; tapping
    // the current locale returns to More in place (no location.assign,
    // which jsdom cannot stub — the in-place return is the assertion).
    expect(root.querySelector("#screen-more.active")).not.toBeNull();
  });
});

describe("machine-translation marking (ruling Nov 19, 2026)", () => {
  it("lists exactly the core 4 as machine translated", () => {
    expect([...MACHINE_TRANSLATED_LOCALES]).toEqual([
      "zh-Hans",
      "zh-Hant",
      "ja",
      "ko",
    ]);
    for (const id of ["zh-Hans", "zh-Hant", "ja", "ko"]) {
      expect(isMachineTranslated(id)).toBe(true);
    }
    expect(isMachineTranslated("en")).toBe(false);
    // Wave 2 locales are hidden, never marked.
    for (const id of ["vi", "th", "id", "fr", "de", "es"]) {
      expect(isMachineTranslated(id)).toBe(false);
    }
  });

  it("is dormant while only English ships: no mark, still 2 footnotes", async () => {
    bootGuest();
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    );
    (row as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector("#screen-language")?.textContent).not.toContain(
      "Machine translated",
    );
    expect(root.querySelector("#screen-language")?.textContent).not.toContain(
      "machine translated",
    );
    expect(
      [...root.querySelectorAll("#screen-language .i18n-note")],
    ).toHaveLength(2);
  });
});

describe("first-visit sheet builder", () => {
  it("renders the detected language's approved strings + English decline", () => {
    registerLocale("ja", testJaLocale("approved"));
    let accepted = 0;
    let declined = 0;
    const { scrim, sheet } = buildFirstVisitSheet("ja", {
      onAccept: () => accepted++,
      onDecline: () => declined++,
    });
    expect(scrim.classList.contains("i18n-scrim")).toBe(true);
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.querySelector(".t")?.textContent).toBe("テストタイトル");
    expect(sheet.querySelector(".s")?.textContent).toBe(
      "Your browser is set to Japanese. Switch Open Mahjong to Japanese?",
    );
    expect(sheet.querySelector(".pillbtn.primary")?.textContent).toBe("テストボタン");
    expect(sheet.querySelector(".pillbtn.ghost")?.textContent).toBe(
      "Continue in English",
    );
    expect(sheet.querySelector(".fine")?.textContent).toBe(
      "You can change this later in More → Language.",
    );
    expect(sheet.querySelector(".i18n-x")?.getAttribute("aria-label")).toBe("Dismiss");
    sheet.querySelector<HTMLButtonElement>(".pillbtn.primary")?.click();
    expect(accepted).toBe(1);
    sheet.querySelector<HTMLButtonElement>(".pillbtn.ghost")?.click();
    expect(declined).toBe(1);
    sheet.querySelector<HTMLButtonElement>(".i18n-x")?.click();
    expect(declined).toBe(2);
  });

  it("Escape declines, like the × dismiss", () => {
    registerLocale("ja", testJaLocale("approved"));
    let declined = 0;
    const { sheet } = buildFirstVisitSheet("ja", {
      onAccept: () => {},
      onDecline: () => declined++,
    });
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(declined).toBe(1);
  });

  it("never shows a draft string in the title", () => {
    registerLocale("ja", testJaLocale("draft"));
    const { sheet } = buildFirstVisitSheet("ja", {
      onAccept: () => {},
      onDecline: () => {},
    });
    expect(sheet.querySelector(".t")?.textContent).toBe("Display in 日本語?");
    expect(sheet.querySelector(".t")?.textContent).not.toContain("テスト");
  });

  it("marks a machine-translated locale with a second fine line", () => {
    registerLocale("ja", testJaLocale("approved"));
    const { sheet } = buildFirstVisitSheet("ja", {
      onAccept: () => {},
      onDecline: () => {},
    });
    const fines = [...sheet.querySelectorAll(".fine")].map(
      (el) => el.textContent,
    );
    expect(fines).toHaveLength(2);
    expect(fines[0]).toBe("You can change this later in More → Language.");
    expect(fines[1]).toBe(
      "Japanese is machine translated and awaiting community review.",
    );
  });

  it("shows no machine line for a locale that is not machine translated", () => {
    const { sheet } = buildFirstVisitSheet("xx", {
      onAccept: () => {},
      onDecline: () => {},
    });
    const fines = [...sheet.querySelectorAll(".fine")].map(
      (el) => el.textContent,
    );
    expect(fines).toHaveLength(1);
    expect(fines[0]).toBe("You can change this later in More → Language.");
  });
});

describe("detection precedence (URL > remembered > browser)", () => {
  it("firstVisitDetectedLocale is null once a choice exists", () => {
    expect(
      firstVisitDetectedLocale({
        remembered: "en",
        pathname: "/",
        languages: ["ja-JP"],
        available: ["en", "ja"],
      }),
    ).toBeNull();
  });

  it("detectLocale never activates on its own — initI18n stays English", () => {
    expect(detectLocale(["ja-JP"], ["en", "ja"])).toBe("ja");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, buildFirstVisitSheet } from "../src/app.js";
import {
  LOCALE_META,
  MACHINE_TRANSLATED_LOCALES,
  detectLocale,
  firstVisitDetectedLocale,
  getCurrentLocale,
  initI18n,
  isMachineTranslated,
  registerLocale,
  resetI18nForTests,
  shippedLocaleMeta,
  tForLocale,
  tx,
  type LocaleFile,
} from "../src/i18n/index.js";
import enData from "../src/i18n/locales/en.json";
import jaData from "../src/i18n/locales/ja.json";

/**
 * Language switcher (brief-i18n-v1, Phase 2 Track B; design
 * i18n-switcher-v1, Michael-approved 2026-11-19): More-tab LANGUAGE
 * section, drilled-in Language list (shipped locales only), and the
 * first-visit confirmation sheet. The core 5 ship with PR #90, so the
 * production behaviour is five locales — the sheet is live for a
 * detected non-English browser language, and its positive path is
 * proven here with a registered test locale as well as the real
 * shipped drafts.
 *
 * Machine-translation marking (owner ruling Nov 19, 2026: SHIP NOW,
 * community reviews later): the core 4 locales ship with draft
 * PR #90 as machine translations, and the switcher marks them —
 * a row note, a Language-screen footnote, a sheet line.
 */

const EN_KEYS = (
  enData as { keys: Record<string, { value: string; hash: string }> }
).keys;

function testJaLocale(status: "approved" | "draft"): LocaleFile {
  // Test-only Japanese strings (obviously fake, never the design
  // mock's copy): the approved entry proves the sheet reads the
  // detected locale's approved strings; the draft entry proves a
  // draft SHOWS in a machine-translated locale (PR #90 display rule)
  // and falls back in any other locale.
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

  it("shows a draft entry in a machine-translated locale — a draft shows there", () => {
    // Display rule (PR #90): ja is machine-translated, so its draft
    // strings render, with the machine-translation line on the sheet.
    registerLocale("ja", testJaLocale("draft"));
    expect(
      tForLocale("ui.app.language.sheet.title", "ja", "Display in {0}?", "日本語"),
    ).toBe("テストタイトル");
  });

  it("falls back to English for a draft entry in a locale that is not machine translated", () => {
    registerLocale("fr", {
      meta: { locale: "fr" },
      keys: {
        "ui.app.language.sheet.title": {
          value: "Afficher en français ?",
          hash: EN_KEYS["ui.app.language.sheet.title"]!.hash,
          status: "draft",
        },
      },
    });
    expect(
      tForLocale("ui.app.language.sheet.title", "fr", "Display in {0}?", "français"),
    ).toBe("Display in français?");
  });

  it("falls back to English for an unregistered locale", () => {
    expect(
      tForLocale("ui.app.language.sheet.title", "xx", "Display in {0}?", "xx"),
    ).toBe("Display in xx?");
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

  it("ships the core 5: unshipped locales stay hidden", () => {
    expect(shippedLocaleMeta()).toEqual([
      { id: "en", native: "English", english: "English" },
      { id: "ja", native: "日本語", english: "Japanese" },
      { id: "ko", native: "한국어", english: "Korean" },
      { id: "zh-Hans", native: "简体中文", english: "Simplified Chinese" },
      { id: "zh-Hant", native: "繁體中文", english: "Traditional Chinese" },
    ]);
  });
});

describe("switcher in the app (core 5 ship)", () => {
  it("tab labels render in the active locale (regression: labels were module-scope t())", async () => {
    // TAB_DEFS used to call t() at module scope, which runs at import
    // time — before main.ts calls initI18n — so the tabs always
    // rendered English on /ja/. Labels are keys now, resolved when
    // the tab bar is built. Restore the real ja file first: earlier
    // tests in this file register 2-key ja fixtures over it.
    registerLocale("ja", jaData as unknown as LocaleFile);
    initI18n({ pathname: "/ja/" });
    expect(getCurrentLocale()).toBe("ja");
    bootGuest();
    await settle();
    const labels = [...root.querySelectorAll(".tabbtn span")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["プレイ", "学ぶ", "ゲーム", "その他"]);
    resetI18nForTests();
  });

  it("shows the first-visit sheet on boot with a Japanese browser language", async () => {
    // The core 4 ship (PR #90), so a clean first visit with a
    // Japanese browser is offered the sheet — the dormant-English
    // behaviour ended with the ship.
    Object.defineProperty(window.navigator, "languages", {
      value: ["ja-JP"],
      configurable: true,
    });
    bootGuest();
    await settle();
    expect(root.querySelector(".i18n-sheet")).not.toBeNull();
    expect(root.querySelector(".i18n-scrim")).not.toBeNull();
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

  it("Language screen lists all 5 shipped locales, current marked twice", async () => {
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
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.querySelector(".nm")?.textContent)).toEqual([
      "English",
      "日本語",
      "한국어",
      "简体中文",
      "繁體中文",
    ]);
    expect(rows[0]?.querySelector(".nm")?.textContent).toBe("English");
    expect(rows[0]?.classList.contains("cur")).toBe(true);
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.querySelector(".i18n-check")).not.toBeNull();
    // Every non-English row carries the machine-translation mark.
    for (const r of rows.slice(1)) {
      expect(r.querySelector(".en")?.textContent).toContain("Machine translated");
    }
    // No tab bar on a drilled-in screen (nav law).
    expect(root.querySelector(".tabbar")?.hasAttribute("hidden")).toBe(true);
    const notes = [...root.querySelectorAll("#screen-language .i18n-note")].map(
      (el) => el.textContent,
    );
    // C7: footnotes condensed to the essential lines — the choice/
    // memory note and the machine-translation note; the wave-2
    // roadmap paragraph is gone.
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("remembered");
    expect(notes[1]).toContain("machine translated");
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

  it("marks machine-translated locales now that the core 4 ship: mark + 2 footnotes", async () => {
    bootGuest();
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    );
    (row as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector("#screen-language")?.textContent).toContain(
      "Machine translated",
    );
    expect(root.querySelector("#screen-language")?.textContent).toContain(
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

  it("shows a draft string in the title for a machine-translated locale", () => {
    registerLocale("ja", testJaLocale("draft"));
    const { sheet } = buildFirstVisitSheet("ja", {
      onAccept: () => {},
      onDecline: () => {},
    });
    expect(sheet.querySelector(".t")?.textContent).toBe("テストタイトル");
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

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";

/**
 * Fix round 2 (verification residuals after PRs #95–#99):
 *
 * - B9: TU-1 step 1 stranded its card at the top of the lesson stage
 *   because the stage's flex spacer (and the control row's
 *   margin-top:auto) consumed the free space PR #98's centring was
 *   meant to distribute. The CSS contract below pins the removal;
 *   the structure test pins that the stage still renders its card,
 *   spacer, dots and controls as one column.
 * - C4: Learn row metadata must be the identical field set on every
 *   variant — no duration span anywhere (the static /learn/ page is
 *   pinned in content-pages.test.ts).
 * - C7/N7: every Language row carries the same two lines (native
 *   over English name), English included, at one fixed height, and
 *   the footnotes anchor to the foot of the screen.
 * - C8: the About page distributes its groups over the full height.
 *
 * Layout contracts for the online items (B6/C16/C20) live in
 * online-i18n-band.test.ts and fix-round2-online.test.ts.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = () => ({
    finished: Promise.resolve(),
    cancel: () => {},
    play: () => {},
    pause: () => {},
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function tab(name: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(`.tabbtn[data-tab="${name}"]`)!;
}

const stylesCss = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

describe("B9: the lesson stage centres its whole column", () => {
  it("the spacer no longer grows and the control row has no auto margin in the stage", () => {
    expect(stylesCss).toMatch(/\.tspacer \{ flex: 0 0 10px; \}/);
    expect(stylesCss).not.toMatch(/\.tspacer \{ flex: 1/);
    expect(stylesCss).toMatch(/\.lstage \.revctl \{ margin-top: 0; \}/);
    expect(stylesCss).toMatch(/\.lstage \{[^}]*justify-content: center/);
  });

  it("TU-1 step 1 renders its stage as card, spacer, dots, controls", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    root.querySelector<HTMLButtonElement>('[data-module="tu1"]')!.click();
    await settle();
    const stage = root.querySelector("#screen-table .lstage");
    expect(stage).not.toBeNull();
    expect(stage!.querySelector(".revpanel")).not.toBeNull();
    expect(stage!.querySelector(".tspacer")).not.toBeNull();
    expect(stage!.querySelector(".dots")).not.toBeNull();
    expect(stage!.querySelector(".revctl")).not.toBeNull();
    expect(stage!.querySelector(".revpanel")!.textContent).toContain("Mahjong is played with tiles");
  });
});

describe("C4: Learn rows carry the identical field set on every variant", () => {
  it("no lesson row on the Learn tab shows a duration, and every row has number + title", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    const rows = [...root.querySelectorAll("#screen-learn .lrow")];
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(row.textContent ?? "").not.toMatch(/\d+\s*min\b/);
      expect(row.querySelector(".n")).not.toBeNull();
      expect(row.querySelector(".ttl")).not.toBeNull();
    }
    // Every variant section is present, so the parity claim covers
    // Riichi, Hong Kong, MCR, Taiwanese and American alike.
    const heads = [...root.querySelectorAll("#screen-learn .secttl")].map((s) => s.textContent);
    expect(heads).toEqual(["Riichi", "Hong Kong Old Style", "MCR", "Taiwanese", "American"]);
  });
});

describe("C7/N7: Language rows are one height with footnotes at the foot", () => {
  it("every row carries native + English lines, English included", async () => {
    new App(root);
    await settle();
    tab("more").click();
    await settle();
    const row = [...root.querySelectorAll("#screen-more .hrow")].find((b) =>
      b.textContent?.includes("Language"),
    )!;
    (row as HTMLButtonElement).click();
    await settle();
    const rows = [...root.querySelectorAll("#screen-language .i18n-row")];
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.querySelector(".nm")).not.toBeNull();
      expect(r.querySelector(".en")).not.toBeNull();
    }
    expect(rows.map((r) => r.querySelector(".en")?.textContent)).toEqual([
      "English",
      "Japanese · Machine translated",
      "Korean · Machine translated",
      "Simplified Chinese · Machine translated",
      "Traditional Chinese · Machine translated",
    ]);
  });

  it("the CSS pins one row height and anchors the first footnote to the foot", () => {
    expect(stylesCss).toMatch(/\.i18n-row \{[^}]*height: 63px; min-height: 63px; max-height: 63px/);
    expect(stylesCss).toMatch(/\.i18n-list \+ \.i18n-note \{ margin-top: auto; \}/);
    expect(stylesCss).toMatch(/\.i18n-page \{[^}]*display: flex; flex-direction: column/);
  });
});

describe("C8: the About page distributes its groups", () => {
  it("the About page carries the distributing class and the CSS anchors its section heads", async () => {
    new App(root);
    await settle();
    const page = root.querySelector("#screen-about .page");
    expect(page).not.toBeNull();
    expect(page!.classList.contains("aboutpage")).toBe(true);
    expect(stylesCss).toMatch(/\.page\.aboutpage \{ display: flex; flex-direction: column; \}/);
    expect(stylesCss).toMatch(/\.page\.aboutpage > h3 \{ margin-top: auto; padding-top: 18px; \}/);
  });
});

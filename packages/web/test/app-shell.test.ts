// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";

/**
 * App shell (renderings app-shell-v1, approved 2026-11-16): four tab
 * roots with the tab bar present ONLY there, the Play tab's fresh
 * and continue states, Learn's collapsible variant sections, and
 * the Games tab's in-progress row.
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
  // jsdom has no Web Animations; the table's FLIP playback calls
  // el.animate — a no-op stub keeps the event player running.
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

function tabbarHidden(): boolean {
  return root.querySelector<HTMLElement>(".tabbar")!.hidden;
}

function activeScreen(): string {
  return root.querySelector(".screen.active")?.id ?? "";
}

describe("app shell: tab navigation", () => {
  it("routes between the four roots and marks the active tab", async () => {
    new App(root);
    await settle();
    expect(activeScreen()).toBe("screen-home");
    expect(tabbarHidden()).toBe(false);
    for (const [name, screen] of [
      ["learn", "screen-learn"],
      ["games", "screen-games"],
      ["more", "screen-more"],
      ["home", "screen-home"],
    ] as const) {
      tab(name).click();
      await settle();
      expect(activeScreen()).toBe(screen);
      expect(tabbarHidden()).toBe(false);
      expect(tab(name).getAttribute("aria-current")).toBe("page");
      expect(tab(name).classList.contains("on")).toBe(true);
    }
  });

  it("hides the tab bar on drilled-in screens (nav law)", async () => {
    new App(root);
    await settle();
    tab("more").click();
    await settle();
    const rules = [...root.querySelectorAll<HTMLButtonElement>("#screen-more .hrow")]
      .find((b) => b.textContent?.includes("Rules"));
    rules?.click();
    await settle();
    expect(activeScreen()).toBe("screen-rules");
    expect(tabbarHidden()).toBe(true);
    // Back returns to the root the screen was opened from.
    root.querySelector<HTMLButtonElement>("#screen-rules .bar .iconbtn")?.click();
    await settle();
    expect(activeScreen()).toBe("screen-more");
    expect(tabbarHidden()).toBe(false);
  });

  it("hides the tab bar on the table during a game", async () => {
    new App(root);
    await settle();
    root.querySelector<HTMLButtonElement>("#screen-home .play")?.click();
    await settle();
    expect(activeScreen()).toBe("screen-table");
    expect(tabbarHidden()).toBe(true);
  });

  it("swipe-back from a drilled-in screen returns to its tab root", async () => {
    new App(root);
    await settle();
    tab("more").click();
    await settle();
    const privacy = [...root.querySelectorAll<HTMLButtonElement>("#screen-more .hrow")]
      .find((b) => b.textContent?.includes("Privacy"));
    privacy?.click();
    await settle();
    expect(activeScreen()).toBe("screen-privacy");
    const stage = root.querySelector("#stage")!;
    const touch = (type: string, x: number, y: number) => {
      const e = new Event(type, { bubbles: true });
      Object.defineProperty(e, type === "touchstart" ? "touches" : "changedTouches", {
        value: [{ clientX: x, clientY: y }],
      });
      stage.dispatchEvent(e);
    };
    touch("touchstart", 4, 200);
    touch("touchend", 220, 206);
    await settle();
    expect(activeScreen()).toBe("screen-more");
    expect(tabbarHidden()).toBe(false);
  });
});

describe("app shell: Play states", () => {
  it("fresh state: fan + motif row, no Continue card, no tagline", async () => {
    new App(root);
    await settle();
    expect(root.querySelectorAll("#screen-home .fanwrap .t-fan").length).toBe(14);
    expect(root.querySelector("#screen-home .motifrow")).not.toBeNull();
    expect(root.querySelector("#screen-home .contcard")).toBeNull();
    expect(root.querySelector("#screen-home .wall .wrow.r1")?.children.length).toBe(16);
    // QC N3: row 2 drops one back so the brick offset cannot clip.
    expect(root.querySelector("#screen-home .wall .wrow.r2")?.children.length).toBe(15);
    expect(document.body.textContent).not.toContain("Free forever. Open source mahjong.");
  });

  it("continue state: Continue card with live state replaces the motif row", async () => {
    new App(root);
    await settle();
    root.querySelector<HTMLButtonElement>("#screen-home .play")?.click();
    await settle();
    expect(activeScreen()).toBe("screen-table");
    tab("home").click();
    await settle();
    const card = root.querySelector("#screen-home .contcard");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("aria-label")).toBe("Resume game");
    expect(card?.textContent).toContain("Game in progress");
    expect(card?.textContent).toContain("East 1 · You are");
    expect(card?.textContent).toContain("Continue ›");
    expect(card?.textContent).toContain("25,000");
    expect(root.querySelector("#screen-home .motifrow")).toBeNull();
    // And the card resumes the same game.
    (card as HTMLButtonElement).click();
    await settle();
    expect(activeScreen()).toBe("screen-table");
  });
});

describe("app shell: Play variant picker (segment control)", () => {
  const segButtons = () =>
    [...root.querySelectorAll<HTMLButtonElement>("#screen-home .play-variant-seg button")];
  const checkedLabel = () =>
    segButtons().find((b) => b.getAttribute("aria-checked") === "true")?.textContent;

  it("renders four radio segments with the real labels and no Play select", async () => {
    new App(root);
    await settle();
    const group = root.querySelector("#screen-home .play-variant-seg");
    expect(group?.getAttribute("role")).toBe("radiogroup");
    expect(group?.getAttribute("aria-label")).toBe("Play variant");
    expect(segButtons().map((b) => b.textContent)).toEqual([
      "Riichi",
      "Hong Kong Old Style",
      "MCR",
      "Taiwanese",
    ]);
    for (const b of segButtons()) expect(b.getAttribute("role")).toBe("radio");
    // The old native select is gone from the Play tab.
    expect(root.querySelector("#screen-home select.play-variant")).toBeNull();
    // Riichi starts selected, with the roving tabindex on it.
    expect(checkedLabel()).toBe("Riichi");
    expect(segButtons().map((b) => b.classList.contains("on"))).toEqual([true, false, false, false]);
    expect(segButtons().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("clicking a segment changes the variant and its downstream Play state", async () => {
    new App(root);
    await settle();
    segButtons()[2]!.click(); // MCR
    await settle();
    expect(checkedLabel()).toBe("MCR");
    expect(segButtons().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
    // Downstream: the length seg switches to the variant lengths and
    // the motif caption follows the variant (Flowers, not Dora).
    const lengthSeg = root.querySelectorAll("#screen-home .seg:not(.play-variant-seg):not(.play-mode-seg) button");
    expect([...lengthSeg].map((b) => b.textContent)).toEqual(["East", "East + South", "Four rounds"]);
    expect(root.querySelector("#screen-home .motifrow .cap")?.textContent).toBe("Flowers");
    // And back: Riichi restores the riichi lengths and Dora caption.
    segButtons()[0]!.click();
    await settle();
    expect(checkedLabel()).toBe("Riichi");
    const riichiSeg = root.querySelectorAll("#screen-home .seg:not(.play-variant-seg):not(.play-mode-seg) button");
    expect([...riichiSeg].map((b) => b.textContent)).toEqual(["East only", "East + South"]);
    expect(root.querySelector("#screen-home .motifrow .cap")?.textContent).toBe("Dora");
  });

  it("the Play tab carries the Solo/Online segment with Solo selected (multiplayer UI v1, Option B)", async () => {
    new App(root);
    await settle();
    const modeSeg = root.querySelectorAll("#screen-home .play-mode-seg button");
    expect([...modeSeg].map((b) => b.textContent)).toEqual(["Solo", "Online"]);
    expect(modeSeg[0]!.classList.contains("on")).toBe(true);
    expect(modeSeg[0]!.getAttribute("aria-checked")).toBe("true");
    expect(modeSeg[1]!.getAttribute("aria-checked")).toBe("false");
  });

  it("arrow keys move the selection and focus follows", async () => {
    new App(root);
    await settle();
    const first = segButtons()[0]!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(checkedLabel()).toBe("Hong Kong Old Style");
    expect(document.activeElement?.textContent).toBe("Hong Kong Old Style");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle();
    expect(checkedLabel()).toBe("Riichi");
    expect(document.activeElement?.textContent).toBe("Riichi");
  });
});

describe("app shell: Learn sections", () => {
  const sectionByTitle = (title: string) =>
    [...root.querySelectorAll("#screen-learn .learnsec")].find(
      (s) => s.querySelector(".secttl")?.textContent === title,
    )!;

  it("collapses and re-expands the Riichi section, persisting the choice", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    expect(sectionByTitle("Riichi").querySelector(".sechead")?.getAttribute("aria-expanded")).toBe("true");
    expect(sectionByTitle("Riichi").querySelectorAll(".lrow").length).toBe(11);
    expect(sectionByTitle("Riichi").querySelector(".seccount")?.textContent).toBe("0 of 11 lessons done");
    sectionByTitle("Riichi").querySelector<HTMLButtonElement>(".sechead")?.click();
    await settle();
    expect(sectionByTitle("Riichi").querySelector(".sechead")?.getAttribute("aria-expanded")).toBe("false");
    expect(sectionByTitle("Riichi").querySelectorAll(".lrow").length).toBe(0);
    expect(JSON.parse(localStorage.getItem("openmahjong.learn.collapsed.v1") ?? "[]")).toEqual(["riichi"]);
    sectionByTitle("Riichi").querySelector<HTMLButtonElement>(".sechead")?.click();
    await settle();
    expect(sectionByTitle("Riichi").querySelectorAll(".lrow").length).toBe(11);
  });

  it("renders every variant section in the Riichi section grammar", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    // No native disclosure/progress elements anywhere on Learn.
    expect(root.querySelectorAll("#screen-learn details, #screen-learn summary, #screen-learn progress").length).toBe(0);
    for (const title of ["Hong Kong Old Style", "MCR (Mahjong Competition Rules)", "Taiwanese"]) {
      const section = sectionByTitle(title);
      expect(section, title).toBeTruthy();
      expect(section.querySelector(".sechead")?.getAttribute("aria-expanded")).toBe("true");
      expect(section.querySelector(".seccount")?.textContent).toMatch(/^0 of 10 lessons done$/);
      expect(section.querySelector(".progbar")).not.toBeNull();
      const rows = section.querySelectorAll(".lrow");
      expect(rows.length).toBe(10);
      // Rows carry the Riichi row parts: number, title, chevron.
      expect(rows[0]?.querySelector(".n")?.textContent).toBe("1");
      expect(rows[0]?.querySelector(".ttl")?.textContent?.length).toBeGreaterThan(0);
      expect(rows[0]?.querySelector(".chev")).not.toBeNull();
    }
  });

  it("orders Learn: intro line, riichi section, riichi practice row, then variant sections with practice below the lessons", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    const page = root.querySelector("#screen-learn .tabpage")!;
    expect(page.textContent).toContain("Lessons teach each game from the first tile. Start with lesson 1 of the game you want to learn.");
    const children = [...page.children];
    const riichiIndex = children.findIndex((c) => c.querySelector?.(".secttl")?.textContent === "Riichi");
    const practiceIndex = children.findIndex((c) => c.classList.contains("practicerow"));
    const hkIndex = children.findIndex((c) => c.querySelector?.(".secttl")?.textContent === "Hong Kong Old Style");
    expect(riichiIndex).toBeGreaterThanOrEqual(0);
    expect(practiceIndex).toBeGreaterThan(riichiIndex);
    expect(hkIndex).toBeGreaterThan(practiceIndex);
    // Each variant section's Practice button sits below its lesson rows.
    const hk = sectionByTitle("Hong Kong Old Style");
    const hkChildren = [...hk.children];
    const lastRow = hkChildren.map((c) => c.classList.contains("lrow")).lastIndexOf(true);
    const practiceBtn = hkChildren.findIndex((c) => c.textContent === "Practice Hong Kong Old Style");
    expect(lastRow).toBeGreaterThanOrEqual(0);
    expect(practiceBtn).toBeGreaterThan(lastRow);
  });

  it("collapses a variant section under its own id, independently of Riichi", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    sectionByTitle("MCR (Mahjong Competition Rules)").querySelector<HTMLButtonElement>(".sechead")?.click();
    await settle();
    expect(sectionByTitle("MCR (Mahjong Competition Rules)").querySelectorAll(".lrow").length).toBe(0);
    expect(JSON.parse(localStorage.getItem("openmahjong.learn.collapsed.v1") ?? "[]")).toEqual(["mcr"]);
    expect(sectionByTitle("Riichi").querySelectorAll(".lrow").length).toBe(11);
  });
});

describe("app shell: Games in-progress row", () => {
  it("lists the in-progress game first with a Resume action", async () => {
    new App(root);
    await settle();
    tab("games").click();
    await settle();
    expect(root.querySelector("#screen-games .iprow")).toBeNull();
    tab("home").click();
    await settle();
    root.querySelector<HTMLButtonElement>("#screen-home .play")?.click();
    await settle();
    tab("games").click();
    await settle();
    const row = root.querySelector("#screen-games .iprow");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("IN PROGRESS");
    expect(row?.textContent).toContain("East 1 · East + South");
    expect(row?.textContent).toContain("You are");
    expect(row?.textContent).toContain("25,000 points");
    expect(row?.textContent).toContain("Resume");
    (row as HTMLButtonElement).click();
    await settle();
    expect(activeScreen()).toBe("screen-table");
  });
});

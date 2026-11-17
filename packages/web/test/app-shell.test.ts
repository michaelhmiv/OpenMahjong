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

describe("app shell: Learn sections", () => {
  it("collapses and re-expands the Riichi section, persisting the choice", async () => {
    new App(root);
    await settle();
    tab("learn").click();
    await settle();
    expect(root.querySelector("#screen-learn .sechead")?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelectorAll("#screen-learn .lrow").length).toBe(11);
    expect(root.querySelector("#screen-learn .seccount")?.textContent).toBe("0 of 11 lessons done");
    root.querySelector<HTMLButtonElement>("#screen-learn .sechead")?.click();
    await settle();
    expect(root.querySelector("#screen-learn .sechead")?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelectorAll("#screen-learn .lrow").length).toBe(0);
    expect(JSON.parse(localStorage.getItem("openmahjong.learn.collapsed.v1") ?? "[]")).toEqual(["riichi"]);
    root.querySelector<HTMLButtonElement>("#screen-learn .sechead")?.click();
    await settle();
    expect(root.querySelectorAll("#screen-learn .lrow").length).toBe(11);
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

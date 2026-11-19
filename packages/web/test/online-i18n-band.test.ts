// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineApp } from "../src/online.js";
import { initI18n } from "../src/i18n/index.js";
import jaData from "../src/i18n/locales/ja.json" with { type: "json" };

/**
 * F24 regression: the Online surface was never wired to the locale
 * system — under /ja/ the lobby, its sheets and even the tab bar
 * rendered English. The online module now resolves every string
 * through t()/tx() (online.* keys), so a Japanese session renders
 * Japanese online. Expected strings are read from the shipped ja
 * draft file itself, never re-typed here.
 *
 * B6 regression (CSS contract): the online table's chip band clipped
 * opponents' names at the screen edges because the centre chip was
 * absolutely centred over its neighbours. The band now lays the
 * three chips out as shrinking flex items and ellipsises the name
 * inside its chip. Layout itself is covered by the browser captures;
 * this pins the rules that produce it.
 */

const ja = (key: string): string =>
  (jaData as { keys: Record<string, { value: string }> }).keys[key]!.value;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  window.history.replaceState(null, "", "/ja/#/online");
  initI18n({ pathname: "/ja/" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/online/me")) {
        return { ok: true, status: 200, json: async () => null } as Response;
      }
      throw new TypeError("unexpected fetch " + url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("online surface under /ja/ (F24)", () => {
  it("renders the tab bar, lobby and guest sheet in Japanese", async () => {
    await onlineApp(root);
    await settle();
    const tabLabels = [...root.querySelectorAll(".tabbtn span")].map(
      (s) => s.textContent,
    );
    expect(tabLabels).toEqual([
      ja("ui.app.play"),
      ja("ui.app.learn"),
      ja("ui.app.games"),
      ja("ui.app.more"),
    ]);
    const texts = [...root.querySelectorAll("button, h2")].map(
      (b) => b.textContent,
    );
    expect(texts).toContain(ja("online.guest.play-as-guest"));
    expect(texts).toContain(ja("online.guest.title"));
    expect(texts).not.toContain("Play as guest");
    expect(texts).not.toContain("Play online");
  });
});

describe("online chip band layout contract (B6)", () => {
  const css = readFileSync(
    resolve(__dirname, "../src/online.css"),
    "utf8",
  );
  it("lays the centre chip in the flex row instead of absolutely centred", () => {
    expect(css).toMatch(/\.bandtop \.chip\.west \{[^}]*position: static/);
    expect(css).toMatch(/\.bandtop \.chip \{[^}]*min-width: 0/);
  });
  it("ellipsises the display name inside its chip", () => {
    expect(css).toMatch(/\.chip \.nm \{[^}]*text-overflow: ellipsis/);
  });
});

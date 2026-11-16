// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, HOME_STRIP_GROUPS, tileSymbol } from "../src/app.js";
import { tileById } from "../src/model.js";

/**
 * Theme v6 guards (design rules, docs/design-rules.md): the retired
 * v5 plum / sky tokens must never come back, gold stays inside its
 * six quarantined roles, the v6 fonts are the shipped fonts, and the
 * home strip renders the specified 14-tile hand.
 */

const WEB = "packages/web";
const RETIRED = ["#231f2e", "#2f2a3d", "#554a6b", "#46a5e0"];

function srcFiles(): string[] {
  const dir = resolve(process.cwd(), `${WEB}/src`);
  return readdirSync(dir)
    .filter((f) => /\.(ts|css)$/.test(f))
    .map((f) => resolve(dir, f));
}

describe("theme v6: retired tokens", () => {
  it("no retired plum/sky hexes anywhere in web src or the privacy page", () => {
    const files = [
      ...srcFiles(),
      resolve(process.cwd(), `${WEB}/public/privacy/index.html`),
      resolve(process.cwd(), `${WEB}/index.html`),
      resolve(process.cwd(), `${WEB}/public/manifest.webmanifest`),
      resolve(process.cwd(), `${WEB}/public/icon.svg`),
    ];
    for (const f of files) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const hex of RETIRED) {
        expect(text.includes(hex), `${f} contains retired ${hex}`).toBe(false);
      }
    }
  });

  it("no Nunito anywhere in web src", () => {
    for (const f of srcFiles()) {
      expect(readFileSync(f, "utf8").includes("Nunito"), `${f} mentions Nunito`).toBe(false);
    }
  });
});

describe("theme v6: gold discipline (design rules section 2)", () => {
  // The only selectors allowed to reference gold. Everything else —
  // selection rings, focus outlines, switch fills, point deltas —
  // uses the state green or cream.
  const GOLD_ALLOWLIST = new Set([
    ":root", // the token definition itself
    ".wordmark",
    "#screen-home .play",
    ".infocard .ic-cta",
    ".infocard .progbar i",
    ".avatar",
    ".chip .dealer",
  ]);

  function rules(css: string): { selector: string; body: string }[] {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out: { selector: string; body: string }[] = [];
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComments)) !== null) {
      out.push({ selector: m[1]!.trim(), body: m[2]! });
    }
    return out;
  }

  it("gold appears only within the allowlisted selectors in styles.css", () => {
    const css = readFileSync(resolve(process.cwd(), `${WEB}/src/styles.css`), "utf8");
    const goldRules = rules(css).filter(
      (r) => r.body.includes("var(--gold)") || r.body.toLowerCase().includes("#d9b45c"),
    );
    expect(goldRules.length).toBeGreaterThan(0);
    for (const r of goldRules) {
      expect(GOLD_ALLOWLIST.has(r.selector), `gold leaks into selector: ${r.selector}`).toBe(true);
    }
    // The shared --accent variable of v5 is gone entirely, so gold
    // cannot leak through a re-pointed variable again.
    expect(css.includes("--accent")).toBe(false);
  });

  it("the gold hex is not hard-coded anywhere else in web src", () => {
    for (const f of srcFiles()) {
      if (f.endsWith("styles.css")) continue;
      expect(
        readFileSync(f, "utf8").toLowerCase().includes("#d9b45c"),
        `${f} hard-codes the gold hex`,
      ).toBe(false);
    }
  });
});

describe("theme v6: fonts", () => {
  it("ships Fraunces + Figtree variable fonts and no Nunito", () => {
    const fontsDir = resolve(process.cwd(), `${WEB}/public/fonts`);
    for (const name of ["fraunces-var.woff2", "figtree-var.woff2"]) {
      const p = resolve(fontsDir, name);
      expect(existsSync(p), `${name} missing`).toBe(true);
      expect(readFileSync(p).subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
    expect(existsSync(resolve(fontsDir, "nunito-var.woff2"))).toBe(false);
    const css = readFileSync(resolve(process.cwd(), `${WEB}/src/styles.css`), "utf8");
    expect(css).toContain('font-family: "Fraunces"');
    expect(css).toContain('font-family: "Figtree"');
  });
});

// -- home strip ---------------------------------------------------------------

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: async () => body } as unknown as Response;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme v6: home tile strip", () => {
  it("renders the specified 14-tile hand in 3-3-3-2-3 groups", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    new App(root);
    await settle();
    const tiles = [...root.querySelectorAll("#screen-home .tilestrip .tile.t-strip")];
    expect(tiles.length).toBe(14);
    const hrefs = tiles.map(
      (t) => t.querySelector("use")?.getAttribute("href") ?? "",
    );
    const expected = HOME_STRIP_GROUPS.flat().map((id) => `#${tileSymbol(tileById(id))}`);
    expect(hrefs).toEqual(expected);
    // The specified composition, spelled out: 2m 3m 4m · 3p 4p red-5p ·
    // 6s 7s 8s · 9s 9s · chun x3.
    expect(hrefs).toEqual([
      "#t-m2", "#t-m3", "#t-m4",
      "#t-p3", "#t-p4", "#t-p5r",
      "#t-s6", "#t-s7", "#t-s8",
      "#t-s9", "#t-s9",
      "#t-chun", "#t-chun", "#t-chun",
    ]);
    // Group gaps: the first tile of groups 2-5 carries .grp.
    const grpAt = tiles
      .map((t, i) => (t.classList.contains("grp") ? i : -1))
      .filter((i) => i >= 0);
    expect(grpAt).toEqual([3, 6, 9, 11]);
    // Depth treatment: every strip tile carries its edge element.
    for (const t of tiles) expect(t.querySelector("i.edge")).not.toBeNull();
    // The glow centre is pinned for the guest state.
    expect(
      root.querySelector("#screen-home")?.style.getPropertyValue("--glow-y"),
    ).toBe("27%");
  });

  it("shows Last game + Learn progress cards for a signed-in player with data", async () => {
    localStorage.setItem(
      "openmahjong.tutorial.v1",
      JSON.stringify({ done: ["tu1", "tu2", "tu3"] }),
    );
    const game = {
      id: "g1",
      length: "south",
      placement: 1,
      score: 32400,
      finishedAt: new Date().toISOString(),
      log: null,
      stats: {
        hands: 9, riichi: 2, dealIns: 1, handsWon: 3, winPoints: 15700,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith("/api/me")) {
          return jsonResponse({ user: { name: "Michael M" }, csrfToken: "tok" });
        }
        if (u.endsWith("/api/stats")) {
          return jsonResponse({
            games: 1, wins: 1, placementSum: 1, hands: 9, riichi: 2,
            dealIns: 1, handsWon: 3, winPoints: 15700,
            since: "2026-11-16T12:00:00.000Z",
          });
        }
        if (u.endsWith("/api/games")) return jsonResponse({ games: [game] });
        return jsonResponse({}, false);
      }),
    );
    new App(root);
    await settle();
    const last = root.querySelector("#screen-home .infocard.lastcard");
    expect(last?.textContent).toContain("Last game");
    expect(last?.textContent).toContain("Today");
    expect(last?.textContent).toContain("East + South · 1st · 32,400");
    const prog = root.querySelector("#screen-home .infocard.learnprog");
    expect(prog?.textContent).toContain("Learn — 3 of 11 lessons done");
    expect(prog?.textContent).toContain("Continue ›");
    expect(
      prog?.querySelector<HTMLElement>(".progbar i")?.style.width,
    ).toBe("27%");
    // With a progress card present, the fallback Learn pill is gone.
    const secButtons = [...root.querySelectorAll("#screen-home .secrow .pillbtn")].map(
      (b) => b.textContent,
    );
    expect(secButtons).toEqual(["History", "Stats"]);
    expect(
      root.querySelector("#screen-home")?.style.getPropertyValue("--glow-y"),
    ).toBe("22%");
  });
});

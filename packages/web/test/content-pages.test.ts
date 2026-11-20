import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES } from "../src/education/curriculum.js";
import { variantLessons } from "../src/education/variant-content.js";
import {
  AMERICAN_LESSONS,
  AMERICAN_TRAINING_LINE,
} from "../src/education/american.js";

/**
 * Static content pages (design rules section 18): the pages in
 * public/ are real documents whose content is drawn from the app's
 * own data. These guards make silent drift a test failure:
 *  (a) /learn/ lesson counts and titles vs the lesson data;
 *  (b) /riichi/ rules bullets vs buildTextScreens in app.ts;
 *  (c) every internal link on a content page (and the home shell)
 *      points at a route that is actually served;
 *  (d) gold stays inside its static-page quarantine (wordmark +
 *      the single app-entry button), /privacy included.
 */

const WEB = "packages/web";
const ORIGIN = "https://openmahjong.app";

const PAGES = [
  { route: "/riichi/", name: "Riichi rules" },
  { route: "/learn/", name: "Mahjong lessons" },
  { route: "/hong-kong/", name: "Hong Kong Old Style rules" },
  { route: "/mcr/", name: "MCR rules" },
  { route: "/taiwanese/", name: "Taiwanese rules" },
  { route: "/calculator/", name: "Score calculators" },
] as const;

function pubFile(path: string): string {
  return readFileSync(resolve(process.cwd(), `${WEB}/public/${path}`), "utf8");
}

function pageHtml(route: string): string {
  return pubFile(`${route.replace(/^\/|\/$/g, "")}/index.html`);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

describe("content pages: existence and heads", () => {
  it("ships one shared sheet and one document per route", () => {
    expect(existsSync(resolve(process.cwd(), `${WEB}/public/pages.css`))).toBe(true);
    for (const { route } of PAGES) {
      expect(
        existsSync(resolve(process.cwd(), `${WEB}/public${route}index.html`)),
        `${route}index.html missing`,
      ).toBe(true);
    }
  });

  for (const { route, name } of PAGES) {
    it(`${route} carries its own title, description, canonical and JSON-LD`, () => {
      const html = pageHtml(route);
      const url = `${ORIGIN}${route}`;
      expect(html).toContain("<title>");
      expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
      expect(html).toContain(`<link rel="canonical" href="${url}" />`);
      expect(html).toContain(`<meta property="og:url" content="${url}" />`);
      expect(html).toContain('<link rel="stylesheet" href="/pages.css">');
      const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(match, "JSON-LD block missing").not.toBeNull();
      const data = JSON.parse(match![1]) as {
        "@graph": Record<string, unknown>[];
      };
      const webPage = data["@graph"].find((n) => n["@type"] === "WebPage");
      expect(webPage?.url).toBe(url);
      const crumbs = data["@graph"].find((n) => n["@type"] === "BreadcrumbList");
      const items = (crumbs?.itemListElement ?? []) as Record<string, unknown>[];
      expect(items[0]?.item).toBe(`${ORIGIN}/`);
      expect(items[items.length - 1]?.item).toBe(url);
      expect(items[items.length - 1]?.name).toBe(name);
    });

    it(`${route} never claims no ads or no gacha`, () => {
      const text = pageHtml(route).toLowerCase();
      expect(text).not.toContain("no ads");
      expect(text).not.toContain("no gacha");
    });
  }
});

describe("content pages: /learn/ cannot drift from the lesson data", () => {
  const html = pageHtml("/learn/");

  interface Track {
    name: string;
    titles: string[];
    minutes: (number | null)[];
  }

  function parseTracks(): Track[] {
    const chunks = html.split('<div class="trackhead">').slice(1);
    return chunks.map((chunk) => {
      const bounded = chunk.split('<div class="appcta">')[0]!;
      const name = bounded.match(/<span class="tname">([^<]+)<\/span>/)![1]!;
      // Lesson rows contain no nested <div>, so each row ends at the
      // first closing </div> after its opening tag.
      const rows = [...bounded.matchAll(/<div class="row">([\s\S]*?)<\/div>/g)];
      const titles: string[] = [];
      const minutes: (number | null)[] = [];
      for (const row of rows) {
        titles.push(stripTags(row[1]!.match(/<span class="ttl">([\s\S]*?)<\/span>/)![1]!));
        const meta = row[1]!.match(/<span class="meta">(\d+) min<\/span>/);
        minutes.push(meta ? Number(meta[1]) : null);
      }
      return { name, titles, minutes };
    });
  }

  const expected: { name: string; titles: string[] }[] = [
    {
      name: "Riichi",
      titles: MODULES.map((m) => m.title),
    },
    { name: "Hong Kong Old Style", titles: variantLessons("hong-kong").map((l) => l.title) },
    { name: "MCR", titles: variantLessons("mcr").map((l) => l.title) },
    { name: "Taiwanese", titles: variantLessons("taiwanese").map((l) => l.title) },
    { name: "American", titles: AMERICAN_LESSONS.map((l) => l.title) },
  ];

  it("lists every track with the source titles, in order", () => {
    const tracks = parseTracks();
    expect(tracks.map((t) => t.name)).toEqual(expected.map((t) => t.name));
    for (let i = 0; i < expected.length; i++) {
      expect(tracks[i]!.titles, `${expected[i]!.name} titles drifted`).toEqual(
        expected[i]!.titles,
      );
    }
  });

  it("states the true lesson count per track and in total", () => {
    const tracks = parseTracks();
    const heads = [...html.matchAll(/<span class="tmeta">(\d+) lessons<\/span>/g)].map(
      (m) => Number(m[1]),
    );
    expect(heads).toEqual(expected.map((t) => t.titles.length));
    expect(tracks.reduce((sum, t) => sum + t.titles.length, 0)).toBe(52);
    expect(html).toContain("52 interactive lessons");
  });

  it("carries no duration meta on any track (C4: identical field set)", () => {
    // C4 (fix round 2): the Riichi rows alone carried "N min" meta —
    // the real render path PR #98 missed (it fixed the in-app rows;
    // this page still showed durations for one variant only). Variant
    // lessons carry no minutes metadata, so no track shows a duration
    // here, exactly as the in-app Learn rows now agree.
    for (const track of parseTracks()) {
      expect(track.minutes, `${track.name} rows must not carry durations`).toEqual(
        track.titles.map(() => null),
      );
    }
  });

  it("carries the American training line verbatim from american.ts", () => {
    expect(html).toContain(AMERICAN_TRAINING_LINE);
    expect(html).toContain('<span class="badge">TRAINING ONLY</span>');
  });
});

describe("content pages: /riichi/ cannot drift from the app's Rules screen", () => {
  function appRules(): { intro: string; sections: { heading: string; bullets: string[] }[] } {
    const appTs = readFileSync(resolve(process.cwd(), `${WEB}/src/app.ts`), "utf8");
    const start = appTs.indexOf('this.textScreen("rules", tx("ui.app.rules", "Rules"');
    expect(start).toBeGreaterThan(-1);
    const rest = appTs.slice(start);
    const end = rest.indexOf("this.textScreen(", 10);
    const block = rest.slice(0, end);
    const unescape = (s: string) =>
      s.replace(/\\(.)/g, (_m, c: string) =>
        c === "n" ? "\n" : c === "t" ? "\t" : c,
      );
    const tokens: { kind: "p" | "h3" | "li"; text: string }[] = [];
    // The Rules screen's copy sits in tx() fallbacks since the i18n
    // rewire (the English source of each key): headings are
    // h("h3", {}, tx("…", "…")), the intro and bullets are the block's
    // local p/li helpers called with tx("…", "…").
    const re = /h\("h3", \{\}, tx\("[^"]*", "((?:[^"\\]|\\.)*)"\)\)|\b(p|li)\(tx\("[^"]*", "((?:[^"\\]|\\.)*)"\)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      if (m[1] !== undefined) tokens.push({ kind: "h3", text: unescape(m[1]) });
      else tokens.push({ kind: m[2] as "p" | "li", text: unescape(m[3]!) });
    }
    const intro = tokens.find((t) => t.kind === "p")!.text;
    const sections: { heading: string; bullets: string[] }[] = [];
    for (const t of tokens) {
      if (t.kind === "h3") sections.push({ heading: t.text, bullets: [] });
      else if (t.kind === "li") sections[sections.length - 1]!.bullets.push(t.text);
    }
    return { intro: decodeEntities(intro), sections };
  }

  function pageRules(): { intro: string; sections: { heading: string; bullets: string[] }[] } {
    const html = pageHtml("/riichi/");
    const intro = stripTags(html.match(/<p class="standfirst">([\s\S]*?)<\/p>/)![1]!);
    const sections: { heading: string; bullets: string[] }[] = [];
    const re = /<h2 id="[^"]+">([^<]+)<\/h2>\s*<ul class="rules">([\s\S]*?)<\/ul>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const bullets = [...m[2]!.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((li) =>
        stripTags(li[1]!),
      );
      sections.push({ heading: decodeEntities(m[1]!), bullets });
    }
    return { intro, sections };
  }

  it("reproduces the intro, section headings and every bullet verbatim", () => {
    const app = appRules();
    const page = pageRules();
    expect(page.intro).toBe(app.intro);
    expect(page.sections.map((s) => s.heading)).toEqual(
      app.sections.map((s) => s.heading),
    );
    for (let i = 0; i < app.sections.length; i++) {
      expect(page.sections[i]!.bullets, `section ${app.sections[i]!.heading}`).toEqual(
        app.sections[i]!.bullets.map((b) => decodeEntities(b)),
      );
    }
  });
});

describe("content pages: internal links resolve to served routes", () => {
  function served(pathname: string): boolean {
    if (pathname === "/") return true;
    const rel = pathname.replace(/^\//, "");
    if (existsSync(resolve(process.cwd(), `${WEB}/public/${rel}`))) return true;
    if (existsSync(resolve(process.cwd(), `${WEB}/public/${rel}/index.html`))) return true;
    if (rel.endsWith("/") && existsSync(resolve(process.cwd(), `${WEB}/public/${rel}index.html`)))
      return true;
    return false;
  }

  function internalHrefs(html: string): string[] {
    return [...html.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((h) => h.startsWith("/") && !h.startsWith("//"))
      .map((h) => h.split("#")[0]!.split("?")[0]!)
      .filter((h) => h.length > 0);
  }

  it("every internal link on the six pages is served", () => {
    for (const { route } of PAGES) {
      for (const href of internalHrefs(pageHtml(route))) {
        expect(served(href), `${route} links to unserved ${href}`).toBe(true);
      }
    }
  });

  it("every internal link in the home shell is served", () => {
    const index = readFileSync(resolve(process.cwd(), `${WEB}/index.html`), "utf8");
    const shell = index.slice(
      index.indexOf('<div class="om-shell">'),
      index.indexOf("<noscript>"),
    );
    for (const href of internalHrefs(shell)) {
      expect(served(href), `home shell links to unserved ${href}`).toBe(true);
    }
    expect(shell).toContain("<h1>Open Mahjong</h1>");
    expect(shell).toContain("52 interactive tutorial lessons");
  });

  it("the sitemap lists exactly the served document URLs", () => {
    const sitemap = pubFile("sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    for (const loc of locs) {
      expect(served(new URL(loc).pathname), `sitemap entry ${loc} is not served`).toBe(true);
    }
    const expected = [
      `${ORIGIN}/`,
      ...PAGES.map((p) => `${ORIGIN}${p.route}`),
      `${ORIGIN}/privacy`,
    ].sort();
    expect([...locs].sort()).toEqual(expected);
  });
});

describe("content pages: gold discipline (design rules sections 2 and 18)", () => {
  function cssRules(css: string): { selector: string; body: string }[] {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out: { selector: string; body: string }[] = [];
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComments)) !== null) {
      out.push({ selector: m[1]!.trim(), body: m[2]! });
    }
    return out;
  }

  it("gold appears in pages.css only as the token, the wordmark and the app-entry button", () => {
    const css = pubFile("pages.css");
    expect(css.toLowerCase().split("#d9b45c").length - 1).toBe(1);
    const goldRules = cssRules(css).filter(
      (r) => r.body.includes("var(--gold)") || r.body.toLowerCase().includes("#d9b45c"),
    );
    expect(goldRules.length).toBeGreaterThan(0);
    for (const r of goldRules) {
      expect(
        [":root", ".wordmark", ".playbtn"].includes(r.selector),
        `gold leaks into selector: ${r.selector}`,
      ).toBe(true);
    }
  });

  it("no content page carries gold inline", () => {
    for (const { route } of PAGES) {
      const html = pageHtml(route).toLowerCase();
      expect(html.includes("#d9b45c"), `${route} hard-codes gold`).toBe(false);
      expect(html.includes("var(--gold)"), `${route} references gold`).toBe(false);
      // Two app-entry buttons per page (header + closing panel; the
      // header entry was licensed by the full-audit fix round, F14 —
      // both are the same .playbtn gold fill, no other gold).
      expect(pageHtml(route).split('class="playbtn"').length - 1).toBe(2);
    }
  });

  it("/privacy links are cream, not gold (the section 18 correction)", () => {
    const privacy = pubFile("privacy/index.html");
    expect(privacy.toLowerCase()).not.toContain("#d9b45c");
    // F13: /privacy rides the shared static system (pages.css carries
    // the cream-link treatment) with the site header and wordmark.
    expect(privacy).toContain('<link rel="stylesheet" href="/pages.css">');
    expect(privacy).toContain('class="wordmark"');
    expect(privacy).toContain('class="sitenav"');
  });

  it("the home shell uses no gold at all", () => {
    const index = readFileSync(resolve(process.cwd(), `${WEB}/index.html`), "utf8");
    expect(index.toLowerCase()).not.toContain("#d9b45c");
  });
});

describe("content pages: F12 phone nav contract (fix round 3)", () => {
  it("at phone widths the sitenav never wraps and stays above the 11px floor", () => {
    // QC refuted round 2's "no orphan wrap" claim: the links met the
    // 44px floor but still wrapped to two rows at 390px. The layout
    // itself is asserted in scripts/browser-static-nav.mjs; this pins
    // the CSS inputs it depends on.
    const css = pubFile("pages.css");
    const phone = css.slice(css.indexOf("@media (max-width: 560px)"));
    expect(phone).toMatch(/\.sitenav \{[^}]*flex-wrap: nowrap/);
    expect(phone).toMatch(/\.sitenav a \{ font-size: 12px; \}/);
    expect(css).toMatch(/\.sitenav a \{[^}]*min-height: 44px/);
  });
});

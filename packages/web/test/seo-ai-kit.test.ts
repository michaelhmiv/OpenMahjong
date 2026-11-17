import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEO + AI discoverability kit guards: the crawler-facing files in
 * public/ and the <head>/noscript additions in index.html must keep
 * their exact contents — search engines and AI crawlers read these
 * verbatim, so a silent edit is a silent delisting.
 */

const WEB = "packages/web";
const TITLE = "Open Mahjong — Play Mahjong Online, Free";
const DESCRIPTION =
  "Play mahjong online in your browser against the CPU, with real scoring, interactive tutorial lessons, and guided hints with explanations. Free and open source — no account or download needed.";
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
];

function pub(name: string): string {
  return readFileSync(resolve(process.cwd(), `${WEB}/public/${name}`), "utf8");
}

function indexHtml(): string {
  return readFileSync(resolve(process.cwd(), `${WEB}/index.html`), "utf8");
}

describe("robots.txt", () => {
  const robots = pub("robots.txt");

  it("allows all crawlers", () => {
    expect(robots).toContain("User-agent: *\nAllow: /");
  });

  it("explicitly allows every major AI crawler group", () => {
    for (const bot of AI_BOTS) {
      expect(robots, `missing allow group for ${bot}`).toContain(`User-agent: ${bot}\nAllow: /`);
    }
  });

  it("points at the sitemap", () => {
    expect(robots).toContain("Sitemap: https://openmahjong.app/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  const sitemap = pub("sitemap.xml");

  it("lists exactly the real served URLs", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    expect(locs).toEqual(["https://openmahjong.app/", "https://openmahjong.app/privacy"]);
  });

  it("is a urlset document", () => {
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });
});

describe("llms.txt", () => {
  const llms = pub("llms.txt");

  it("summarises the app and links home, privacy, and the repo", () => {
    expect(llms).toContain("# Open Mahjong");
    expect(llms).toContain("https://openmahjong.app/");
    expect(llms).toContain("https://openmahjong.app/privacy");
    expect(llms).toContain("https://github.com/michaelhmiv/OpenMahjong");
  });

  it("never claims no ads or no gacha", () => {
    expect(llms.toLowerCase()).not.toContain("no ads");
    expect(llms.toLowerCase()).not.toContain("no gacha");
  });
});

describe("index.html head", () => {
  const html = indexHtml();

  it("has the canonical URL", () => {
    expect(html).toContain('<link rel="canonical" href="https://openmahjong.app/" />');
  });

  it("has the document title carrying the factual search copy", () => {
    expect(html).toContain(`<title>${TITLE}</title>`);
  });

  it("has the full Open Graph block with the verbatim description", () => {
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="Open Mahjong" />');
    expect(html).toContain(`<meta property="og:title" content="${TITLE}" />`);
    expect(html).toContain(`<meta property="og:description" content="${DESCRIPTION}" />`);
    expect(html).toContain('<meta property="og:url" content="https://openmahjong.app/" />');
    expect(html).toContain('<meta property="og:image" content="https://openmahjong.app/og-image.png" />');
  });

  it("has the Twitter card block matching OG", () => {
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(`<meta name="twitter:title" content="${TITLE}" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${DESCRIPTION}" />`);
    expect(html).toContain('<meta name="twitter:image" content="https://openmahjong.app/og-image.png" />');
  });

  it("carries a JSON-LD WebApplication block that parses", () => {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match, "JSON-LD script block missing").not.toBeNull();
    const data = JSON.parse(match![1]) as Record<string, unknown>;
    expect(data["@type"]).toBe("WebApplication");
    expect(data.name).toBe("Open Mahjong");
    expect(data.url).toBe("https://openmahjong.app/");
    expect(data.applicationCategory).toBe("GameApplication");
    const offers = data.offers as Record<string, unknown>;
    expect(offers.price).toBe("0");
    expect(offers.priceCurrency).toBe("USD");
    expect(String(data.license)).toContain("agpl");
  });
});

describe("index.html noscript", () => {
  const html = indexHtml();

  it("gives non-JS readers the landing facts as real HTML", () => {
    const match = html.match(/<noscript>([\s\S]*?)<\/noscript>/);
    expect(match, "noscript block missing").not.toBeNull();
    const body = match![1];
    expect(body).toContain("<h1>Open Mahjong</h1>");
    expect(body).toContain("Free forever. Open source mahjong.");
    expect(body).toContain("mahjong against the CPU");
    expect(body).toContain("11 interactive tutorial lessons");
    expect(body).toContain('href="https://github.com/michaelhmiv/OpenMahjong"');
    expect(body).toContain('href="/privacy"');
    expect(body.toLowerCase()).not.toContain("no ads");
    expect(body.toLowerCase()).not.toContain("no gacha");
  });
});

describe("og-image.png", () => {
  it("exists at 1200x630", () => {
    const path = resolve(process.cwd(), `${WEB}/public/og-image.png`);
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });
});

describe("favicon set (plan gap Q6)", () => {
  const html = indexHtml();

  function pngDims(name: string): [number, number] {
    const bytes = readFileSync(resolve(process.cwd(), `${WEB}/public/${name}`));
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }

  it("ships PNG fallbacks at real dimensions next to the SVG", () => {
    expect(pngDims("icon-192.png")).toEqual([192, 192]);
    expect(pngDims("icon-512.png")).toEqual([512, 512]);
    expect(pngDims("apple-touch-icon.png")).toEqual([180, 180]);
  });

  it("declares the SVG, both PNGs, and the apple-touch-icon in the head", () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="./icon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png" />');
  });

  it("lists the PNG icons in the PWA manifest alongside the SVG", () => {
    const manifest = JSON.parse(pub("manifest.webmanifest")) as {
      icons: { src: string; sizes: string; type: string }[];
    };
    const bySrc = new Map(manifest.icons.map((icon) => [icon.src, icon]));
    expect(bySrc.get("./icon.svg")?.type).toBe("image/svg+xml");
    expect(bySrc.get("./icon-192.png")).toMatchObject({ sizes: "192x192", type: "image/png" });
    expect(bySrc.get("./icon-512.png")).toMatchObject({ sizes: "512x512", type: "image/png" });
  });
});

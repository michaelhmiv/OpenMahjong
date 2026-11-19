// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADSENSE_CONFIG, adSlotEl, adsConfigured } from "../src/ads.js";
import { App } from "../src/app.js";

/**
 * AdSense connect (implementation path Steps 1-4): the exact Google
 * snippet in index.html, the exact ads.txt line, the privacy policy's
 * Advertising section in both mirrors, and the Home banner slot
 * shipping DARK — it renders nothing while ADSENSE_CONFIG is empty.
 */

const WEB = "packages/web";

const SNIPPET =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2708638041809482"\n' +
  '     crossorigin="anonymous"></script>';

const ADS_TXT_LINE = "google.com, pub-2708638041809482, DIRECT, f08c47fec0942fa0";

describe("AdSense snippet and ads.txt", () => {
  it("index.html carries the exact snippet Google issued, in <head>", () => {
    const html = readFileSync(resolve(process.cwd(), `${WEB}/index.html`), "utf8");
    expect(html).toContain(SNIPPET);
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain(SNIPPET);
  });

  it("public/ads.txt is exactly the one issued line", () => {
    const txt = readFileSync(resolve(process.cwd(), `${WEB}/public/ads.txt`), "utf8");
    expect(txt).toBe(`${ADS_TXT_LINE}\n`);
    expect(txt.trim().split("\n")).toEqual([ADS_TXT_LINE]);
  });

  it("styles.css does not reintroduce the deleted --accent variable", () => {
    const css = readFileSync(resolve(process.cwd(), `${WEB}/src/styles.css`), "utf8");
    expect(css.includes("--accent")).toBe(false);
  });
});

describe("privacy policy: Advertising section in both mirrors", () => {
  it("the static /privacy page discloses AdSense accurately", () => {
    const html = readFileSync(
      resolve(process.cwd(), `${WEB}/public/privacy/index.html`),
      "utf8",
    );
    expect(html).toContain("<h2>Advertising</h2>"); // F13: /privacy rides pages.css, whose section heads are h2
    expect(html).toContain("Google AdSense");
    expect(html).toContain("non-personalized");
    expect(html).toContain("https://policies.google.com/technologies/partner-sites");
    expect(html).toContain("https://adssettings.google.com");
    // The pre-ads claim is gone: it would contradict the section.
    expect(html).not.toContain("We do not use advertising or tracking cookies.");
  });

  it("the in-app Privacy screen mirrors the same disclosure", () => {
    const src = readFileSync(resolve(process.cwd(), `${WEB}/src/app.ts`), "utf8");
    expect(src).toContain('"Advertising"');
    expect(src).toContain("Google AdSense");
    expect(src).toContain("non-personalized");
    expect(src).toContain("https://policies.google.com/technologies/partner-sites");
    expect(src).toContain("https://adssettings.google.com");
    expect(src).not.toContain("We do not use advertising or tracking cookies.");
  });
});

describe("banner slot gating", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as unknown as { adsbygoogle?: unknown }).adsbygoogle;
  });

  it("the shipped config is empty, so the slot is dark", () => {
    expect(ADSENSE_CONFIG).toEqual({ clientId: "", slotId: "" });
    expect(adsConfigured()).toBe(false);
    expect(adSlotEl()).toBeNull();
  });

  it("either id alone is not enough", () => {
    expect(adsConfigured({ clientId: "ca-pub-2708638041809482", slotId: "" })).toBe(false);
    expect(adsConfigured({ clientId: "", slotId: "1234567890" })).toBe(false);
    expect(adSlotEl({ clientId: "ca-pub-2708638041809482", slotId: "" })).toBeNull();
    expect(adSlotEl({ clientId: "", slotId: "1234567890" })).toBeNull();
  });

  it("with both ids, builds the approved slot and queues the ad", () => {
    const el = adSlotEl({ clientId: "ca-pub-2708638041809482", slotId: "1234567890" });
    expect(el).not.toBeNull();
    expect(el!.className).toBe("adslot");
    expect(el!.getAttribute("aria-label")).toBe("Advertisement");
    const label = el!.querySelector(".adlab");
    expect(label?.textContent).toBe("AD");
    const ins = el!.querySelector("ins.adsbygoogle");
    expect(ins).not.toBeNull();
    expect(ins!.classList.contains("adcreative")).toBe(true);
    expect(ins!.getAttribute("data-ad-client")).toBe("ca-pub-2708638041809482");
    expect(ins!.getAttribute("data-ad-slot")).toBe("1234567890");
    // The unit is responsive in the console, but the approved
    // rendering fixes the creative at 320x50: no format="auto",
    // dimensions pinned inline.
    expect(ins!.getAttribute("data-ad-format")).toBeNull();
    expect((ins as HTMLElement).style.width).toBe("320px");
    expect((ins as HTMLElement).style.height).toBe("50px");
    const queue = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
    expect(queue).toEqual([{}]);
  });
});

// -- dark Home ----------------------------------------------------------------

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

describe("dark Home (shipped config)", () => {
  it("renders no ad slot anywhere on Home", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    new App(root);
    await settle();
    expect(root.querySelector("#screen-home .adslot")).toBeNull();
    expect(root.querySelector("#screen-home ins.adsbygoogle")).toBeNull();
    expect(root.querySelector("#screen-home .adlab")).toBeNull();
    // The rest of Home is intact.
    expect(root.querySelector("#screen-home .play")?.textContent).toBe("Play");
    // The AGPL footer moved to the More tab with the shell.
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    expect(root.querySelector("#screen-more .footer")?.textContent).toContain("AGPLv3");
  });

  it("the in-app Privacy screen shows the Advertising section", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
    new App(root);
    await settle();
    root.querySelector<HTMLButtonElement>('.tabbtn[data-tab="more"]')?.click();
    await settle();
    const btn = [...root.querySelectorAll<HTMLButtonElement>("#screen-more .hrow")]
      .find((b) => b.textContent?.includes("Privacy"));
    btn?.click();
    await settle();
    const page = root.querySelector("#screen-privacy .page");
    expect(page?.textContent).toContain("Advertising");
    expect(page?.textContent).toContain("Google AdSense");
    expect(page?.textContent).toContain("non-personalized");
    const hrefs = [...(page?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://policies.google.com/technologies/partner-sites");
    expect(hrefs).toContain("https://adssettings.google.com");
  });
});

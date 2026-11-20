/**
 * F12 regression (fix round 3): the static content pages' header nav
 * sits on ONE row at phone widths.
 *
 * PR #98 raised the nav links to the 44px floor and claimed "no
 * orphan wrap", but QC measured the row still wrapping at 390px —
 * seven 13.5px links plus 16px gaps need ~446px against the 334px
 * column, so Calculator/Privacy dropped to a second row (y=87 vs
 * y=39). The phone nav now never wraps (one row, tighter gaps, 12px
 * type — above the 11px floor). This check visits every static page
 * at 390x844 and asserts all seven links share one y, each link is
 * at least 44px tall with its text unclipped, and the page has no
 * horizontal overflow.
 *
 * Start the built client's static server first, then:
 *   node scripts/browser-static-nav.mjs http://127.0.0.1:4173 work/static-nav
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-harness.mjs";

const base = new URL(process.argv[2] || "http://127.0.0.1:4173").href;
const output = resolve(process.argv[3] || "work/static-nav");
await mkdir(output, { recursive: true });

const PAGES = ["/riichi/", "/hong-kong/", "/mcr/", "/taiwanese/", "/learn/", "/calculator/", "/privacy"];

const browser = await chromium.launch(browserLaunchOptions());
const report = { base, observedAt: new Date().toISOString(), pages: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const path of PAGES) {
    await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const links = [...document.querySelectorAll(".sitenav a")].map((a) => {
        const r = a.getBoundingClientRect();
        return {
          text: (a.textContent || "").trim(),
          x: round(r.x),
          y: round(r.y),
          w: round(r.width),
          h: round(r.height),
          scrollW: a.scrollWidth,
          clientW: a.clientWidth,
          fontSize: parseFloat(getComputedStyle(a).fontSize),
        };
      });
      const se = document.scrollingElement || document.documentElement;
      return { links, overflowX: se.scrollWidth - window.innerWidth };
    });
    assert.equal(m.links.length, 7, `${path}: seven nav links render`);
    const ys = m.links.map((l) => l.y);
    assert.ok(
      Math.max(...ys) - Math.min(...ys) <= 1,
      `${path}: all nav links share one row (ys ${ys.join(", ")})`,
    );
    for (const l of m.links) {
      assert.ok(l.h >= 43.5, `${path}: "${l.text}" link is at least 44px tall (h ${l.h})`);
      assert.ok(l.scrollW <= l.clientW + 1, `${path}: "${l.text}" text is not clipped`);
      assert.ok(l.fontSize >= 11, `${path}: "${l.text}" stays at or above the 11px floor`);
    }
    assert.ok(m.overflowX <= 0, `${path}: no horizontal overflow (overflowX ${m.overflowX})`);
    report.pages.push({ path, ...m });
    if (path === "/riichi/")
      await page.screenshot({ path: resolve(output, "static-nav-riichi-390.png") });
  }
  await writeFile(resolve(output, "static-nav.metrics.json"), JSON.stringify(report, null, 1));
  console.log(
    "static-nav PASS:",
    report.pages
      .map((p) => `${p.path} y=${p.links[0].y} h=${p.links[0].h} overflowX=${p.overflowX}`)
      .join(" | "),
  );
} finally {
  await browser.close();
}

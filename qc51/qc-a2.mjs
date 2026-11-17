/** Independent QC part A2: variant lesson scan + More switches/scan. Fresh context. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const BASE = "http://127.0.0.1:4176";
const OUT = "qc51/out";
mkdirSync(OUT, { recursive: true });
function globalScan() {
  const stage = document.querySelector("#stage");
  const scale = stage && stage.offsetWidth ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
  const root = document.querySelector(".screen.active") ?? document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
  const small = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (!n.textContent?.trim() || !p || p.closest("script,style,svg") || !vis(p)) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize) * scale;
    if (fs < 10.9) small.push({ text: n.textContent.trim().slice(0, 50), px: +fs.toFixed(2), cls: p.className?.toString().slice(0, 50) });
  }
  const GOLD = "rgb(217, 180, 92)";
  const RETIRED = { "rgb(35, 31, 46)": "#231f2e", "rgb(47, 42, 61)": "#2f2a3d", "rgb(85, 74, 107)": "#554a6b", "rgb(70, 165, 224)": "#46a5e0" };
  const goldHits = [], retiredHits = [];
  const desc = (el) => { const chain = []; let cur = el; for (let i = 0; cur && i < 4; i++) { chain.push(cur.tagName.toLowerCase() + (cur.className && typeof cur.className === "string" ? "." + cur.className.split(" ").join(".") : "")); cur = cur.parentElement; } return chain.join(" < "); };
  for (const el of root.querySelectorAll("*")) {
    if (!vis(el) && el.getBoundingClientRect().width === 0) continue;
    const cs = getComputedStyle(el);
    const props = { color: cs.color, backgroundColor: cs.backgroundColor, borderTopColor: cs.borderTopColor, borderBottomColor: cs.borderBottomColor, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow };
    for (const [k, v] of Object.entries(props)) {
      if (!v) continue;
      if (v.includes(GOLD)) goldHits.push({ prop: k, desc: desc(el), text: el.textContent?.trim().slice(0, 30) });
      for (const [rgb, hex] of Object.entries(RETIRED)) if (v.includes(rgb)) retiredHits.push({ hex, prop: k, desc: desc(el) });
    }
  }
  const inter = [...root.querySelectorAll("button, select, input, a[href], [role=button]")].filter(vis).map((el) => ({ el, name: (el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName), cls: el.className?.toString().slice(0, 40), rect: rect(el) }));
  const overlaps = [];
  for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) {
    const a = inter[i], b = inter[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
    const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
    if (w > 1 && h > 1) overlaps.push({ a: a.name, aCls: a.cls, b: b.name, bCls: b.cls, w: +w.toFixed(1), h: +h.toFixed(1), area: +(w * h).toFixed(0) });
  }
  return { scale: +scale.toFixed(3), smallText: small.slice(0, 25), smallTextCount: small.length, goldHits, retiredHits, overlaps: overlaps.slice(0, 25), overlapCount: overlaps.length, interactiveCount: inter.length };
}
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
await ctx.route("https://api.openmahjong.app/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": new URL(BASE).origin, "access-control-allow-credentials": "true" }, body: r.request().url().includes("/api/me") ? '{"user":null,"csrfToken":null}' : "{}" }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: "networkidle" });
const R = {};
await page.locator('.tabbtn[data-tab="learn"]').click();
await page.waitForTimeout(600);
const hkRow = page.locator('#screen-learn .learnsec:has(> button.sechead[data-section="hong-kong"]) .hrow.lrow').first();
await hkRow.scrollIntoViewIfNeeded();
await hkRow.click();
await page.waitForTimeout(800);
R.variantLessonTitle = await page.evaluate(() => document.querySelector(".screen.active h1")?.textContent ?? document.querySelector(".screen.active h2")?.textContent);
R.variantLessonScan = await page.evaluate(globalScan);
writeFileSync(resolve(OUT, "measurements-a2-partial.json"), JSON.stringify(R, null, 2));
await page.screenshot({ path: resolve(OUT, "06-variant-lesson-hk.png") });
console.log("LESSON DONE", R.variantLessonTitle);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.locator('.tabbtn[data-tab="more"]').click();
await page.waitForTimeout(600);
R.moreScan = await page.evaluate(globalScan);
R.moreSwitches = await page.evaluate(() => [...document.querySelectorAll("#screen-more .switch input")].map((i) => { const r = i.getBoundingClientRect(); return { aria: i.getAttribute("aria-label"), inputH: +r.height.toFixed(1), inputW: +r.width.toFixed(1) }; }));
R.errors = errors;
await page.screenshot({ path: resolve(OUT, "07-more.png") });
writeFileSync(resolve(OUT, "measurements-a2.json"), JSON.stringify(R, null, 2));
console.log("A2 DONE");
await browser.close();

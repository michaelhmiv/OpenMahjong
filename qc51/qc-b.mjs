/** Independent QC part B: table fit (claims 3, 4-table, 7) using deterministic fixtures.
 * Writes results incrementally after every state. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { riichiRecords, variantRecords } from "./fixtures.mjs";
const BASE = "http://127.0.0.1:4176";
const OUT = "qc51/out";
mkdirSync(OUT, { recursive: true });
const VW = 390, VH = 844;

console.log("generating fixtures…");
const fixtures = { riichi: riichiRecords(), "hong-kong": variantRecords("hong-kong"), taiwanese: variantRecords("taiwanese") };
for (const [k, v] of Object.entries(fixtures))
  console.log("FIXTURE", k, "late:", JSON.stringify({ d: v.late.discards ?? v.late.totalDiscards, own: v.late.ownPond }), "call:", JSON.stringify({ d: v.call.discards ?? v.call.totalDiscards, own: v.call.ownPond, phase: v.call.phase, pon: v.call.canPon, chi: v.call.chi }));
const earlyRecord = JSON.parse(JSON.stringify(fixtures.riichi.late.record));
earlyRecord.decisions = earlyRecord.decisions.slice(0, 10);

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const results = { fixtureInfo: {} };
for (const [k, v] of Object.entries(fixtures)) results.fixtureInfo[k] = { late: { d: v.late.discards ?? v.late.totalDiscards, own: v.late.ownPond }, call: { d: v.call.discards ?? v.call.totalDiscards, own: v.call.ownPond, phase: v.call.phase ?? null, canPon: v.call.canPon ?? null, chi: v.call.chi ?? null } };
const save = () => writeFileSync(resolve(OUT, "measurements-tables.json"), JSON.stringify(results, null, 2));

async function openState(record) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, reducedMotion: "reduce" });
  await ctx.route("https://api.openmahjong.app/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": new URL(BASE).origin, "access-control-allow-credentials": "true" }, body: r.request().url().includes("/api/me") ? '{"user":null,"csrfToken":null}' : "{}" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate((saved) => {
    localStorage.setItem("openmahjong.game.v1", JSON.stringify(saved));
    localStorage.setItem("openmahjong.settings.v1", JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, guided: true, lastLength: "east" }));
  }, record);
  await page.reload();
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  return { ctx, page, errors };
}
const waitFor = async (page, fn, timeout = 45000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(300); } return false; };

function measureVariant() {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
  const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: false }; const h = document.elementFromPoint(cx, cy); return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: true, hitTag: h?.tagName, hitClass: h?.className?.toString().slice(0, 60) ?? null, hitIsTarget: !!h && (h === el || el.contains(h) || h.contains(el)) }; };
  const pondEl = document.querySelector(".variant-my-pond .pond") ?? document.querySelector(".variant-my-pond");
  const coachEl = document.querySelector(".variant-coach");
  const dockEl = document.querySelector(".variant-dock");
  const inter = (a, b) => { if (!a || !b) return null; const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return +(w * h).toFixed(1); };
  return {
    scrollY: window.scrollY, docScrollH: document.documentElement.scrollHeight,
    actionButtons: [...document.querySelectorAll(".variant-actions button")].map((el) => ({ text: el.textContent.trim().slice(0, 40), rect: R(el), hitCenter: hit(el), disabled: el.disabled })),
    handTiles: [...document.querySelectorAll(".variant-hand-tile")].map((el) => R(el)),
    ownPond: R(pondEl), ownPondHit: hit(pondEl), ownPondTiles: pondEl?.querySelectorAll(".tile").length ?? null,
    coach: R(coachEl), coachText: coachEl?.textContent.trim().slice(0, 160) ?? null, coachVisible: !!coachEl && coachEl.getBoundingClientRect().height > 0,
    coachVsPondIntersectionPx2: inter(R(coachEl), R(pondEl)),
    dock: dockEl ? { ...R(dockEl), clientHeight: dockEl.clientHeight, scrollHeight: dockEl.scrollHeight, scrollTop: dockEl.scrollTop } : null,
  };
}
function measureRiichi() {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
  const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: false }; const h = document.elementFromPoint(cx, cy); return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: true, hitClass: h?.className?.toString().slice(0, 60) ?? null, hitIsTarget: !!h && (h === el || el.contains(h) || h.contains(el)) }; };
  return {
    scrollY: window.scrollY,
    promptButtons: [...document.querySelectorAll(".promptrow.show button")].map((el) => ({ text: el.textContent.trim().slice(0, 40), rect: R(el), hitCenter: hit(el) })),
    handTiles: [...document.querySelectorAll(".handrow > .twrap")].map((el) => R(el)),
    ownPond: R(document.querySelector(".zone-player .pond")), ownPondHit: hit(document.querySelector(".zone-player .pond")),
    guideHint: R(document.querySelector(".guidehint")),
    inspectBtn: R([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Inspect hand")) ?? null),
    inspectHit: hit([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Inspect hand")) ?? null),
  };
}

for (const table of ["hong-kong", "taiwanese"]) {
  results[table] = {};
  for (const state of ["late", "call"]) {
    const { ctx, page, errors } = await openState(fixtures[table][state].record);
    const ready = state === "call"
      ? await waitFor(page, () => [...document.querySelectorAll(".variant-actions button")].some((b) => b.textContent.trim() === "Pass"))
      : await waitFor(page, () => document.querySelectorAll(".variant-hand-tile").length > 0);
    await page.waitForTimeout(900);
    const m = await page.evaluate(measureVariant);
    m.ready = ready; m.errors = errors;
    results[table][state] = m; save();
    await page.screenshot({ path: resolve(OUT, `${table}-${state === "late" ? "turn" : "call"}.png`) });
    await ctx.close();
    console.log("DONE", table, state);
  }
}
{
  const { ctx, page, errors } = await openState(fixtures.riichi.call.record);
  const ready = await waitFor(page, () => [...document.querySelectorAll(".promptrow.show button")].some((b) => b.textContent.trim() === "Pass"));
  await page.waitForTimeout(900);
  const m = await page.evaluate(measureRiichi);
  m.ready = ready; m.errors = errors;
  results.riichiCall = m; save();
  await page.screenshot({ path: resolve(OUT, "riichi-call.png") });
  await ctx.close();
  console.log("DONE riichi call");
}
{
  const { ctx, page, errors } = await openState(fixtures.riichi.late.record);
  await waitFor(page, () => document.querySelectorAll(".handrow > .twrap").length > 0);
  await page.waitForTimeout(900);
  const m = await page.evaluate(measureRiichi);
  m.errors = errors;
  m.inspectProbes = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Inspect hand"));
    if (!btn) return null;
    const r = btn.getBoundingClientRect(); const cx = r.left + r.width / 2;
    const probe = (x, y) => { const h = document.elementFromPoint(x, y); return { hitIsBtn: !!h && (h === btn || btn.contains(h)), hitText: h?.textContent?.trim().slice(0, 20) ?? null, hitTag: h?.tagName ?? null }; };
    return { rect: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1) }, above3: probe(cx, r.top - 3), below3: probe(cx, r.bottom + 3), above8: probe(cx, r.top - 8), below8: probe(cx, r.bottom + 8) };
  });
  results.riichiTurn = m; save();
  await page.screenshot({ path: resolve(OUT, "riichi-turn.png") });
  await ctx.close();
  console.log("DONE riichi turn");
}
{
  const { ctx, page, errors } = await openState(earlyRecord);
  await waitFor(page, () => document.querySelectorAll(".handrow > .twrap").length > 0);
  await page.waitForTimeout(1500);
  results.riichiEarly = await page.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
    const out = { sps: [...document.querySelectorAll(".sp")].map((el) => ({ cls: el.className, label: el.getAttribute("aria-label"), rect: R(el), cells: el.querySelectorAll(".cell").length })) };
    const sp = document.querySelector(".sp.left");
    if (sp) {
      const r = sp.getBoundingClientRect(); const cy = r.top + r.height / 2;
      const probe = (x) => { const h = document.elementFromPoint(x, cy); return { hitIsStrip: !!h && (h === sp || sp.contains(h)), hitClass: h?.className?.toString().slice(0, 50) ?? null }; };
      out.leftProbe = { rect: R(sp), cells: sp.querySelectorAll(".cell").length, minus3: probe(r.left - 3), plus3: probe(r.right + 3), minus8: probe(r.left - 8), plus8: probe(r.right + 8), center: probe(r.left + r.width / 2) };
    }
    return out;
  });
  results.riichiEarly.errors = errors; save();
  await page.screenshot({ path: resolve(OUT, "riichi-early.png") });
  await ctx.close();
  console.log("DONE riichi early");
}
save();
console.log("PART B DONE");
await browser.close();

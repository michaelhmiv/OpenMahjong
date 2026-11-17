/** Independent QC part C: deepest Riichi call state via the audit seed sweep
 * (40 seeds, keep the state maximising min(late, call) total discards).
 * Measures claim 3's Riichi regression + residual 7b at true depth. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { Game } from "../packages/engine/dist/index.js";
import { createAiPolicy } from "../packages/ai/dist/index.js";
const BASE = "http://127.0.0.1:4176";
const OUT = "qc51/out";
mkdirSync(OUT, { recursive: true });

function riichiRecordsFor(seed) {
  const decisions = [];
  const ai = createAiPolicy();
  let game = null, bestTurn = null, bestCall = null;
  const inHand1 = () => game && game.events.filter((e) => e.type === "hand-start").length === 1;
  const snap = (view) => ({
    decisions: [...decisions],
    ownPond: view.players[0].discards.filter((d) => !d.called).length,
    totalDiscards: view.players.reduce((n, p) => n + p.discards.filter((d) => !d.called).length, 0),
  });
  const policy = {
    turn(view, ctx) {
      if (view.seat === 0 && inHand1()) { const s = snap(view); if (!bestTurn || s.totalDiscards >= bestTurn.totalDiscards) bestTurn = s; }
      const a = ai.turn(view, ctx); decisions.push(a); return a;
    },
    call(view, ctx) {
      if (view.seat === 0 && inHand1()) {
        const s = { ...snap(view), phase: ctx.phase, canPon: ctx.canPon, canKan: ctx.canKan, canRon: ctx.canRon, chi: ctx.chiOptions.length };
        const score = (c) => (c.phase === "call" ? 1000 : 0) + c.totalDiscards;
        if (!bestCall || score(s) >= score(bestCall)) bestCall = s;
      }
      const a = ai.call(view, ctx); decisions.push(a); return a;
    },
  };
  game = new Game({ seed, length: "east", policies: policy });
  game.run();
  const mk = (s) => ({ v: 2, engineVersion: 2, aiVersion: 2, ruleset: { id: "openmahjong-riichi", version: 1 }, seed, length: "east", humanSeat: 0, id: randomUUID(), decisions: s.decisions });
  return {
    late: bestTurn && { record: mk(bestTurn), totalDiscards: bestTurn.totalDiscards, ownPond: bestTurn.ownPond },
    call: bestCall && { record: mk(bestCall), totalDiscards: bestCall.totalDiscards, ownPond: bestCall.ownPond, phase: bestCall.phase, canPon: bestCall.canPon, chi: bestCall.chi },
  };
}
let best = null;
for (let i = 0; i < 40; i++) {
  const r = riichiRecordsFor(`audit-b-sweep-${i}`);
  if (!r.late || !r.call) continue;
  const score = Math.min(r.late.totalDiscards, r.call.totalDiscards);
  if (!best || score > best.score) best = { ...r, seed: `audit-b-sweep-${i}`, score };
  if (best.score >= 55) break;
}
console.log("SWEEP BEST", best.seed, "late", best.late.totalDiscards, "own", best.late.ownPond, "| call", best.call.totalDiscards, "own", best.call.ownPond, best.call.phase, "pon", best.call.canPon, "chi", best.call.chi);

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
async function openState(record) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
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
function measure() {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
  const hit = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: false }; const h = document.elementFromPoint(cx, cy); return { cx: +cx.toFixed(1), cy: +cy.toFixed(1), inViewport: true, hitClass: h?.className?.toString().slice(0, 60) ?? null, hitIsTarget: !!h && (h === el || el.contains(h) || h.contains(el)) }; };
  const inspect = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Inspect hand")) ?? null;
  return {
    scrollY: window.scrollY,
    promptButtons: [...document.querySelectorAll(".promptrow.show button")].map((el) => ({ text: el.textContent.trim().slice(0, 40), rect: R(el), hitCenter: hit(el) })),
    handTilesMaxBottom: Math.max(...[...document.querySelectorAll(".handrow > .twrap")].map((el) => el.getBoundingClientRect().bottom)),
    ownPond: R(document.querySelector(".zone-player .pond")),
    inspectBtn: R(inspect), inspectHit: hit(inspect),
  };
}
const out = { seed: best.seed, lateInfo: { totalDiscards: best.late.totalDiscards, ownPond: best.late.ownPond }, callInfo: { totalDiscards: best.call.totalDiscards, ownPond: best.call.ownPond, phase: best.call.phase, canPon: best.call.canPon, chi: best.call.chi } };
{
  const { ctx, page, errors } = await openState(best.call.record);
  out.callReady = await waitFor(page, () => [...document.querySelectorAll(".promptrow.show button")].some((b) => b.textContent.trim() === "Pass"));
  await page.waitForTimeout(900);
  out.call = await page.evaluate(measure);
  out.call.errors = errors;
  await page.screenshot({ path: resolve(OUT, "riichi-call-deepest.png") });
  await ctx.close();
}
{
  const { ctx, page, errors } = await openState(best.late.record);
  await waitFor(page, () => document.querySelectorAll(".handrow > .twrap").length > 0);
  await page.waitForTimeout(900);
  out.turn = await page.evaluate(measure);
  out.turn.errors = errors;
  await page.screenshot({ path: resolve(OUT, "riichi-turn-deepest.png") });
  await ctx.close();
}
writeFileSync(resolve(OUT, "measurements-riichi-deep.json"), JSON.stringify(out, null, 2));
console.log("PART C DONE");
await browser.close();

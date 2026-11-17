/** Independent QC for PR #51 — part A: tab screens (claims 1, 2, 4-switches, 5, 6).
 * Every number is measured live in this run. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const BASE = "http://127.0.0.1:4176";
const OUT = "qc51/out";
mkdirSync(OUT, { recursive: true });
const VW = 390, VH = 844;
const R = {};

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });

async function newCtx(seedFn) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, reducedMotion: "reduce" });
  await ctx.route("https://api.openmahjong.app/**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    headers: { "access-control-allow-origin": new URL(BASE).origin, "access-control-allow-credentials": "true" },
    body: r.request().url().includes("/api/me") ? '{"user":null,"csrfToken":null}' : "{}",
  }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (seedFn) await page.addInitScript(seedFn);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: resolve(OUT, name) });

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
  const desc = (el) => {
    const chain = [];
    let cur = el;
    for (let i = 0; cur && i < 4; i++) { chain.push(cur.tagName.toLowerCase() + (cur.className && typeof cur.className === "string" ? "." + cur.className.split(" ").join(".") : "")); cur = cur.parentElement; }
    return chain.join(" < ");
  };
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

{
  const { ctx, page, errors } = await newCtx();
  const A = {};

  A.playScan = await page.evaluate(globalScan);
  A.playPickerFont = await page.evaluate(() => { const s = document.querySelector(".play-variant"); return s ? parseFloat(getComputedStyle(s).fontSize) : null; });
  A.switches = {};
  A.switches.play = await page.evaluate(() => [...document.querySelectorAll(".screen.active .switch input")].map((i) => { const r = i.getBoundingClientRect(); const l = i.closest(".switch")?.getBoundingClientRect(); return { aria: i.getAttribute("aria-label"), inputH: +r.height.toFixed(1), inputW: +r.width.toFixed(1), labelH: l ? +l.height.toFixed(1) : null }; }));
  await shot(page, "01-play.png");

  await page.locator('.tabbtn[data-tab="learn"]').click();
  await page.waitForTimeout(600);
  A.learn = await page.evaluate(() => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
    const sections = [...document.querySelectorAll("#screen-learn .learnsec")].map((sec) => {
      const head = sec.querySelector("button.sechead");
      const bar = sec.querySelector(".progbar");
      const fill = bar?.querySelector("i");
      const rows = [...sec.querySelectorAll(".hrow.lrow")].map((row) => ({
        rect: rect(row),
        hasN: !!row.querySelector(".n"), hasTtl: !!row.querySelector(".ttl"), hasChev: !!row.querySelector(".chev"),
        hasSt: !!row.querySelector(".st"), text: row.textContent.trim().slice(0, 60),
      }));
      return {
        id: head?.getAttribute("data-section"), title: sec.querySelector(".secttl")?.textContent,
        headRect: rect(head), headTag: head?.tagName, expanded: head?.getAttribute("aria-expanded"),
        barRect: rect(bar), fillColor: fill ? getComputedStyle(fill).backgroundColor : null, fillWidth: fill ? rect(fill).width : null,
        rowCount: rows.length, rows: rows.slice(0, 3), rowHeights: [...new Set(rows.map((r) => r.rect.height))],
      };
    });
    return {
      sections,
      detailsCount: document.querySelectorAll("#screen-learn details").length,
      summaryCount: document.querySelectorAll("#screen-learn summary").length,
      progressCount: document.querySelectorAll("#screen-learn progress").length,
      stateVar: getComputedStyle(document.documentElement).getPropertyValue("--state").trim(),
    };
  });
  A.learnScan = await page.evaluate(globalScan);
  A.switches.learn = await page.evaluate(() => [...document.querySelectorAll("#screen-learn .switch input")].map((i) => { const r = i.getBoundingClientRect(); return { aria: i.getAttribute("aria-label"), inputH: +r.height.toFixed(1), inputW: +r.width.toFixed(1) }; }));
  await shot(page, "02-learn.png");

  const hkHead = page.locator('button.sechead[data-section="hong-kong"]');
  await hkHead.scrollIntoViewIfNeeded();
  await hkHead.click();
  await page.waitForTimeout(400);
  A.collapse = {};
  A.collapse.afterClick = await page.evaluate(() => ({
    stored: localStorage.getItem("openmahjong.learn.collapsed.v1"),
    hkRows: document.querySelectorAll('#screen-learn .learnsec:has(> button.sechead[data-section="hong-kong"]) .hrow.lrow').length,
    hkExpanded: document.querySelector('button.sechead[data-section="hong-kong"]')?.getAttribute("aria-expanded"),
    riichiRows: document.querySelectorAll('#screen-learn .learnsec:has(> button.sechead[data-section="riichi"]) .hrow.lrow').length,
    riichiExpanded: document.querySelector('button.sechead[data-section="riichi"]')?.getAttribute("aria-expanded"),
    riichiBar: !!document.querySelector('#screen-learn .learnsec:has(> button.sechead[data-section="riichi"]) .progbar'),
  }));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.tabbtn[data-tab="learn"]').click();
  await page.waitForTimeout(500);
  A.collapse.afterReload = await page.evaluate(() => ({
    stored: localStorage.getItem("openmahjong.learn.collapsed.v1"),
    hkExpanded: document.querySelector('button.sechead[data-section="hong-kong"]')?.getAttribute("aria-expanded"),
    riichiExpanded: document.querySelector('button.sechead[data-section="riichi"]')?.getAttribute("aria-expanded"),
  }));
  const hkHead2 = page.locator('button.sechead[data-section="hong-kong"]');
  await hkHead2.scrollIntoViewIfNeeded();
  await hkHead2.click();
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.locator(".practice-view").waitFor();
  await page.waitForTimeout(400);
  A.practiceRiichi = await page.evaluate(() => {
    const box = document.querySelector(".practice-selectors");
    const selects = [...document.querySelectorAll(".practice-selectors select")].map((s) => { const r = s.getBoundingClientRect(); return { aria: s.getAttribute("aria-label"), height: +r.height.toFixed(1), fontSize: parseFloat(getComputedStyle(s).fontSize), options: s.options.length, label: s.closest("label")?.childNodes[0]?.textContent?.trim() ?? s.closest("label")?.textContent?.trim().slice(0, 20) }; });
    return { boxExists: !!box, selects };
  });
  await shot(page, "03-practice-riichi.png");
  await page.getByRole("button", { name: "Back", exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  if (!(await page.locator("#screen-learn.active").count())) { await page.locator('.tabbtn[data-tab="learn"]').click().catch(() => {}); await page.waitForTimeout(400); }

  await page.getByRole("button", { name: "Practice Hong Kong Old Style", exact: true }).click();
  await page.waitForTimeout(700);
  const measureVariantPractice = () => page.evaluate(() => {
    const selects = [...document.querySelectorAll(".practice-selectors select")].map((s) => { const r = s.getBoundingClientRect(); return { aria: s.getAttribute("aria-label"), value: s.value, height: +r.height.toFixed(1), fontSize: parseFloat(getComputedStyle(s).fontSize), options: [...s.options].map((o) => ({ value: o.value, text: o.textContent.trim().slice(0, 70) })) }; });
    return { selects, prompt: document.querySelector(".variant-education-content h2")?.textContent?.trim().slice(0, 80) ?? null };
  });
  A.practiceHK = await measureVariantPractice();
  await shot(page, "04-practice-hk-lesson1.png");
  const lessonSel = page.locator('.practice-selectors select[aria-label="Practice lesson"]');
  const lessonValues = A.practiceHK.selects[0].options.map((o) => o.value);
  if (lessonValues.length > 1) {
    await lessonSel.selectOption(lessonValues[1]);
    await page.waitForTimeout(500);
    A.practiceHKAfterSwitch = await measureVariantPractice();
    await shot(page, "05-practice-hk-lesson2.png");
    const exSel = page.locator('.practice-selectors select[aria-label="Practice exercise"]');
    const exOpts = A.practiceHKAfterSwitch.selects[1].options;
    if (exOpts.length > 1) {
      await exSel.selectOption(exOpts[exOpts.length - 1].value);
      await page.waitForTimeout(500);
      A.practiceHKExerciseSwitch = await measureVariantPractice();
    }
  }
  A.errors = errors;
  R.partA = A;
  writeFileSync(resolve(OUT, "measurements-partA.json"), JSON.stringify(R, null, 2));
  console.log("PART A CORE DONE");
  await ctx.close();
}

{
  const seedRecords = () => {
    const recs = [0, 1, 2].map((i) => ({
      id: `qc-dist-${i + 1}`, finishedAt: new Date(Date.UTC(2026, 10, 10 + i)).toISOString(),
      length: "east", placement: 1, score: 30000 + i * 1000,
      stats: { hands: 8, riichi: 2, dealIns: 1, handsWon: 3, winPoints: 12000 }, log: null,
    }));
    try { localStorage.setItem("openmahjong.records.v1", JSON.stringify(recs)); } catch {}
  };
  const { ctx, page, errors } = await newCtx(seedRecords);
  await page.locator('.tabbtn[data-tab="games"]').click();
  await page.waitForTimeout(800);
  R.games = await page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }; };
    const labs = [...document.querySelectorAll(".distlab span")].map((s) => ({ text: s.textContent.trim(), rect: rect(s), whiteSpace: getComputedStyle(s).whiteSpace }));
    const overlaps = [];
    for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
      const w = Math.min(labs[i].rect.right, labs[j].rect.right) - Math.max(labs[i].rect.left, labs[j].rect.left);
      const h = Math.min(labs[i].rect.bottom, labs[j].rect.bottom) - Math.max(labs[i].rect.top, labs[j].rect.top);
      if (w > 0.5 && h > 0.5) overlaps.push({ a: labs[i].text, b: labs[j].text, w: +w.toFixed(1), h: +h.toFixed(1) });
    }
    return {
      labs, overlaps, statCount: document.querySelectorAll(".stat").length,
      statLabels: [...document.querySelectorAll(".stat .l")].map((e) => e.textContent.trim()),
      pickerFont: (() => { const s = document.querySelector(".play-variant"); return s ? parseFloat(getComputedStyle(s).fontSize) : null; })(),
      countText: document.querySelector("#screen-games .count")?.textContent?.trim(),
    };
  });
  R.gamesScan = await page.evaluate(globalScan);
  R.gamesErrors = errors;
  await shot(page, "08-games-dist.png");
  await ctx.close();
}

writeFileSync(resolve(OUT, "measurements-partA.json"), JSON.stringify(R, null, 2));
console.log("PART A DONE");
await browser.close();

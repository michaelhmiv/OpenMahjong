#!/usr/bin/env node
/* Local verification captures for the i18n switcher build (Track B):
 * More tab with the LANGUAGE section + the drilled-in Language screen,
 * measured against the approved design (frames 01/02/05). Serves the
 * built dist/ via packages/web/server.mjs. Not part of the app. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "..", "package.json"));
const { chromium } = require("playwright-core");

const BASE = process.env.OM_BASE ?? "http://127.0.0.1:4181";
const OUT = process.env.OM_OUT ?? "/tmp/i18n-switcher-captures";
const SHELL = process.env.HOME + "/.cache/cft/chrome-headless-shell-linux64/chrome-headless-shell";

const browser = await chromium.launch({ executablePath: SHELL, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.locator("#screen-home.active").waitFor();
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(150);

// No first-visit sheet while only English ships — even with a
// Japanese browser language list (the sheet is dormant).
const sheetCount = await page.locator(".i18n-sheet").count();
console.log("sheet on boot (expect 0):", sheetCount);

await page.locator('.tabbtn[data-tab="more"]').click();
await page.locator("#screen-more.active").waitFor();
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(OUT, "more-390.png") });

const moreProbe = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("#screen-more .sec-label")].map((e) => e.textContent);
  const row = [...document.querySelectorAll("#screen-more .hrow")].find((e) => e.textContent.includes("Language"));
  const r = row?.getBoundingClientRect();
  const tabbar = document.querySelector(".tabbar")?.getBoundingClientRect();
  return {
    labels,
    langRow: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null,
    tabbarTop: tabbar ? Math.round(tabbar.top) : null,
    scrollW: document.documentElement.scrollWidth,
  };
});
console.log("more:", JSON.stringify(moreProbe));

await page.locator('#screen-more .hrow', { hasText: "Language" }).click();
await page.locator("#screen-language.active").waitFor();
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(OUT, "language-390.png") });

const langProbe = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("#screen-language .i18n-row")].map((e) => {
    const r = e.getBoundingClientRect();
    return { text: e.textContent, h: Math.round(r.height), cur: e.classList.contains("cur") };
  });
  const head = document.querySelector(".i18n-head")?.getBoundingClientRect();
  const back = document.querySelector(".i18n-back")?.getBoundingClientRect();
  const title = document.querySelector(".i18n-head h1")?.getBoundingClientRect();
  const check = document.querySelector(".i18n-check svg");
  const checkStroke = check ? getComputedStyle(check).stroke : null;
  const fonts = [...document.querySelectorAll("#screen-language *")]
    .map((e) => ((e.textContent || "").trim() ? parseFloat(getComputedStyle(e).fontSize) : null))
    .filter((v) => v !== null);
  const tabbarHidden = document.querySelector(".tabbar")?.hasAttribute("hidden");
  const notes = [...document.querySelectorAll("#screen-language .i18n-note")].map((e) => e.textContent);
  return {
    rows,
    headH: head ? Math.round(head.height) : null,
    backBox: back ? { w: Math.round(back.width), h: Math.round(back.height) } : null,
    // Optical centre delta between the back glyph and the title.
    titleCentreDelta: title && back ? Math.abs((title.top + title.height / 2) - (back.top + back.height / 2)).toFixed(2) : null,
    checkStroke,
    minFont: Math.min(...fonts),
    tabbarHidden,
    notes,
    scrollW: document.documentElement.scrollWidth,
  };
});
console.log("language:", JSON.stringify(langProbe, null, 1));
await browser.close();

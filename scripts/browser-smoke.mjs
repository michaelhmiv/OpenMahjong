/**
 * Browser evidence for a built client. Start its static server first, then:
 *   node scripts/browser-smoke.mjs http://127.0.0.1:4173 work/browser-smoke
 * Dev-only dependencies: playwright-core, @axe-core/playwright; Chromium.
 * BROWSER_EXECUTABLE overrides Chromium detection. Set BROWSER_FULL_GAME=1
 * for the slower complete-match/history path. API auth is stubbed to a guest
 * unless BROWSER_LIVE_API=1; this is a client test, not an OAuth test.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const { default: AxeBuilder } = await import(process.env.AXE_MODULE || "@axe-core/playwright");
const base = new URL(process.argv[2] || "http://127.0.0.1:4173").href;
const output = resolve(process.argv[3] || "work/browser-smoke");
const bypassTls = process.env.BROWSER_IGNORE_HTTPS_ERRORS === "1";
const launch = { headless: true };
if (process.env.BROWSER_EXECUTABLE) launch.executablePath = process.env.BROWSER_EXECUTABLE;
else if (existsSync("/usr/bin/chromium")) launch.executablePath = "/usr/bin/chromium";
// The sandbox is disabled only when explicitly requested by a container runner.
launch.args = ["--disable-dev-shm-usage"];
if (process.env.BROWSER_NO_SANDBOX === "1") launch.args.push("--no-sandbox");
if (bypassTls) launch.args.push("--ignore-certificate-errors");
await mkdir(output, { recursive: true });
const report = {
  base, observedAt: new Date().toISOString(),
  scope: { guestApiFixture: process.env.BROWSER_LIVE_API !== "1", tlsBypass: bypassTls,
    fullGame: process.env.BROWSER_FULL_GAME === "1", browser: "Chromium headless" },
  checks: [], diagnostics: [], viewports: [],
};
const browser = await chromium.launch(launch);
report.scope.browserVersion = await browser.version();
const networkStates = new WeakMap();
let failureCount = 0;
const saveReport = () => writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
async function check(name, task, page) {
  try {
    const evidence = await task();
    report.checks.push({ name, status: "passed", evidence: evidence ?? null });
    process.stdout.write(`PASS ${name}\n`);
    return true;
  } catch (error) {
    failureCount++;
    report.checks.push({ name, status: "failed", error: String(error) });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
    if (page && !page.isClosed()) await page.screenshot({ path: resolve(output, `failure-${failureCount}.png`) }).catch(() => {});
    return false;
  } finally { await saveReport(); }
}
async function context(viewport, motion = "reduce") {
  const c = await browser.newContext({ viewport, reducedMotion: motion, ignoreHTTPSErrors: bypassTls });
  networkStates.set(c, { mode: "online" });
  c.setDefaultTimeout(12000);
  c.setDefaultNavigationTimeout(20000);
  if (process.env.BROWSER_LIVE_API !== "1") {
    await c.route("https://api.openmahjong.app/**", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(route.request().url().endsWith("/api/me") ? { user: null, csrfToken: null } : {}),
      headers: { "access-control-allow-origin": new URL(base).origin, "access-control-allow-credentials": "true" },
    }));
  }
  return c;
}
async function open(c) {
  const page = await c.newPage();
  const network = networkStates.get(c);
  page.on("pageerror", (e) => report.diagnostics.push({ type: "pageerror", message: e.message, network: network.mode }));
  page.on("console", (m) => { if (m.type() === "error") report.diagnostics.push({ type: "console", message: m.text(), network: network.mode }); });
  page.on("requestfailed", (request) => report.diagnostics.push({
    type: "requestfailed", url: request.url(), message: request.failure()?.errorText,
    network: network.mode,
  }));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#screen-home.active").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function capture(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`) });
}
async function axe(page, name) {
  const result = await new AxeBuilder({ page }).include(".screen.active").analyze();
  await writeFile(resolve(output, `axe-${name}.json`), JSON.stringify(result, null, 2));
  const violations = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  assert.deepEqual(violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), [], "critical/serious axe violations");
  return { violations: result.violations.map((v) => ({ id: v.id, impact: v.impact })), incomplete: result.incomplete.length };
}
async function controls(page) {
  return page.locator(".screen.active").evaluate((active) => [...active.querySelectorAll("button,input,[role=button]")].map((element) => {
    const r = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { text: element.getAttribute("aria-label") || element.textContent?.slice(0, 80),
      x: r.x, y: r.y, width: r.width, height: r.height, fontSize: parseFloat(style.fontSize),
      outside: r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 };
  }));
}
async function leaveLesson(page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Leave lesson", exact: true }).click();
}
async function enterFirstDrill(page) {
  await page.locator(".learncard").click();
  await page.locator('[data-module="tu1"]').click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
try {
  for (const [width, height] of [[360,800],[390,844],[412,915],[768,1024],[1024,768],[1440,900]]) {
    const c = await context({ width, height });
    let page;
    await check(`viewport ${width}x${height}`, async () => {
      page = await open(c);
      const home = await controls(page);
      assert.deepEqual(home.filter((x) => x.outside), [], "home controls must stay within viewport");
      await capture(page, `home-${width}x${height}`);
      await page.locator(".learncard").click();
      await capture(page, `learn-${width}x${height}`);
      await page.locator('[data-module="tu1"]').click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const drill = await controls(page);
      assert.deepEqual(drill.filter((x) => x.outside), [], "drill controls must stay within viewport");
      await capture(page, `drill-${width}x${height}`);
      await leaveLesson(page);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("button", { name: "East only", exact: true }).click();
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.locator(".handrow > .twrap").first().waitFor();
      const table = await controls(page);
      assert.deepEqual(table.filter((x) => x.outside), [], "table controls must stay within viewport");
      await capture(page, `table-${width}x${height}`);
      await page.getByRole("button", { name: "Inspect hand", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await capture(page, `focus-hand-${width}x${height}`);
      report.viewports.push({ width, height, home, drill, table });
      return { homeControls: home.length, drillControls: drill.length, tableControls: table.length };
    }, page);
    await c.close();
  }
  const c = await context({ width: 390, height: 844 });
  const page = await open(c);
  await check("home accessibility", () => axe(page, "home"), page);
  for (const name of ["Rules", "About", "Privacy"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await check(`${name} accessibility`, () => axe(page, name.toLowerCase()), page);
    await capture(page, name.toLowerCase());
    if (name === "Rules" || name === "Privacy") {
      await check(`${name} content scrolls by keyboard`, async () => {
        const region = page.getByRole("region", { name, exact: true });
        const geometry = await region.evaluate((element) => ({ height: element.clientHeight, contentHeight: element.scrollHeight }));
        await region.focus();
        await page.keyboard.press("PageDown");
        if (geometry.contentHeight > geometry.height + 1) {
          await page.waitForFunction((element) => element.scrollTop > 0, await region.elementHandle());
        }
        return { ...geometry, scrollTop: await region.evaluate((element) => element.scrollTop) };
      }, page);
    }
    await page.getByRole("button", { name: "Back", exact: true }).click();
  }
  await check("wrong-answer feedback and lesson resume", async () => {
    await enterFirstDrill(page);
    const before = await page.locator(".revctl .step").innerText();
    await page.locator(".dgrid > .cell").nth(0).click();
    assert.equal(await page.locator(".revctl .step").innerText(), before);
    assert.match(await page.locator(".drillpanel").innerText(), /bamboo/i);
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0);
    await capture(page, "wrong-answer");
    for (const index of [2,4,6,8,9]) await page.locator(".dgrid > .cell").nth(index).click();
    assert.match(await page.locator(".revctl .step").innerText(), /Step 4/);
    await leaveLesson(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".learncard").click();
    await check("in-progress Learn accessibility", () => axe(page, "learn-in-progress"), page);
    assert.match(await page.locator('[data-module="tu1"]').innerText(), /In progress/);
    await page.locator('[data-module="tu1"]').click();
    assert.match(await page.locator(".revctl .step").innerText(), /Step 4/);
    return { wrongAnswerStayedAtStep: 3, restoredStep: 4 };
  }, page);
  await check("tile drill works by keyboard", async () => {
    const tile = page.locator(".dgrid > .cell").nth(0);
    const semantic = await tile.evaluate((e) => ({ tag: e.tagName, role: e.getAttribute("role"), tabIndex: e.tabIndex, name: e.getAttribute("aria-label") }));
    assert.ok(semantic.tag === "BUTTON" || semantic.role === "button", "drill tile needs button semantics");
    assert.ok(semantic.tabIndex >= 0, "drill tile must be focusable");
    assert.ok(semantic.name, "drill tile needs a readable name");
    await tile.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".dgrid > .cell.sel").count(), 1);
    for (const index of [2,4,6]) { await page.locator(".dgrid > .cell").nth(index).focus(); await page.keyboard.press("Space"); }
    assert.match(await page.locator(".revctl .step").innerText(), /Step 5/);
    return semantic;
  }, page);
  // Fresh navigation makes later checks independent of drill failure.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await check("settings accessibility", () => axe(page, "settings"), page);
  await page.locator(".setrow").filter({ hasText: "Reduced motion" }).locator("input").check({ force: true });
  await page.locator(".setrow").filter({ hasText: "Large tiles" }).locator("input").check({ force: true });
  await capture(page, "settings");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "East only", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".handrow > .twrap").first().waitFor();
  await check("table accessibility", () => axe(page, "table"), page);
  await capture(page, "table-large");
  await check("hand selection and discard work by keyboard", async () => {
    const tile = page.locator('.handrow > .twrap[role="button"]').last();
    await tile.waitFor();
    const key = await tile.getAttribute("data-control-key");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("openmahjong.game.v1")).decisions.length);
    await tile.focus();
    await page.keyboard.press("Enter");
    const selected = page.locator('.handrow > .twrap[aria-pressed="true"]');
    assert.equal(await selected.count(), 1);
    assert.equal(await selected.getAttribute("data-control-key"), key);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-control-key")), key, "selection must preserve keyboard focus");
    await page.keyboard.press("Space");
    await page.waitForFunction((count) => JSON.parse(localStorage.getItem("openmahjong.game.v1")).decisions.length > count, before);
    return { selectedTile: key, recordedLegalAction: true };
  }, page);
  await check("hand focus and pause keep keyboard focus inside", async () => {
    await page.getByRole("button", { name: "Inspect hand", exact: true }).click();
    await capture(page, "focus-hand-large");
    assert.equal(await page.getByRole("dialog").count(), 1, "focus frame needs dialog semantics");
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "focus escaped the dialog");
    }
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-control-key")), "inspect-open", "closing the hand must return focus to its opener");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    assert.equal(await page.getByRole("dialog").count(), 1, "pause needs dialog semantics");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    }
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-control-key")), "menu", "closing pause must return focus to Menu");
  }, page);
  await page.goto(base, { waitUntil: "networkidle" });
  await check("game resume survives reload", async () => {
    await page.getByRole("button", { name: "Resume game", exact: true }).click();
    const before = await page.locator(".handrow").innerText();
    const tilesBefore = await page.locator(".handrow > .twrap").count();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Quit to home", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Resume game", exact: true }).click();
    assert.equal(await page.locator(".handrow").innerText(), before);
    assert.equal(await page.locator(".handrow > .twrap").count(), tilesBefore);
    return { restoredTiles: tilesBefore };
  }, page);
  await page.goto(base, { waitUntil: "networkidle" });
  await check("browser back returns from Learn to home", async () => {
    await page.locator(".learncard").click();
    await page.goBack({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#screen-home.active").count(), 1);
  }, page);
  await c.close();
  const motionContext = await context({ width: 390, height: 844 }, "no-preference");
  const motionPage = await open(motionContext);
  await check("in-app reduced motion suppresses hand-sheet animation without OS reduction", async () => {
    assert.equal(await motionPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), false);
    await motionPage.getByRole("button", { name: "Settings", exact: true }).click();
    await motionPage.getByRole("checkbox", { name: "Reduced motion", exact: true }).check({ force: true });
    await motionPage.getByRole("button", { name: "Back", exact: true }).click();
    await motionPage.getByRole("button", { name: "Play", exact: true }).click();
    await motionPage.locator(".handrow > .twrap").first().waitFor();
    await motionPage.getByRole("button", { name: "Inspect hand", exact: true }).click();
    const computed = await motionPage.getByRole("dialog").evaluate((element) => {
      const style = getComputedStyle(element);
      return { animationName: style.animationName, animationDuration: style.animationDuration, rootClass: document.documentElement.className };
    });
    assert.equal(computed.animationName, "none");
    assert.ok(computed.animationDuration.split(",").every((value) => parseFloat(value) === 0));
    await capture(motionPage, "reduced-motion-setting");
    return computed;
  }, motionPage);
  await motionContext.close();
  const offlineContext = await context({ width: 390, height: 844 });
  const offline = await open(offlineContext);
  await check("first-visit offline reload with cold HTTP cache", async () => {
    await offline.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    const cached = await offline.evaluate(async () => Promise.all((await caches.keys()).map(async (key) => ({
      key, urls: (await (await caches.open(key)).keys()).map((r) => r.url),
    }))));
    const session = await offlineContext.newCDPSession(offline);
    // Preserve CacheStorage but remove opportunistic browser HTTP caching,
    // otherwise a broken service worker can appear to support offline play.
    await session.send("Network.clearBrowserCache");
    networkStates.get(offlineContext).mode = "offline";
    await offlineContext.setOffline(true);
    await offline.reload({ waitUntil: "networkidle" });
    await offline.locator("#screen-home.active").waitFor();
    await offline.evaluate(() => document.fonts.ready);
    assert.ok(await offline.evaluate(() => document.fonts.check('14px "Figtree"') && document.fonts.check('30px "Fraunces"')), "shipped fonts must load offline");
    await offline.getByRole("button", { name: "Play", exact: true }).click();
    await offline.locator(".handrow > .twrap").first().waitFor();
    await capture(offline, "offline-table");
    await offline.goto(new URL("privacy", base).href, { waitUntil: "networkidle" });
    assert.equal(await offline.title(), "Privacy Policy — Open Mahjong", "offline /privacy must serve its document rather than the game shell");
    await capture(offline, "offline-privacy");
    return cached;
  }, offline);
  await offlineContext.close();
  if (process.env.BROWSER_FULL_GAME === "1") {
    const fullContext = await context({ width: 390, height: 844 });
    const full = await open(fullContext);
    await check("complete guest East game and reopen history", async () => {
      await full.getByRole("button", { name: "East only", exact: true }).click();
      await full.getByRole("button", { name: "Play", exact: true }).click();
      await full.locator('.handrow > .twrap[role="button"]').first().waitFor();
      const seed = process.env.BROWSER_FULL_GAME_SEED || "browser-smoke-east-v2";
      // Public guest-save schema is a legitimate scenario input. Start
      // at a deterministic real wall, with no invented game state.
      const replayEnvelope = await full.evaluate((scenarioSeed) => {
        const saved = JSON.parse(localStorage.getItem("openmahjong.game.v1"));
        assertNoDecisions(saved);
        function assertNoDecisions(record) {
          if (!record || record.decisions.length !== 0) throw new Error("expected the initial human decision");
        }
        saved.seed = scenarioSeed;
        localStorage.setItem("openmahjong.game.v1", JSON.stringify(saved));
        return { v: saved.v, engineVersion: saved.engineVersion, aiVersion: saved.aiVersion, ruleset: saved.ruleset };
      }, seed);
      assert.deepEqual(replayEnvelope, {
        v: 2, engineVersion: 2, aiVersion: 2,
        ruleset: { id: "openmahjong-riichi", version: 1 },
      }, "full-match browser evidence must exercise the current engine and policy");
      await full.reload({ waitUntil: "networkidle" });
      await full.getByRole("button", { name: "Resume game", exact: true }).click();
      const deadline = Date.now() + 12 * 60 * 1000;
      let actions = 0;
      let loggedActions = 0;
      const prompts = {};
      let checkedBreakdown = false;
      while (Date.now() < deadline && actions < 4000) {
        if (await full.locator("#screen-results.active").count()) break;
        let prompted = false;
        for (const name of ["Final results", "Next hand", "Tsumo", "Ron", "Pass"]) {
          const button = full.getByRole("button", { name, exact: true });
          if (await button.count() && await button.isVisible()) {
            if (!checkedBreakdown && (name === "Next hand" || name === "Final results")) {
              await capture(full, "hand-end-breakdown");
              await check("hand-end breakdown accessibility", () => axe(full, "hand-end-breakdown"), full);
              checkedBreakdown = true;
            }
            await button.click(); actions++; prompted = true;
            prompts[name] = (prompts[name] || 0) + 1;
            break;
          }
        }
        if (await full.locator("#screen-results.active").count()) break;
        const hand = full.locator('.handrow > .twrap[role="button"]');
        if (!prompted && await hand.count()) {
          try { await hand.last().click({ timeout: 500 }); await hand.last().click({ timeout: 500 }); actions++; }
          catch { /* The event player may replace this frame between clicks. */ }
        }
        if (actions >= loggedActions + 50) {
          process.stdout.write(`Match smoke: ${actions} actions\n`);
          loggedActions = actions;
        }
        await full.waitForTimeout(20);
      }
      assert.equal(await full.locator("#screen-results.active").count(), 1, "match did not finish within action/time budget");
      const standings = await full.locator(".results-table").innerText();
      await check("completed results accessibility", () => axe(full, "results"), full);
      await capture(full, "completed-game");
      await full.getByRole("button", { name: "Home", exact: true }).click();
      await full.getByRole("button", { name: "Settings", exact: true }).click();
      await full.locator(".setrow").filter({ hasText: "History" }).getByRole("button", { name: "Open", exact: true }).click();
      assert.equal(await full.locator(".hrow").count(), 1, "one fresh completed match must produce exactly one History record");
      assert.match(await full.locator("#screen-history .count").innerText(), /^1 recorded game$/);
      await full.locator(".hrow").first().click();
      assert.equal(await full.locator("#screen-results.active").count(), 1);
      assert.equal(await full.locator(".results-table").innerText(), standings, "reopened standings must preserve the completed result");
      await capture(full, "history-record-results");
      await full.getByRole("button", { name: "Home", exact: true }).click();
      await full.getByRole("button", { name: "Settings", exact: true }).click();
      await full.locator(".setrow").filter({ hasText: "Stats" }).getByRole("button", { name: "Open", exact: true }).click();
      const played = full.locator(".stat").filter({ hasText: "Games played" }).locator(".v");
      assert.equal(await played.innerText(), "1", "one match must contribute once to guest statistics");
      await capture(full, "single-match-stats");
      return { actions, prompts, seed, replayEnvelope, historyRecords: 1, statisticsGames: 1, result: "completed match, reopened identical standings, and counted one game in History/Stats" };
    }, full);
    await fullContext.close();
  }
  await check("no uncaught browser exceptions", async () => {
    assert.deepEqual(report.diagnostics.filter((d) => d.type === "pageerror"), []);
  });
} finally {
  await saveReport();
  await browser.close();
}
process.stdout.write(`${report.checks.length - failureCount}/${report.checks.length} checks passed; evidence: ${output}\n`);
process.exitCode = failureCount ? 1 : 0;

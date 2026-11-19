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
const learning = process.env.BROWSER_LEARNING !== "0";
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
    fullGame: process.env.BROWSER_FULL_GAME === "1", learning, browser: "Chromium headless" },
  checks: [], diagnostics: [], viewports: [], learningViewports: [],
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
  await page.locator('.tabbtn[data-tab="learn"]').click();
  await page.locator('[data-module="tu1"]').click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function completeIntroLesson(page) {
  await enterFirstDrill(page);
  // These are the authored identification drills, answered through
  // the same controls as a learner. No progress is injected. Each
  // suit is introduced by an explanation step (a Continue) before
  // its drill; the indices are the drills' own target cells.
  const cont = () => page.getByRole("button", { name: "Continue", exact: true }).click();
  const drill = async (indices) => {
    for (const index of indices) await page.locator(".dgrid > .cell").nth(index).click();
  };
  await drill([2,4,6,8,9]); // dots
  await cont(); // bamboo introduction
  await drill([2,4,6,8,9]); // bamboo
  await cont(); // characters introduction
  await cont(); // all nine characters faces, labelled in order
  await cont(); // the 6 and the 9 side by side
  await drill([1,4,6,8,11]); // characters
  await cont(); // winds introduction
  await drill([1]); // East wind, name to face
  await drill([2]); // North wind, name to face
  await cont(); // dragons introduction
  await drill([0,2,4,6]); // honors
  await cont(); // terminals introduction
  await cont(); // simples introduction
  await drill([0,2,4,6]); // terminals
  await cont(); // four copies of every tile
  await cont(); // the red-tinted 5s
  await cont(); // the tile shorthand codes
  await cont(); // face-mastery practice introduction (fix round)
  // Characters glyph-to-number drills, shuffled rows (fix round):
  // 7, 4, 9, 5, 8, 3, 6, 2, 1 of characters.
  await drill([1]); // 7 of characters
  await drill([3]); // 4 of characters
  await drill([5]); // 9 of characters
  await drill([4]); // 5 of characters
  await drill([1]); // 8 of characters
  await drill([4]); // 3 of characters
  await drill([5]); // 6 of characters
  await drill([3]); // 2 of characters
  await drill([7]); // 1 of characters
  await cont(); // wind face-mastery introduction (fix round)
  await drill([2]); // South wind, name to face
  await drill([3]); // West wind, name to face
  await drill([1]); // North wind, name to face
  await drill([2]); // East wind, name to face
  await page.getByText("LESSON COMPLETE", { exact: true }).waitFor();
  await capture(page, "intro-lesson-complete");
  await page.getByRole("button", { name: "All lessons", exact: true }).click();
  await page.locator("#screen-learn.active").waitFor();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("openmahjong.tutorial.v1")).done.includes("tu1")));
  await page.locator('.tabbtn[data-tab="home"]').click();
  await page.locator("#screen-home.active").waitFor();
}

async function enterPractice(page) {
  await page.locator('.tabbtn[data-tab="learn"]').click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.locator(".practice-view").waitFor();
}
async function chooseExercise(page, skill, id) {
  const category = page.getByRole("combobox", { name: "Practice category", exact: true });
  if (await category.inputValue() !== skill) await category.selectOption(skill);
  const exercise = page.getByRole("combobox", { name: "Exercise", exact: true });
  if (await exercise.inputValue() !== id) await exercise.selectOption(id);
  await page.locator(`.practice-view[data-exercise-id="${id}"]`).waitFor();
}
async function selectPracticeTile(page, label, keyboard = false) {
  const tile = page.getByRole("button", { name: `Select ${label}`, exact: true });
  if (keyboard) { await tile.focus(); await page.keyboard.press("Space"); }
  else await tile.click();
  assert.equal(await page.getByRole("button", { name: `Select ${label}`, exact: true }).getAttribute("aria-pressed"), "true");
}
async function practiceAttempts(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("openmahjong.practice.v1") || '{"attempts":[]}').attempts);
}
function shortTileLabel(label) {
  const suited = /^(\d) of (characters|circles|bamboo)( \(red five\))?/.exec(label);
  if (suited) return `${suited[3] ? "Red " : ""}${suited[1]}${{ characters: "m", circles: "p", bamboo: "s" }[suited[2]]}`;
  return label.replace(/ wind$| dragon$/, "");
}
async function reviewFacts(page, kind) {
  const row = page.locator(`[data-review-option="${kind}"]`);
  return {
    tile: await row.locator(".option-name b").innerText(),
    shanten: Number(await row.locator('[data-fact="shanten"]').innerText()),
    unseenCopies: Number(await row.locator('[data-fact="unseen-copies"]').innerText()),
  };
}
async function learningGeometry(page, selector) {
  const geometry = await page.locator(selector).evaluate((root) => {
    const stage = document.querySelector("#stage");
    const scale = stage ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
    const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const controlNodes = [...root.querySelectorAll("button, input, select, summary, a[href], [role=button]")].filter(visible);
    const control = (element) => {
      const bounds = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 90),
        width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
        horizontallyOutside: bounds.x < -1 || bounds.right > innerWidth + 1,
        outside: bounds.x < -1 || bounds.y < -1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1 };
    };
    const texts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (!text.textContent?.trim() || !parent || parent.closest("svg,script,style") || !visible(parent)) continue;
      const style = getComputedStyle(parent);
      texts.push({ text: text.textContent.trim().slice(0, 90), font: style.fontFamily,
        pixels: parseFloat(style.fontSize) * scale, color: style.color });
    }
    return { viewport: { width: innerWidth, height: innerHeight }, stageScale: scale,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      contentOverflow: [...root.querySelectorAll(".learning-content")].some((element) => element.scrollWidth > element.clientWidth + 1),
      controls: controlNodes.map(control),
      fixedControls: [...root.querySelectorAll(".learning-header button, .learning-nav button, .learning-nav a")].filter(visible).map(control),
      texts, fonts: [...document.fonts].filter((face) => ["Figtree", "Fraunces"].includes(face.family)).map((face) => ({ family: face.family, status: face.status })) };
  });
  assert.equal(geometry.documentOverflow, false, "new learning layout must not overflow the document");
  assert.equal(geometry.contentOverflow, false, "learning content must not overflow horizontally");
  assert.deepEqual(geometry.controls.filter((control) => control.width < 43.9 || control.height < 43.9), [], "new learning controls must meet the approved physical44px floor");
  assert.deepEqual(geometry.controls.filter((control) => control.horizontallyOutside), [], "new learning controls must fit horizontally");
  assert.deepEqual(geometry.fixedControls.filter((control) => control.outside), [], "learning header/navigation must stay visible");
  assert.deepEqual(geometry.texts.filter((text) => text.pixels < 10.9), [], "new learning text must meet the approved physical11px floor");
  assert.deepEqual(geometry.texts.filter((text) => !/Figtree|Fraunces/.test(text.font)), [], "new learning UI must use approved UI fonts");
  assert.ok(["Figtree", "Fraunces"].every((family) => geometry.fonts.some((font) => font.family === family && font.status === "loaded")), "both approved self-hosted font faces must load");
  return geometry;
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
      await page.locator('.tabbtn[data-tab="learn"]').click();
      await capture(page, `learn-${width}x${height}`);
      await page.locator('[data-module="tu1"]').click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      const drill = await controls(page);
      assert.deepEqual(drill.filter((x) => x.outside), [], "drill controls must stay within viewport");
      await capture(page, `drill-${width}x${height}`);
      await leaveLesson(page);
      await page.locator('.tabbtn[data-tab="home"]').click();
      await page.getByRole("button", { name: "East only", exact: true }).click();
      await page.locator("#screen-home .play").click();
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
  await page.locator('.tabbtn[data-tab="more"]').click();
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
  // Language switcher (i18n-switcher-v1): the LANGUAGE section on
  // More opens the drilled-in list. Only English ships, so the list
  // holds exactly one row — unshipped locales stay hidden.
  await check("language switcher", async () => {
    const sections = await page.locator("#screen-more .sec-label").allInnerTexts();
    assert.deepEqual(sections, ["ACCOUNT", "SETTINGS", "LANGUAGE", "ABOUT"]);
    await page.locator('#screen-more .hrow', { hasText: "Language" }).click();
    const rows = await page.locator("#screen-language .i18n-row").allInnerTexts();
    // Core 5 shipped as machine translations (owner ruling Nov 19, 2026):
    // every non-English row carries the machine-translation mark.
    assert.deepEqual(rows, [
      "English",
      "日本語\nJapanese · Machine translated",
      "한국어\nKorean · Machine translated",
      "简体中文\nSimplified Chinese · Machine translated",
      "繁體中文\nTraditional Chinese · Machine translated",
    ]);
    assert.equal(await page.locator("#screen-language .i18n-row.cur").count(), 1);
    assert.equal(await page.locator("#screen-language .i18n-check").count(), 1);
    const notes = await page.locator("#screen-language .i18n-note").allInnerTexts();
    assert.equal(notes.length, 3);
    assert.match(notes[0], /\/ja\//);
    assert.match(notes[1], /machine translated/i);
    assert.match(notes[2], /More languages are coming/);
    await capture(page, "language");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    return { sections, rows };
  }, page);
  await check("wrong-answer feedback and lesson resume", async () => {
    await enterFirstDrill(page);
    const before = await page.locator(".revctl .step").innerText();
    await page.locator(".dgrid > .cell").nth(0).click();
    assert.equal(await page.locator(".revctl .step").innerText(), before);
    assert.match(await page.locator(".drillpanel").innerText(), /dots/i);
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0);
    await capture(page, "wrong-answer");
    for (const index of [2,4,6,8,9]) await page.locator(".dgrid > .cell").nth(index).click();
    assert.match(await page.locator(".revctl .step").innerText(), /Step 4/);
    await leaveLesson(page);
    await page.locator('.tabbtn[data-tab="home"]').click();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('.tabbtn[data-tab="learn"]').click();
    await check("in-progress Learn accessibility", () => axe(page, "learn-in-progress"), page);
    assert.match(await page.locator('[data-module="tu1"]').innerText(), /In progress/);
    await page.locator('[data-module="tu1"]').click();
    assert.match(await page.locator(".revctl .step").innerText(), /Step 4/);
    return { wrongAnswerStayedAtStep: 3, restoredStep: 4 };
  }, page);
  await check("tile drill works by keyboard", async () => {
    // The resume above lands on the bamboo introduction (step 4);
    // one Continue reaches the bamboo drill (targets 2,4,6,8,9).
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.match(await page.locator(".revctl .step").innerText(), /Step 5/);
    const tile = page.locator(".dgrid > .cell").nth(2);
    const semantic = await tile.evaluate((e) => ({ tag: e.tagName, role: e.getAttribute("role"), tabIndex: e.tabIndex, name: e.getAttribute("aria-label") }));
    assert.ok(semantic.tag === "BUTTON" || semantic.role === "button", "drill tile needs button semantics");
    assert.ok(semantic.tabIndex >= 0, "drill tile must be focusable");
    assert.ok(semantic.name, "drill tile needs a readable name");
    await tile.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".dgrid > .cell.sel").count(), 1);
    for (const index of [4,6,8,9]) { await page.locator(".dgrid > .cell").nth(index).focus(); await page.keyboard.press("Space"); }
    assert.match(await page.locator(".revctl .step").innerText(), /Step 6/);
    return semantic;
  }, page);
  // Fresh navigation makes later checks independent of drill failure.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('.tabbtn[data-tab="more"]').click();
  await check("settings accessibility", () => axe(page, "settings"), page);
  await page.locator(".setrow").filter({ hasText: "Reduced motion" }).locator("input").check({ force: true });
  await page.locator(".setrow").filter({ hasText: "Large tiles" }).locator("input").check({ force: true });
  await capture(page, "settings");
  await page.locator('.tabbtn[data-tab="home"]').click();
  await page.getByRole("button", { name: "East only", exact: true }).click();
  await page.locator("#screen-home .play").click();
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
    await page.locator('.tabbtn[data-tab="learn"]').click();
    await page.goBack({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("#screen-home.active").count(), 1);
  }, page);
  await c.close();
  const motionContext = await context({ width: 390, height: 844 }, "no-preference");
  const motionPage = await open(motionContext);
  await check("in-app reduced motion suppresses hand-sheet animation without OS reduction", async () => {
    assert.equal(await motionPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), false);
    await motionPage.locator('.tabbtn[data-tab="more"]').click();
    await motionPage.getByRole("checkbox", { name: "Reduced motion", exact: true }).check({ force: true });
    await motionPage.locator('.tabbtn[data-tab="home"]').click();
    await motionPage.locator("#screen-home .play").click();
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
  if (learning) {
    for (const [width, height] of [[360,800],[390,844],[412,915],[768,1024],[1024,768],[1440,900]]) {
      const practiceContext = await context({ width, height });
      let practicePage;
      await check(`Practice viewport ${width}x${height}`, async () => {
        practicePage = await open(practiceContext);
        await enterPractice(practicePage);
        await chooseExercise(practicePage, "wait-reading", "wait-ryanmen");
        const unanswered = await learningGeometry(practicePage, ".practice-view");
        await capture(practicePage, `practice-question-${width}x${height}`);
        await selectPracticeTile(practicePage, "3m");
        await selectPracticeTile(practicePage, "6m");
        await practicePage.getByRole("button", { name: "Check answer", exact: true }).click();
        await practicePage.getByRole("heading", { name: "Correct", exact: true }).waitFor();
        const nextVisible = await practicePage.getByRole("button", { name: "Next exercise", exact: true }).evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const clip = element.closest(".learning-content").getBoundingClientRect();
          return bounds.top >= clip.top - 1 && bounds.bottom <= clip.bottom + 1;
        });
        assert.ok(nextVisible, "correct feedback must reveal the whole Next-exercise control above fixed navigation");
        const answered = await learningGeometry(practicePage, ".practice-view");
        await capture(practicePage, `practice-feedback-${width}x${height}`);
        await axe(practicePage, `practice-${width}x${height}`);
        report.learningViewports.push({ view: "practice", width, height, unanswered, answered });
        return { exerciseId: "wait-ryanmen", physicalControls: answered.controls.length };
      }, practicePage);
      await practiceContext.close();
    }
    const practiceContext = await context({ width: 390, height: 844 });
    const practicePage = await open(practiceContext);
    await check("Practice rejects a partial wait answer and resumes after reload", async () => {
      await enterPractice(practicePage);
      await chooseExercise(practicePage, "wait-reading", "wait-ryanmen");
      await selectPracticeTile(practicePage, "3m", true);
      await practicePage.getByRole("button", { name: "Check answer", exact: true }).click();
      await practicePage.getByRole("heading", { name: "Try again", exact: true }).waitFor();
      assert.equal(await practicePage.locator(".practice-view").getAttribute("data-exercise-id"), "wait-ryanmen");
      assert.equal(await practicePage.getByRole("button", { name: "Next exercise", exact: true }).count(), 0);
      await capture(practicePage, "practice-wrong-answer");
      await practicePage.reload({ waitUntil: "networkidle" });
      await enterPractice(practicePage);
      assert.equal(await practicePage.locator(".practice-view").getAttribute("data-exercise-id"), "wait-ryanmen");
      assert.equal(await practicePage.getByRole("button", { name: "Select 3m", exact: true }).getAttribute("aria-pressed"), "true");
      await selectPracticeTile(practicePage, "6m", true);
      await practicePage.getByRole("button", { name: "Check answer", exact: true }).click();
      await practicePage.getByRole("button", { name: "Next exercise", exact: true }).waitFor();
      const attempts = (await practiceAttempts(practicePage)).filter((attempt) => attempt.exerciseId === "wait-ryanmen");
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].correct, false);
      assert.equal(attempts[1].correct, true);
      assert.equal(attempts[1].attemptNumber, 2);
      assert.equal(attempts[1].assisted, true);
      await capture(practicePage, "practice-correct-retry");
      return { wrongStayed: true, selectedAnswerRestored: true, attempts };
    }, practicePage);
    await check("Practice separates independent success from explanation-assisted responses", async () => {
      await chooseExercise(practicePage, "shanten", "shanten-single-wait");
      await practicePage.getByRole("spinbutton", { name: "Your answer (shanten)", exact: true }).fill("0");
      await practicePage.getByRole("button", { name: "Check answer", exact: true }).click();
      await practicePage.getByRole("heading", { name: "Correct", exact: true }).waitFor();
      const independent = (await practiceAttempts(practicePage)).filter((attempt) => attempt.exerciseId === "shanten-single-wait").at(-1);
      assert.ok(independent?.correct && !independent.assisted && independent.attemptNumber === 1);
      await chooseExercise(practicePage, "tile-recognition", "recognize-terminals");
      await practicePage.locator(".practice-explanation > summary").click();
      for (const tile of ["1m", "1p", "1s", "9m", "9p", "9s"]) await selectPracticeTile(practicePage, tile);
      await practicePage.getByRole("button", { name: "Check answer", exact: true }).click();
      await practicePage.getByRole("heading", { name: "Correct", exact: true }).waitFor();
      const assisted = (await practiceAttempts(practicePage)).filter((attempt) => attempt.exerciseId === "recognize-terminals").at(-1);
      assert.ok(assisted?.correct && assisted.assisted && assisted.attemptNumber === 1);
      await practicePage.reload({ waitUntil: "networkidle" });
      await enterPractice(practicePage);
      assert.equal(await practicePage.locator(".practice-view").getAttribute("data-exercise-id"), "recognize-terminals");
      await practicePage.getByRole("button", { name: "Next exercise", exact: true }).waitFor();
      await practicePage.locator(".practice-evidence > summary").click();
      assert.match(await practicePage.locator(".practice-evidence").innerText(), /assisted/i);
      await capture(practicePage, "practice-evidence-restored");
      await practicePage.getByRole("button", { name: "Back", exact: true }).click();
      await practicePage.locator("#screen-learn.active").waitFor();
      await practicePage.goBack();
      await practicePage.locator(".practice-view").waitFor();
      assert.equal(await practicePage.locator(".practice-view").getAttribute("data-exercise-id"), "recognize-terminals");
      return { independent, assisted, completedExerciseRestored: true };
    }, practicePage);
    await practiceContext.close();
  }
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
    await offline.locator("#screen-home .play").click();
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
    let completedRecord = null;
    let firstVisibleHand = [];
    await check("complete guest East game and reopen history", async () => {
      if (learning) await completeIntroLesson(full);
      await full.getByRole("button", { name: "East only", exact: true }).click();
      await full.getByRole("checkbox", { name: "Guided mode", exact: true }).check({ force: true });
      await full.locator("#screen-home .play").click();
      await full.locator('.handrow .twrap[role="button"]').first().waitFor();
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
      await full.locator('.handrow .twrap[role="button"]').first().waitFor();
      await full.locator(".guidehint").waitFor({ state: "visible" });
      assert.ok((await full.locator(".guidehint").innerText()).trim().length > 0, "guided play must explain the first settled human decision");
      await capture(full, "guided-first-decision");
      // The guided-play package: the hand is grouped under
      // plain-words labels, and no board tile carries a corner
      // index (indices live on inspect surfaces only).
      assert.ok(await full.locator(".handrow .hseg-label").count() > 0, "guided play must group the hand under labels");
      assert.equal(await full.locator(".handrow .tindex").count(), 0, "board tiles never carry a corner index");
      await capture(full, "guided-grouping");
      firstVisibleHand = (await full.locator(".handrow .twrap > .tile").evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("aria-label")))).map(shortTileLabel).sort();
      assert.equal(firstVisibleHand.length, 14);
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
        const hand = full.locator('.handrow .twrap[role="button"]');
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
      await full.locator('.tabbtn[data-tab="games"]').click();
      assert.equal(await full.locator("#screen-games .hrow").count(), 1, "one fresh completed match must produce exactly one History record");
      assert.match(await full.locator("#screen-games .count").innerText(), /^1 recorded game — 1 East, 0 East \+ South$/);
      await full.locator(".hrow").first().click();
      await full.locator("#screen-details.active").waitFor();
      const storedScores=await full.evaluate(()=>JSON.parse(localStorage.getItem("openmahjong.records.v1"))[0].score);
      assert.ok((await full.locator("#screen-details").innerText()).includes(storedScores.toLocaleString("en-US")), "details retain the completed player's score");
      await capture(full, "history-record-details");
      await full.getByRole("button", { name: "Back to Games", exact: true }).click();
      await full.locator('.tabbtn[data-tab="games"]').click();
      const played = full.locator(".stat").filter({ hasText: "Games played" }).locator(".v");
      assert.equal(await played.innerText(), "1", "one match must contribute once to guest statistics");
      await capture(full, "single-match-stats");
      completedRecord = await full.evaluate(() => JSON.parse(localStorage.getItem("openmahjong.records.v1"))[0]);
      await writeFile(resolve(output, "completed-current-game.json"), JSON.stringify(completedRecord, null, 2));
      return { actions, prompts, seed, replayEnvelope, introLessonCompletedInSameSession: learning,
        guidedHintObserved: true, historyRecords: 1, statisticsGames: 1, result: "completed guided match, reopened identical standings, and counted one game in History/Stats" };
    }, full);
    if (learning) {
      await check("completed game Review preserves player perspective and bridges to relevant Practice", async () => {
        assert.ok(completedRecord, "the real match must complete before review can be tested");
        await full.locator('.tabbtn[data-tab="games"]').click();
        await full.locator(".hrow").first().click();
        await full.locator("#screen-details.active").waitFor();
        await full.locator(".detail-hand").first().click();
        await full.getByRole("button", { name: "Next decision", exact: true }).click();
        await full.locator('.review-shell[data-review-version="2"]').waitFor();
        assert.match(await full.locator(".perspective").innerText(), /Player perspective/);
        const original = (await full.locator(".review-shell .hand-card .hand > [role=img]").evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("aria-label")))).map(shortTileLabel).sort();
        assert.deepEqual(original, firstVisibleHand, "review must show the exact hand visible before the original first action");
        await full.locator(".review-public-table > summary").click();
        const scorelines = await full.locator(".review-public-table .review-scoreline").allTextContents();
        assert.equal(scorelines.length, 4);
        assert.ok(scorelines.every((line) => line.includes("25,000 points")), "first-decision context must retain original scores, not final outcomes");
        assert.equal(await full.locator(".review-public-table .review-discard").count(), 0, "the first decision must not include future discards");
        assert.equal(await full.locator(".review-public-table [role=img]").count(), 1, "only the initially public dora indicator is visible before any discard or meld");
        await capture(full, "review-public-first-position");
        await full.locator(".review-public-table > summary").click();
        const chosen = await reviewFacts(full, "chosen");
        const chosenId = String(completedRecord.log.decisions[0].tileId);
        const picker = full.getByRole("combobox", { name: "Compare another discard", exact: true });
        const originalAlternativeId = await picker.inputValue();
        const originalAlternative = await reviewFacts(full, "alternative");
        const alternativeOptions = await picker.locator("option").evaluateAll((options) => options.map((option) => ({ value: option.value, label: option.textContent })));
        assert.equal(new Set(alternativeOptions.map((option) => option.value)).size, 13, "all thirteen other physical discards must remain available at the first turn");
        assert.ok(alternativeOptions.every((option) => option.value !== chosenId), "an alternative must differ from the already displayed chosen tile");
        const other = alternativeOptions.find((option) => option.value !== originalAlternativeId);
        assert.ok(other);
        await picker.selectOption(other.value);
        assert.equal(await full.getByRole("combobox", { name: "Compare another discard", exact: true }).inputValue(), other.value);
        const alternative = await reviewFacts(full, "alternative");
        assert.ok(Number.isInteger(alternative.shanten) && Number.isInteger(alternative.unseenCopies));
        assert.deepEqual(await reviewFacts(full, "chosen"), chosen, "choosing an alternative must not change the recorded action's exact facts");
        await full.getByRole("combobox", { name: "Compare another discard", exact: true }).selectOption(originalAlternativeId);
        assert.deepEqual(await reviewFacts(full, "alternative"), originalAlternative, "returning to an alternative must preserve its original position facts");
        await full.getByRole("combobox", { name: "Compare another discard", exact: true }).selectOption(other.value);
        assert.match(await full.locator(".explanation").innerText(), /heuristics|heuristic/);
        assert.match(await full.locator(".explanation").innerText(), /not win probabilities/);
        assert.ok(await full.getByRole("button", { name: "Previous decision", exact: true }).isDisabled());
        await full.getByRole("button", { name: "Next decision", exact: true }).click();
        assert.match(await full.locator(".review-position-count").innerText(), /^2\s*\//);
        await full.getByRole("button", { name: "Previous decision", exact: true }).click();
        assert.match(await full.locator(".review-position-count").innerText(), /^1\s*\//);
        const hand = full.getByRole("combobox", { name: "Hand", exact: true });
        const hands = await hand.locator("option").evaluateAll((options) => options.map((option) => option.value));
        assert.ok(hands.length > 1, "the completed match must expose hand navigation");
        await hand.selectOption(hands.at(-1));
        assert.equal(await full.getByRole("combobox", { name: "Hand", exact: true }).inputValue(), hands.at(-1));
        await full.getByRole("combobox", { name: "Hand", exact: true }).selectOption(hands[0]);
        await full.getByRole("button", { name: "Next decision", exact: true }).click();
        assert.match(await full.locator(".review-position-count").innerText(), /^1\s*\//);
        await axe(full, "review");
        await capture(full, "review-alternative");
        await full.getByRole("button", { name: "Practice tile efficiency", exact: true }).click();
        await full.locator(".practice-view").waitFor();
        assert.equal(await full.getByRole("combobox", { name: "Practice category", exact: true }).inputValue(), "ukeire");
        const recommendedId = await full.locator(".practice-view").getAttribute("data-exercise-id");
        assert.equal(recommendedId, "ukeire-visible");
        await full.getByRole("button", { name: "Select 5m", exact: true }).click();
        await full.getByRole("button", { name: "Check answer", exact: true }).click();
        await full.getByRole("heading", { name: "Correct", exact: true }).waitFor();
        assert.equal(await full.locator(".saved-reviews").count(), 1, "the saved decision collection must survive exercise rerenders");
        await capture(full, "review-to-practice");
        await full.reload({ waitUntil: "networkidle" });
        await enterPractice(full);
        assert.equal(await full.locator(".practice-view").getAttribute("data-exercise-id"), recommendedId);
        await full.getByRole("button", { name: "Next exercise", exact: true }).waitFor();
        await full.getByRole("button", { name: "Return to review", exact: true }).click();
        await full.locator(".review-shell").waitFor();
        assert.match(await full.locator(".review-position-count").innerText(), /^1\s*\//);
        await full.getByRole("button", { name: "Game details", exact: true }).click();
        await full.getByRole("button", { name: "Back to Games", exact: true }).click();
        await full.locator('.tabbtn[data-tab="home"]').click();
        await full.locator("#screen-home").getByRole("button", { name: "Play", exact: true }).click();
        await full.locator('.handrow .twrap[role="button"]').first().waitFor();
        const newId = await full.evaluate(() => JSON.parse(localStorage.getItem("openmahjong.game.v1")).id);
        assert.notEqual(newId, completedRecord.id, "returning to play starts a new real game without replacing the reviewed result");
        await capture(full, "learning-loop-return-play");
        return { originalHandMatched: true, publicScores: scorelines, chosen, alternative, hands: hands.length,
          recommendedExercise: recommendedId, completedRelatedPractice: true, savedDecisionRestoredAfterReload: true, returnedToNewGame: true };
      }, full);
      if (completedRecord) {
        for (const [width, height] of [[360,800],[390,844],[412,915],[768,1024],[1024,768],[1440,900]]) {
          const reviewContext = await context({ width, height });
          await reviewContext.addInitScript((record) => {
            try { localStorage.setItem("openmahjong.records.v1", JSON.stringify([record])); } catch { /* about:blank has no origin */ }
          }, completedRecord);
          let reviewPage;
          await check(`Review viewport ${width}x${height}`, async () => {
            reviewPage = await open(reviewContext);
            await reviewPage.locator('.tabbtn[data-tab="games"]').click();
            await reviewPage.locator(".hrow").first().click();
            await reviewPage.locator(".detail-hand").first().click();
            await reviewPage.getByRole("button", { name: "Next decision", exact: true }).click();
            await reviewPage.locator(".review-shell").waitFor();
            const geometry = await learningGeometry(reviewPage, ".board-review");
            await axe(reviewPage, `review-${width}x${height}`);
            await capture(reviewPage, `review-${width}x${height}`);
            report.learningViewports.push({ view: "review", width, height, geometry });
            return { recordId: completedRecord.id, physicalControls: geometry.controls.length };
          }, reviewPage);
          await reviewContext.close();
        }
      }
    }
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

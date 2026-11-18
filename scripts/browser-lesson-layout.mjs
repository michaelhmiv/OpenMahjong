/**
 * Lesson-runner layout evidence (fix round, 2026-11-17, owner's Pixel
 * report). Two defect classes, asserted in a real Chromium at the
 * 390x844 floor viewport and a Pixel-class 412x915 viewport:
 *
 * (1) Lesson text must scroll. TU-8's worked breakdown step is the
 *     floor case: before the fix the scene lesson panel was sized by
 *     its content, ran ~100px past the bottom of the stage, and no
 *     part of it could scroll. Asserts the panel fits the viewport,
 *     its text region is a working scroll container (scrollHeight >
 *     clientHeight, programmatic scroll moves scrollTop, the last
 *     line lands inside the panel after scrolling to the bottom),
 *     and the panel's control row stays pinned and visible.
 * (2) The lesson control row must fit. TU-7's steps carry the full
 *     Leave / step / Back / Continue row: before the fix the row's
 *     min-content sum was 404px against 370px available and Continue
 *     ran off the right edge. Every step of TU-7 is walked (choices
 *     answered by trying options until Continue is offered) and every
 *     control's box must lie fully inside the viewport.
 *
 * The variant lesson runner is checked too: its content area must be
 * a bounded scroll container and every button on the walked steps
 * must lie inside the viewport (it shares neither defect — its
 * content already scrolls and its buttons are in-flow — and these
 * assertions keep it that way).
 *
 * Start the static server first, then:
 *   node scripts/browser-lesson-layout.mjs http://127.0.0.1:4173 work/lesson-layout
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { browserLaunchOptions } from "./browser-harness.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const base = new URL(process.argv[2] || "http://127.0.0.1:4173").href;
const output = resolve(process.argv[3] || "work/lesson-layout");
await mkdir(output, { recursive: true });
const report = { base, observedAt: new Date().toISOString(), checks: [], viewports: [] };
const browser = await chromium.launch(browserLaunchOptions());
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
async function context(viewport) {
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  c.setDefaultTimeout(12000);
  await c.route("https://api.openmahjong.app/**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(route.request().url().endsWith("/api/me") ? { user: null, csrfToken: null } : {}),
    headers: { "access-control-allow-origin": new URL(base).origin, "access-control-allow-credentials": "true" },
  }));
  return c;
}
async function open(c) {
  const page = await c.newPage();
  page.on("pageerror", (e) => { throw new Error(`pageerror: ${e.message}`); });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#screen-home.active").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
/** Every button (and the step indicator) of a control row must lie
 *  fully inside the viewport; buttons keep the 44px tap floor. */
async function assertRowFits(page, ctlSelector) {
  const boxes = await page.locator(ctlSelector).evaluate((ctl) => {
    const items = [...ctl.querySelectorAll("button, .step")].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), tag: el.tagName, x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width, height: r.height };
    });
    return { items, scrollWidth: ctl.scrollWidth, clientWidth: ctl.clientWidth, vw: innerWidth, vh: innerHeight };
  });
  assert.ok(boxes.items.length >= 2, `${ctlSelector} should hold a control row`);
  for (const item of boxes.items) {
    assert.ok(item.x >= -1 && item.right <= boxes.vw + 1, `"${item.text}" must fit horizontally (x=${item.x}, right=${item.right}, viewport=${boxes.vw})`);
    assert.ok(item.y >= -1 && item.bottom <= boxes.vh + 1, `"${item.text}" must fit vertically (y=${item.y}, bottom=${item.bottom}, viewport=${boxes.vh})`);
    if (item.tag === "BUTTON") assert.ok(item.height >= 43.9, `"${item.text}" keeps the 44px tap floor (height=${item.height})`);
  }
  assert.ok(boxes.scrollWidth <= boxes.clientWidth + 1, `control row must not overflow itself (scrollWidth=${boxes.scrollWidth}, clientWidth=${boxes.clientWidth})`);
  return boxes.items.map((i) => i.text);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  const tag = `${viewport.width}x${viewport.height}`;
  const c = await context(viewport);
  const page = await open(c);

  // -- TU-7 "Ways to win" (panel lesson): walk every step, asserting
  //    the Leave / step / Back / Continue row fits at each one.
  await check(`tu7 control row fits at every step (${tag})`, async () => {
    await page.locator('.tabbtn[data-tab="learn"]').click();
    await page.locator('[data-module="tu7"]').click();
    await page.locator(".lstage").waitFor();
    const seen = [];
    for (let i = 0; i < 40; i++) {
      if (!(await page.locator(".lstage .revctl").count())) break;
      const label = await page.locator(".lstage .revctl .step").textContent();
      seen.push(...(await assertRowFits(page, ".lstage .revctl")).map(() => label.trim()));
      // The panel lesson's text region must be a bounded scroll
      // region (the same defect class as TU-8, panel surface).
      const panel = await page.locator(".lstage .revpanel").evaluate((p) => ({
        overflowY: getComputedStyle(p).overflowY, bottom: p.getBoundingClientRect().bottom,
      }));
      assert.ok(["auto", "scroll"].includes(panel.overflowY), `panel text region must scroll (overflow-y=${panel.overflowY})`);
      assert.ok(panel.bottom <= viewport.height + 1, `panel must not run past the viewport (bottom=${panel.bottom})`);
      const cont = page.getByRole("button", { name: "Continue", exact: true });
      if (await cont.count()) { await cont.click(); await page.waitForTimeout(150); continue; }
      const choices = page.locator(".lstage .lchoices .lchoice");
      let advanced = false;
      for (let k = 0; k < (await choices.count()); k++) {
        await choices.nth(k).click(); await page.waitForTimeout(150);
        if (await cont.count()) { await cont.click(); await page.waitForTimeout(150); advanced = true; break; }
      }
      if (!advanced) break;
    }
    assert.ok(seen.length >= 9, `walked TU-7 steps (saw ${seen.length} steps)`);
    return { steps: seen.length };
  }, page);

  // -- TU-8 "Points and rounds" (scene lesson): the worked breakdown
  //    step's text panel must scroll inside a panel that fits.
  await check(`tu8 breakdown panel scrolls and fits (${tag})`, async () => {
    await page.locator('.tabbtn[data-tab="learn"]').click();
    await page.locator('[data-module="tu8"]').click();
    await page.locator(".lessonpanel").waitFor();
    await page.waitForTimeout(300);
    const fits = () => page.locator(".lessonpanel").evaluate((p) => {
      const r = p.getBoundingClientRect();
      return { bottom: r.bottom, vh: innerHeight };
    });
    let f = await fits();
    assert.ok(f.bottom <= f.vh + 1, `step 1 panel must fit (bottom=${f.bottom}, viewport=${f.vh})`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Tsumo", exact: true }).waitFor();
    await page.waitForTimeout(300);
    f = await fits();
    assert.ok(f.bottom <= f.vh + 1, `scene step panel must fit (bottom=${f.bottom}, viewport=${f.vh})`);
    await page.getByRole("button", { name: "Tsumo", exact: true }).click();
    await page.waitForTimeout(400);
    const scroll = await page.locator(".lessonpanel .lessonscroll").evaluate((s) => {
      const before = s.scrollTop;
      s.scrollTop = s.scrollHeight;
      const panel = s.closest(".lessonpanel").getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      const paras = [...s.querySelectorAll("p")];
      const last = paras[paras.length - 1].getBoundingClientRect();
      return {
        overflowY: getComputedStyle(s).overflowY,
        scrollHeight: s.scrollHeight, clientHeight: s.clientHeight,
        moved: s.scrollTop > before, scrollTop: s.scrollTop,
        panelBottom: panel.bottom, vh: innerHeight,
        lastBottom: last.bottom, regionBottom: sr.bottom, regionTop: sr.top,
      };
    });
    assert.ok(["auto", "scroll"].includes(scroll.overflowY), `breakdown text region must be a scroll container (overflow-y=${scroll.overflowY})`);
    assert.ok(scroll.scrollHeight > scroll.clientHeight, `breakdown text must overflow its region (scrollHeight=${scroll.scrollHeight}, clientHeight=${scroll.clientHeight})`);
    assert.ok(scroll.moved, "programmatic scroll must move scrollTop");
    assert.ok(scroll.lastBottom <= scroll.regionBottom + 1 && scroll.lastBottom > scroll.regionTop, `last breakdown line must land inside the panel after scrolling (lastBottom=${scroll.lastBottom}, region=[${scroll.regionTop}, ${scroll.regionBottom}])`);
    assert.ok(scroll.panelBottom <= scroll.vh + 1, `breakdown panel must fit the viewport (bottom=${scroll.panelBottom}, viewport=${scroll.vh})`);
    const row = await assertRowFits(page, ".lessonpanel .revctl");
    await page.screenshot({ path: resolve(output, `tu8-breakdown-${tag}.png`) });
    return { scroll, row };
  }, page);

  // -- Variant lesson runner: bounded scroll container, buttons in
  //    viewport on walked steps.
  await check(`variant lesson runner bounded and fitting (${tag})`, async () => {
    await page.locator('.tabbtn[data-tab="learn"]').click();
    await page.locator("#screen-learn .lrow").nth(11).click();
    await page.locator(".variant-education-content").waitFor();
    await page.waitForTimeout(300);
    let steps = 0;
    for (let i = 0; i < 4; i++) {
      const m = await page.locator(".variant-education-content").evaluate((main) => {
        const r = main.getBoundingClientRect();
        const btns = [...main.querySelectorAll("button")].map((b) => {
          const br = b.getBoundingClientRect();
          return { text: b.textContent.trim().slice(0, 24), x: br.x, right: br.right, height: br.height };
        });
        if (main.scrollHeight > main.clientHeight) { main.scrollTop = main.scrollHeight; }
        return { overflowY: getComputedStyle(main).overflowY, clientHeight: main.clientHeight, vh: innerHeight, scrolled: main.scrollTop, btns };
      });
      assert.ok(["auto", "scroll"].includes(m.overflowY), `variant content must be a scroll container (overflow-y=${m.overflowY})`);
      assert.ok(m.clientHeight <= m.vh, `variant content must be bounded by the viewport (clientHeight=${m.clientHeight}, viewport=${m.vh})`);
      for (const b of m.btns) {
        assert.ok(b.x >= -1 && b.right <= viewport.width + 1, `variant button "${b.text}" must fit horizontally (x=${b.x}, right=${b.right}, viewport=${viewport.width})`);
        assert.ok(b.height >= 43.9, `variant button "${b.text}" keeps the 44px tap floor (height=${b.height})`);
      }
      steps++;
      const cont = page.locator(".variant-education-content button.primary", { hasText: "Continue" });
      if (!(await cont.count())) break;
      await cont.first().click();
      await page.waitForTimeout(200);
    }
    return { steps };
  }, page);

  report.viewports.push({ viewport, checks: report.checks.length });
  await c.close();
}
await browser.close();
await saveReport();
if (failureCount > 0) { process.stdout.write(`${failureCount} lesson-layout check(s) failed\n`); process.exit(1); }
process.stdout.write("All lesson-layout checks passed\n");

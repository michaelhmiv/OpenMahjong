/**
 * Play cleanup v1 regression (audit B1/B2/B3, C1): the Play stack
 * at 390x844, fresh and in the game-in-progress state.
 *
 * B1 was the shipped defect: with the Continue card on screen the
 * gold Play button flex-squashed from 56px to 21px tall. This check
 * renders the in-progress state in a real browser and asserts the
 * Play button's full 56px height and the stack's one-column widths
 * (334px at the 390 stage), that the tile-back wall never renders,
 * and that the wordmark is not clipped at the top edge (B2).
 *
 * Start the built client's static server first, then:
 *   node scripts/browser-play-cleanup.mjs http://127.0.0.1:4173 work/play-cleanup
 * The account API is stubbed to a guest, as in browser-smoke.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-harness.mjs";

const base = new URL(process.argv[2] || "http://127.0.0.1:4173").href;
const output = resolve(process.argv[3] || "work/play-cleanup");
await mkdir(output, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const report = { base, observedAt: new Date().toISOString(), checks: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.route("https://api.openmahjong.app/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().endsWith("/api/me")
          ? { user: null, csrfToken: null }
          : {},
      ),
      headers: {
        "access-control-allow-origin": new URL(base).origin,
        "access-control-allow-credentials": "true",
      },
    }),
  );
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#screen-home.active").waitFor();
  await page.evaluate(() => document.fonts.ready);

  const measure = () =>
    page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        play: rect("#screen-home .play"),
        wordmark: rect("#screen-home .wordmark"),
        variantSeg: rect("#screen-home .play-variant-seg"),
        lengthSeg: rect("#screen-home .playbody > .seg:not(.play-mode-seg)"),
        guidedRow: rect("#screen-home .growrow"),
        modeSeg: rect("#screen-home .play-mode-seg"),
        calculator: rect("#screen-home .table-tools-entry"),
        continueCard: rect("#screen-home .contcard"),
        wall: document.querySelector("#screen-home .wall") !== null,
        recstrip: document.querySelector("#screen-home .recstrip") !== null,
      };
    });

  const expectColumn = (m, state) => {
    for (const key of ["play", "variantSeg", "lengthSeg", "guidedRow", "modeSeg", "calculator"]) {
      assert.ok(m[key], `${state}: ${key} missing`);
      assert.ok(
        Math.abs(m[key].width - 334) <= 1,
        `${state}: ${key} width ${m[key].width} != 334 (one-column stack)`,
      );
    }
    assert.equal(m.wall, false, `${state}: tile-back wall must not render`);
    assert.equal(m.recstrip, false, `${state}: record strip must not render at 0 games`);
    assert.ok(
      Math.abs(m.play.height - 56) <= 0.6,
      `${state}: Play height ${m.play.height} != 56`,
    );
  };

  // Fresh state.
  const fresh = await measure();
  expectColumn(fresh, "fresh");
  report.checks.push({ name: "fresh stack: one column, Play 56px, no wall", evidence: fresh });
  await page.screenshot({ path: resolve(output, "play-fresh-390.png") });

  // Enter a game, then return to Play: the game-in-progress state
  // (the Continue card is what used to squash the Play button).
  await page.locator("#screen-home .play").click();
  await page.locator("#screen-table.active").waitFor();
  await page.evaluate(() =>
    document.querySelector('.tabbtn[data-tab="home"]')?.click(),
  );
  await page.locator("#screen-home.active").waitFor();
  await page.locator("#screen-home .contcard").waitFor();
  await page.evaluate(() => document.fonts.ready);

  const inProgress = await measure();
  assert.ok(inProgress.continueCard, "in-progress: Continue card missing");
  expectColumn(inProgress, "in-progress");
  // B1, stated plainly: the primary button keeps its full height
  // with the Continue card on screen.
  assert.ok(
    Math.abs(inProgress.play.height - 56) <= 0.6,
    `B1 regression: Play button height ${inProgress.play.height} != 56 at 390x844 in-progress`,
  );
  // B2: the wordmark sits clear of the top edge, unclipped.
  assert.ok(inProgress.wordmark.y >= -0.5, `B2: wordmark clipped at y=${inProgress.wordmark.y}`);
  report.checks.push({ name: "in-progress stack: Play 56px (B1), wordmark clear (B2)", evidence: inProgress });
  await page.screenshot({ path: resolve(output, "play-inprogress-390.png") });

  process.stdout.write("PASS play-cleanup: Play holds 56px in fresh and in-progress states at 390x844\n");
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

import { browserLaunchOptions } from "./browser-harness.mjs";
/** Current review, frozen legacy display, active-game isolation and long
 * timeline measurements in Chromium. Timings describe this desktop runner. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Game, VariantGame } from "@openmahjong/engine";
import { createAiPolicy } from "@openmahjong/ai";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = resolve(process.argv[3] ?? "work/review-timeline");
mkdirSync(out, { recursive: true });
function recordGame(variant) {
  const id = randomUUID(),
    seed = `review-performance-${variant}`,
    decisions = [],
    ai =
      variant === "riichi"
        ? createAiPolicy()
        : {
            turn: (v, c) => ({
              type: "discard",
              tileId: c.drawnTile?.id ?? v.hand[0].id,
            }),
            call: () => ({ type: "pass" }),
          },
    policy = {
      turn(v, c) {
        const a = ai.turn(v, c);
        decisions.push(a);
        return a;
      },
      call(v, c) {
        const a = ai.call(v, c);
        decisions.push(a);
        return a;
      },
    };
  const game =
      variant === "riichi"
        ? new Game({ seed, length: "east", policies: policy })
        : new VariantGame({
            variant,
            seed,
            length: "full",
            policies: [policy, policy, policy, policy],
          }),
    result = game.run(),
    log =
      variant === "riichi"
        ? {
            v: 2,
            engineVersion: 2,
            aiVersion: 2,
            ruleset: { id: "openmahjong-riichi", version: 1 },
            seed,
            length: "east",
            humanSeat: 0,
            id,
            decisions,
          }
        : {
            v: 3,
            engineVersion: 3,
            aiVersion: 1,
            variant,
            ruleset: { id: game.adapter.profileId, version: 1 },
            seed,
            length: "full",
            humanSeat: 0,
            id,
            decisions,
          };
  return {
    record: {
      id,
      ...(variant === "riichi" ? {} : { variant }),
      length: log.length,
      placement: result.settlement.find((s) => s.seat === 0).rank,
      score: result.scores[0],
      finishedAt: "2026-11-17T00:00:00Z",
      log,
      stats: {
        hands: result.events.filter((e) => e.type === "hand-start").length,
        riichi: 0,
        dealIns: 0,
        handsWon: 0,
        winPoints: 0,
      },
    },
    events: result.events.length,
  };
}
const current = recordGame("riichi"),
  long = recordGame("mcr"),
  legacy = JSON.parse(
    readFileSync("packages/web/test/fixtures/legacy-v1.json", "utf8"),
  ).saved,
  legacyRecord = { ...current.record, id: legacy.id, log: legacy };
const browser = await chromium.launch(browserLaunchOptions()),
  report = [];
try {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    await ctx.route("https://api.openmahjong.app/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": new URL(base).origin,
          "access-control-allow-credentials": "true",
        },
        body: '{"user":null,"csrfToken":null}',
      }),
    );
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(
      (records) => {
        localStorage.setItem("openmahjong.records.v1", JSON.stringify(records));
        localStorage.setItem(
          "openmahjong.settings.v1",
          JSON.stringify({
            sound: false,
            motion: "reduced",
            largeTiles: false,
            guided: false,
            lastLength: "east",
          }),
        );
      },
      [current.record],
    );
    await page.reload();
    await page.locator("[data-tab=games]").click();
    await page.locator("#screen-games .hrow").last().click();
    await page.screenshot({ path: resolve(out, `details-${width}.png`) });
    await page.locator(".detail-hand").first().click();
    await page
      .getByRole("button", { name: "Next decision", exact: true })
      .click();
    await page.screenshot({ path: resolve(out, `board-${width}.png`) });
    await page.locator(".review-position-count").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `comparison-${width}.png`) });
    let axe = await new AxeBuilder({ page })
      .include("#screen-review")
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => v.id),
      [],
    );
    assert.ok(await page.getByLabel("Concealed tile", { exact: true }).count());
    // The first current decision and its saved reference survive related practice.
    const before = await page.locator(".review-position-count").innerText();
    await page
      .getByRole("button", { name: "Practice tile efficiency", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Return to review", exact: true })
      .click();
    assert.equal(
      await page.locator(".review-position-count").innerText(),
      before,
    );
    // Historical review must preserve the active CPU runner and persisted bytes.
    await page
      .getByRole("button", { name: "Game details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back to Games", exact: true })
      .click();
    await page.locator("[data-tab=home]").click();
    await page
      .locator("#screen-home")
      .getByRole("button", { name: "Play", exact: true })
      .click();
    await page.locator(".handrow").waitFor();
    const active = await page.evaluate(() =>
      localStorage.getItem("openmahjong.game.v1"),
    );
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Quit to home", exact: true })
      .click();
    await page.locator("[data-tab=games]").click();
    await page
      .locator("#screen-games .hrow:not(.in-progress-row)")
      .last()
      .click();
    await page.locator(".detail-hand").first().click();
    await page.locator('[aria-label="Hand timeline"]').evaluate((r) => {
      r.value = String(Number(r.min) + 10);
      r.dispatchEvent(new Event("input"));
    });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("openmahjong.game.v1")),
      active,
    );
    // A 16-hand, no-winner MCR record provides thousands of indexed events.
    await page.goto(base);
    await page.evaluate(
      (r) =>
        localStorage.setItem("openmahjong.records.v1", JSON.stringify([r])),
      long.record,
    );
    await page.reload();
    await page.locator("[data-tab=games]").click();
    await page.getByLabel("Games variant", { exact: true }).selectOption("mcr");
    const opened = performance.now();
    await page.locator("#screen-games .hrow").last().click();
    await page.locator(".detail-hand").first().click();
    const openMs = performance.now() - opened;
    const samples = await page.evaluate(async () => {
      const range = document.querySelector('[aria-label="Hand timeline"]'),
        hands = document.querySelector('select[aria-label="Hand"]'),
        dom = [],
        paint = [];
      for (let n = 0; n < 100; n++) {
        hands.value = String(n % hands.options.length);
        hands.dispatchEvent(new Event("change"));
        range.value = String(
          Number(range.min) +
            ((n * 17) % (Number(range.max) - Number(range.min) + 1)),
        );
        const start = performance.now();
        range.dispatchEvent(new Event("input"));
        dom.push(performance.now() - start);
        if (n < 40) {
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          paint.push(performance.now() - start);
        }
      }
      return {
        dom: dom.sort((a, b) => a - b),
        paint: paint.sort((a, b) => a - b),
        heap: performance.memory?.usedJSHeapSize ?? null,
      };
    });
    await page.screenshot({ path: resolve(out, `long-timeline-${width}.png`) });
    axe = await new AxeBuilder({ page }).include("#screen-review").analyze();
    assert.deepEqual(
      axe.violations.map((v) => v.id),
      [],
    );
    await page.goto(base);
    await page.evaluate(
      (r) =>
        localStorage.setItem("openmahjong.records.v1", JSON.stringify([r])),
      legacyRecord,
    );
    await page.reload();
    await page.locator("[data-tab=games]").click();
    await page.locator("#screen-games .hrow").last().click();
    await page.locator(".detail-hand").first().click();
    await page
      .getByRole("button", { name: "Next decision", exact: true })
      .click();
    assert.ok(
      await page.getByText(/Historical replay · engine version 1/).count(),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Practice this concept", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: resolve(out, `legacy-display-only-${width}.png`),
    });
    assert.deepEqual(errors, []);
    report.push({
      width,
      browser: await browser.version(),
      scope: "Desktop Linux Chromium; mobile viewport, not mobile hardware",
      longRecord: {
        seed: long.record.log.seed,
        hands: 16,
        events: long.events,
        decisions: long.record.log.decisions.length,
        openMs,
      },
      seek: {
        domP50: samples.dom[50],
        domP95: samples.dom[95],
        doubleFrameP50: samples.paint[20],
        doubleFrameP95: samples.paint[38],
        heap: samples.heap,
      },
      activeGamePreserved: true,
      practiceReturnedToSameDecision: true,
      legacyDisplayOnly: true,
      axe: [],
      errors,
    });
    console.log(`PASS review ${width}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
}

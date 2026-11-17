import { browserLaunchOptions } from "./browser-harness.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  root = process.argv[3] ?? "work/variant-evidence";
for (const variant of [process.argv[4] ?? "hong-kong"]) {
  const name = {
      "hong-kong": "Hong Kong Old Style",
      mcr: "MCR",
      taiwanese: "Taiwanese",
    }[variant],
    out = `${root}/${variant}`;
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(browserLaunchOptions());
  const reports = [];
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
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("openmahjong.settings.v1"))
        localStorage.setItem(
          "openmahjong.settings.v1",
          JSON.stringify({
            sound: false,
            motion: "reduced",
            largeTiles: false,
            guided: true,
            lastLength: "east",
          }),
        );
    });
    await page.goto(base);
    await page
      .getByLabel("Play variant", { exact: true })
      .selectOption(variant);
    await page.getByRole("button", { name: "East", exact: true }).click();
    await page.screenshot({ path: `${out}/play-${width}.png` });
    await page
      .locator("#screen-home")
      .getByRole("button", { name: "Play", exact: true })
      .click();
    await page.locator(".variant-hand-tile").first().waitFor();
    await page.screenshot({ path: `${out}/table-${width}.png` });
    await page
      .getByRole("button", { name: "Why this move?", exact: true })
      .click();
    await page.screenshot({ path: `${out}/coach-${width}.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Focus hand", exact: true }).click();
    await page.screenshot({ path: `${out}/focus-${width}.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const axe = await new AxeBuilder({ page })
      .include("#screen-variant-table")
      .analyze();
    let breakdown = false,
      steps = 0;
    for (; steps < 1600; steps++) {
      const finish = page.getByRole("button", {
        name: "Game details and review",
        exact: true,
      });
      if (await finish.count()) {
        await page.screenshot({ path: `${out}/standings-${width}.png` });
        await finish.click();
        break;
      }
      const next = page.getByRole("button", {
        name: /^(Next hand|Final standings)$/,
      });
      if (await next.count()) {
        if (!breakdown) {
          await page.screenshot({ path: `${out}/hand-payments-${width}.png` });
          breakdown = true;
        }
        await next.click();
        continue;
      }
      const win = page.getByRole("button", { name: /^Win (by|on)/ });
      if (await win.count()) {
        await win.first().click();
        continue;
      }
      const pass = page.getByRole("button", { name: "Pass", exact: true });
      if (await pass.count()) {
        await pass.click();
        continue;
      }
      const tile = page.locator(".variant-hand-tile:not(:disabled)").first();
      if (await tile.count()) {
        await tile.click();
        await page.getByRole("button", { name: /^Discard / }).click();
        continue;
      }
      throw new Error(
        `No action ${steps}: ${await page.locator("body").innerText()}`,
      );
    }
    if (steps >= 1600) throw new Error("Game did not finish");
    await page
      .getByRole("heading", { name: "Game details", exact: true })
      .waitFor();
    await page.screenshot({ path: `${out}/details-${width}.png` });
    await page.locator(".detail-hand").first().click();
    await page.screenshot({ path: `${out}/review-${width}.png` });
    const decision = page.getByRole("button", {
      name: "Next decision",
      exact: true,
    });
    if (await decision.isEnabled()) await decision.click();
    const practice = page.getByRole("button", {
      name: "Practice this concept",
      exact: true,
    });
    if (await practice.count()) {
      const before = await page.locator(".review-position-count").innerText();
      await practice.click();
      await page
        .getByRole("combobox", { name: "Practice exercise", exact: true })
        .waitFor();
      await page.screenshot({ path: `${out}/practice-${width}.png` });
      await page.getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(
        await page.locator(".review-position-count").innerText(),
        before,
      );
    }
    await page
      .getByRole("button", { name: "Game details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back to Games", exact: true })
      .click();
    await page
      .getByLabel("Games variant", { exact: true })
      .selectOption(variant);
    assert.equal(
      await page
        .locator("#screen-games .stat")
        .filter({ hasText: "Games played" })
        .locator(".v")
        .innerText(),
      "1",
    );
    assert.equal(
      await page
        .locator("#screen-games")
        .getByText("Riichi rate", { exact: true })
        .count(),
      0,
    );
    await page.screenshot({ path: `${out}/history-${width}.png` });
    await page.goto(base);
    await page.getByRole("button", { name: "Learn", exact: true }).click();
    const section = page
      .locator(".learnsec")
      .filter({ has: page.locator(".secttl", { hasText: name }) });
    if ((await section.locator(".sechead").getAttribute("aria-expanded")) !== "true")
      await section.locator(".sechead").click();
    await page.screenshot({ path: `${out}/learn-${width}.png` });
    await section.getByRole("button", { name: `Practice ${name}` }).click();
    await page.screenshot({ path: `${out}/lesson-${width}.png` });
    assert.deepEqual(errors, []);
    assert.deepEqual(axe.violations, []);
    console.log(`PASS ${variant} ${width}: ${steps} UI actions`);
    reports.push({
      width,
      steps,
      errors,
      axe: axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    await ctx.close();
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  await browser.close();
}

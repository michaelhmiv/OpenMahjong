import { browserLaunchOptions } from "./browser-harness.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = process.argv[3] ?? "work/in-person-evidence";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserLaunchOptions());
const report = [];
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await ctx.route("https://api.openmahjong.app/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": new URL(base).origin,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({ user: null, csrfToken: null }),
    }),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", {
      name: "In-person calculator and scorekeeper",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "New table session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start scorekeeper", exact: true })
    .click();
  // Compact flow: tap the winner's seat, name the discarder, then
  // score the hand from its tiles.
  await page
    .getByRole("button", { name: /Player 1 · .* points/ })
    .click();
  await page
    .getByRole("button", { name: "On a discard", exact: true })
    .click();
  await page.locator(".cx-seatchip", { hasText: "Player 2" }).click();
  await page
    .getByRole("button", { name: "Score it from the tiles", exact: true })
    .click();
  await page.screenshot({ path: `${out}/tile-entry-${viewport.width}.png` });
  for (const t of [
    "1m",
    "1m",
    "2m",
    "2m",
    "3p",
    "3p",
    "4p",
    "4p",
    "5s",
    "5s",
    "6s",
    "6s",
    "Rd",
    "Rd",
  ])
    await page.getByRole("button", { name: `Add ${t}`, exact: true }).click();
  await page.getByLabel("Winning tile", { exact: true }).selectOption("33");
  await page
    .getByRole("button", { name: "Show payments", exact: true })
    .click();
  await page.locator(".calculator-output").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/tile-payments-${viewport.width}.png` });
  // The Check payments screen is the confirmation step (no checkbox).
  await page
    .getByRole("button", { name: "Confirm and add to table", exact: true })
    .click();
  // Fast entry: same seat-first flow, value by stepper quick chips.
  await page
    .getByRole("button", { name: /Player 1 · .* points/ })
    .click();
  await page
    .getByRole("button", { name: "On a discard", exact: true })
    .click();
  await page.locator(".cx-seatchip", { hasText: "Player 2" }).click();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "40", exact: true }).click();
  await page.screenshot({ path: `${out}/fast-entry-${viewport.width}.png` });
  await page
    .getByRole("button", { name: "Show payments", exact: true })
    .click();
  await page.locator(".calculator-output").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/fast-payments-${viewport.width}.png` });
  await page
    .getByRole("button", { name: "Confirm and add to table", exact: true })
    .click();
  await page.screenshot({ path: `${out}/scorekeeper-${viewport.width}.png` });
  const axe = await new AxeBuilder({ page })
    .include("#screen-tables")
    .analyze();
  await page
    .getByRole("button", { name: "Correct this entry", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Correct the breakdown", exact: true })
    .click();
  await page.getByLabel("Entered han · Original 3", { exact: true }).fill("4");
  await page
    .getByLabel("Reason for manual correction", { exact: true })
    .fill("Corrected by the table");
  await page
    .getByRole("button", {
      name: "Apply corrections and recalculate",
      exact: true,
    })
    .click();
  await page.locator(".calculator-output").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/correction-${viewport.width}.png` });
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Undo last entry", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Settlement",
      exact: true,
    })
    .click();
  await page.screenshot({ path: `${out}/settlement-${viewport.width}.png` });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await ctx.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", {
      name: "In-person calculator and scorekeeper",
      exact: true,
    })
    .click();
  await page.locator(".tool-session").first().click();
  await page.screenshot({
    path: `${out}/offline-reload-${viewport.width}.png`,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(axe.violations, []);
  // Undo last entry removed the corrected fast entry entirely; only the
  // tile-entered hand remains in the ledger.
  assert.equal(await page.locator(".ledger-row").count(), 1);
  report.push({
    viewport,
    errors,
    axe: axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    offlineLedgerRows: await page.locator(".ledger-row").count(),
  });
  await ctx.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();

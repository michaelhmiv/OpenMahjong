import { browserLaunchOptions } from "./browser-harness.mjs";
/** Built application, real UI, synthetic tables. No accounts or live API. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = resolve(process.argv[3] ?? "work/calculator-evidence");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserLaunchOptions()),
  report = [];
try {
  for (const width of [390, 1440])
    for (const variant of ["hong-kong", "mcr", "taiwanese", "american"]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      await ctx.route("https://api.openmahjong.app/**", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"user":null,"csrfToken":null}',
          headers: {
            "access-control-allow-origin": new URL(base).origin,
            "access-control-allow-credentials": "true",
          },
        }),
      );
      const page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(12000);
      const click = (name) =>
        page.getByRole("button", { name, exact: true }).click();
      const snap = async (name) => {
        await page.screenshot({
          path: resolve(out, `${variant}-${name}-${width}.png`),
        });
      };
      await page.goto(base);
      await click("In-person calculator and scorekeeper");
      await click("New table session");
      const preset = {
        "hong-kong": "hong-kong-clear@1",
        mcr: "mcr-2006@1",
        taiwanese: "taiwanese-every-flower@1",
        american: "american-payments@1",
      }[variant];
      await page
        .getByLabel("Named preset", { exact: true })
        .selectOption(preset);
      await click("Start scorekeeper");
      if (variant !== "american") {
        await snap("tiles");
        const values =
          variant === "mcr"
            ? [
                "1m",
                "1m",
                "2m",
                "2m",
                "3m",
                "3m",
                "4m",
                "4m",
                "5m",
                "5m",
                "6m",
                "6m",
                "7m",
                "7m",
              ]
            : [
                "1m",
                "2m",
                "3m",
                "4m",
                "5m",
                "6m",
                "1p",
                "2p",
                "3p",
                "7s",
                "8s",
                "9s",
                "E",
                "E",
                ...(variant === "taiwanese" ? ["E", "Wh", "Wh"] : []),
              ];
        for (const t of values) await click(`Add ${t}`);
        await page
          .getByLabel("Winning tile", { exact: true })
          .selectOption(
            variant === "mcr" ? "6" : variant === "taiwanese" ? "31" : "27",
          );
        if (variant === "hong-kong")
          await page
            .getByLabel("Win type", { exact: true })
            .selectOption("tsumo");
        await click("Calculate payments");
        await page.locator(".calculator-output").scrollIntoViewIfNeeded();
        await snap("tile-payments");
        assert.ok(await page.getByText("Who pays", { exact: true }).count());
        await page
          .getByLabel("I confirm the payment breakdown", { exact: true })
          .check();
        await click("Confirm and add to table");
        await click("Calculate a hand");
      }
      if (variant === "american") {
        await page.getByLabel("Printed value", { exact: true }).fill("25");
        await page.getByLabel("Jokerless at the win", { exact: true }).check();
        await snap("entered-value");
      } else {
        await click(
          variant === "taiwanese" ? "Fast tai entry" : "Fast fan entry",
        );
        await page
          .getByLabel(
            variant === "taiwanese"
              ? "Tai excluding dealer bonus"
              : variant === "mcr"
                ? "Fan excluding flowers"
                : "Fan · Scoring units",
            { exact: true },
          )
          .fill(variant === "mcr" ? "8" : "3");
        if (variant === "taiwanese") {
          // Dealer repeats are derived from the ledger (the tile hand
          // above was a dealer win, so the counter already reads 1).
          await page.getByLabel("Winner", { exact: true }).selectOption("1");
          await page
            .getByLabel("Win type", { exact: true })
            .selectOption("tsumo");
        }
        if (variant === "mcr")
          await page
            .getByLabel("Number of flowers (0–8)", { exact: true })
            .fill("2");
        await snap("fast");
      }
      await click("Calculate payments");
      await page.locator(".calculator-output").scrollIntoViewIfNeeded();
      await snap("fast-payments");
      const axe = await new AxeBuilder({ page })
        .include("#screen-tables")
        .analyze();
      assert.deepEqual(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      await page
        .getByLabel("I confirm the payment breakdown", { exact: true })
        .check();
      await click("Confirm and add to table");
      await snap("ledger");
      await page
        .getByRole("button", { name: "Correct this entry", exact: true })
        .last()
        .click();
      const fact =
        variant === "american"
          ? "Value entered from your physical card · Original 25"
          : variant === "taiwanese"
            ? "Entered tai excluding dealer bonus · Original 3"
            : variant === "mcr"
              ? "Entered fan excluding flowers · Original 8"
              : "Entered fan · Original 3";
      await page
        .getByLabel(fact, { exact: true })
        .fill(variant === "american" ? "30" : variant === "mcr" ? "9" : "4");
      await page
        .getByLabel(
          variant === "american"
            ? "Reason for manual correction"
            : "Reason for correction",
          { exact: true },
        )
        .fill("Corrected by the table");
      await click(
        variant === "american"
          ? "Apply corrections and recalculate"
          : "Apply corrections and recalculate",
      );
      await page.locator(".calculator-output").scrollIntoViewIfNeeded();
      await snap("correction");
      await page
        .getByLabel("I confirm the payment breakdown", { exact: true })
        .check();
      await click("Confirm correction");
      await click("Undo last entry");
      await click("Final standings and settlement");
      await snap("settlement");
      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.clearBrowserCache");
      await ctx.setOffline(true);
      await page.reload();
      await click("In-person calculator and scorekeeper");
      await page.locator(".tool-session").first().click();
      // Undo last entry removed the corrected entry entirely: the
      // American ledger is empty again, the variant ledgers keep only
      // their tile-entered hand.
      assert.equal(
        await page.locator(".ledger-row").count(),
        variant === "american" ? 0 : 1,
      );
      await snap("offline");
      assert.deepEqual(errors, []);
      report.push({
        variant,
        width,
        axe: [],
        errors,
        offlineRows: await page.locator(".ledger-row").count(),
      });
      console.log(`PASS ${variant} calculator ${width}`);
      await ctx.close();
    }
} finally {
  await browser.close();
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify({ observedAt: new Date().toISOString(), report }, null, 2),
  );
}

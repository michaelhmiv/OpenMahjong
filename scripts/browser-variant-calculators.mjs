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
      // Compact flow: the win context is chosen on the scorekeeper —
      // tap the winner's seat, pick the win type, name the discarder.
      const seat = (n) =>
        page
          .getByRole("button", {
            name: new RegExp(`Player ${n} · .* points`),
          })
          .click();
      const discarder = (n) =>
        page.locator(".cx-seatchip", { hasText: `Player ${n}` }).click();
      const clickTimes = async (name, times) => {
        for (let i = 0; i < times; i++) await click(name);
      };
      if (variant !== "american") {
        await seat(1);
        if (variant === "hong-kong") await click("Self-draw");
        else {
          await click("On a discard");
          await discarder(2);
        }
        await click("Score it from the tiles");
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
        await click("Show payments");
        await page.locator(".calculator-output").scrollIntoViewIfNeeded();
        await snap("tile-payments");
        assert.ok(await page.locator(".cx-payline").count());
        // The Check payments screen is the confirmation step.
        await click("Confirm and add to table");
      }
      if (variant === "american") {
        await seat(1);
        await click("On a discard");
        await discarder(2);
        await page.getByLabel("Printed value", { exact: true }).fill("25");
        await page.getByLabel("Jokerless at the win", { exact: true }).check();
        await snap("entered-value");
      } else {
        // Fast entry: a fresh seat tap per hand; values by stepper.
        await seat(variant === "taiwanese" ? 2 : 1);
        if (variant === "taiwanese") {
          // A non-dealer self-draw. Dealer repeats are derived from
          // the ledger (the tile hand above was a dealer win, so the
          // counter already reads 1).
          await click("Self-draw");
          await clickTimes("Increase Tai excluding dealer bonus", 3);
        } else {
          await click("On a discard");
          await discarder(2);
          if (variant === "mcr")
            // Fan starts at the 8 minimum; add two flowers.
            await clickTimes("Increase Flowers", 2);
          else await click("3");
        }
        await snap("fast");
      }
      await click("Show payments");
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
      await click("Confirm and add to table");
      await snap("ledger");
      await page
        .getByRole("button", { name: "Correct this entry", exact: true })
        .last()
        .click();
      await click("Correct the breakdown");
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
      await click("Confirm correction");
      await click("Undo last entry");
      await click("Settlement");
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

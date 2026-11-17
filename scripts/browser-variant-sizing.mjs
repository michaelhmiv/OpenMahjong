import { browserLaunchOptions } from "./browser-harness.mjs";
/** Deterministic late-hand geometry, legal controls, resume and offline use.
 * Requires npm run build:libs and a built client served at the supplied URL. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VariantGame } from "@openmahjong/engine";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = resolve(process.argv[3] ?? "work/variant-sizing");
mkdirSync(out, { recursive: true });
function records(variant) {
  const seed = `browser-late-${variant}`,
    game = new VariantGame({ variant, seed, length: "east" }),
    it = game.play(),
    decisions = [];
  let step = it.next(),
    late,
    call;
  while (
    !step.done &&
    game.events.filter((e) => e.type === "hand-start").length === 1
  ) {
    const req = step.value;
    if (req.view.seat === 0) {
      const record = {
        v: 3,
        engineVersion: 3,
        aiVersion: 1,
        variant,
        ruleset: { id: game.adapter.profileId, version: 1 },
        seed,
        length: "east",
        humanSeat: 0,
        id: randomUUID(),
        decisions: [...decisions],
      };
      if (req.kind === "turn") late = record;
      else if (!call && req.context.phase === "call") call = record;
    }
    const action =
      step.value.kind === "turn"
        ? {
            type: "discard",
            tileId:
              step.value.context.drawnTile?.id ??
              step.value.view.legalDiscardIds[0],
          }
        : { type: "pass" };
    decisions.push(action);
    step = it.next(action);
  }
  assert.ok(late);
  assert.ok(call);
  return { late, call };
}
const fixtures = Object.fromEntries(
    ["hong-kong", "mcr", "taiwanese"].map((v) => [v, records(v)]),
  ),
  browser = await chromium.launch(browserLaunchOptions()),
  reports = [];
try {
  for (const width of [360, 390, 1440])
    for (const variant of ["hong-kong", "mcr", "taiwanese"]) {
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
      await page.evaluate((saved) => {
        localStorage.setItem("openmahjong.game.v1", JSON.stringify(saved));
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
      }, fixtures[variant].late);
      await page.reload();
      await page
        .getByRole("button", { name: "Resume game", exact: true })
        .click();
      await page.locator(".variant-hand-tile").first().waitFor();
      const cells = await page
        .locator(".sp:has(>.cell:nth-child(13))>.cell")
        .first()
        .evaluate((el) => ({
          width: getComputedStyle(el).width,
          height: getComputedStyle(el).height,
        }));
      assert.deepEqual(cells, { width: "31px", height: "22px" });
      await page.screenshot({
        path: resolve(out, `${variant}-late-${width}.png`),
      });
      await page
        .getByRole("button", { name: "Table settings", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Large tiles · Off", exact: true })
        .click();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(
        await page.locator(".variant-table.variant-large").count(),
        1,
      );
      const faces = await page
        .locator(".variant-hand-tile .tile")
        .first()
        .evaluate((el) => ({
          width: getComputedStyle(el).width,
          height: getComputedStyle(el).height,
        }));
      assert.deepEqual(faces, { width: "28px", height: "39px" });
      await page.screenshot({
        path: resolve(out, `${variant}-large-${width}.png`),
      });
      await page
        .getByRole("button", { name: "Focus hand", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Your hand",
        exact: true,
      });
      assert.equal(
        await dialog.locator(".tile-choice").count(),
        variant === "taiwanese" ? 17 : 14,
      );
      await page.screenshot({
        path: resolve(out, `${variant}-focus-${width}.png`),
      });
      await dialog.locator(".tile-choice:not(:disabled)").first().focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator(".variant-hand-tile[aria-pressed=true]").count(),
        1,
      );
      const selected = await page
        .locator(".variant-selection-preview .tile")
        .count();
      assert.equal(selected, 1);
      const axe = await new AxeBuilder({ page })
        .include("#screen-variant-table")
        .analyze();
      assert.deepEqual(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.clearBrowserCache");
      await ctx.setOffline(true);
      await page.reload();
      await page
        .getByRole("button", { name: "Resume game", exact: true })
        .click();
      assert.equal(
        await page.locator(".variant-hand-tile").count(),
        variant === "taiwanese" ? 17 : 14,
      );
      await page.screenshot({
        path: resolve(out, `${variant}-offline-resume-${width}.png`),
      });
      await ctx.setOffline(false);
      await page.goto(base);
      await page.evaluate(
        (saved) =>
          localStorage.setItem("openmahjong.game.v1", JSON.stringify(saved)),
        fixtures[variant].call,
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Resume game", exact: true })
        .click();
      await page.getByRole("button", { name: "Pass", exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Focus hand", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page.screenshot({
        path: resolve(out, `${variant}-call-${width}.png`),
      });
      assert.deepEqual(errors, []);
      reports.push({
        variant,
        width,
        seed: fixtures[variant].late.seed,
        decisions: fixtures[variant].late.decisions.length,
        cells,
        faces,
        overflow,
        axe: [],
        errors,
        offlineResume: true,
        keyboardSelection: true,
      });
      console.log(`PASS sizing/resume ${variant} ${width}`);
      await ctx.close();
    }
} finally {
  await browser.close();
  writeFileSync(resolve(out, "report.json"), JSON.stringify(reports, null, 2));
}

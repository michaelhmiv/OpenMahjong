import { browserLaunchOptions } from "./browser-harness.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = process.argv[3] ?? "work/gold-confirm";
mkdirSync(out, { recursive: true });

/**
 * Gold Confirm regression (owner ruling, 2026-11-20): the calculator's
 * recording Confirm is NOT a licensed gold role (design rules section
 * 2). It wears the standard commit treatment of the medium system
 * (section 15: a screen's commit verb wears the sheet tint) like every
 * other primary button. Before the ruling the Confirm wore gold
 * (#d9b45c) with a single-use disabled olive (#4d4630); both are
 * retired. This script drives the in-person scorekeeper to the Check
 * payments screen, measures the Confirm's computed treatment in its
 * enabled and disabled states, and censuses gold across the in-person
 * screen (#screen-tables): after the ruling, no element in that screen
 * may wear gold in any property. (Shell-level licensed gold — the
 * wordmark, the Play fill — lives outside this screen and is censused
 * by the theme/content-page suites.)
 */
const GOLD = "rgb(217, 180, 92)", // #d9b45c
  SHEET = "rgb(216, 222, 205)", // #d8decd, the sheet tint
  ON_TINT = "rgb(28, 42, 32)", // #1c2a20, ink on tints
  RETIRED_OLIVE = "rgb(77, 70, 48)"; // #4d4630, retired with the gold

const browser = await chromium.launch(browserLaunchOptions());
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
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
// Same seat-first tile-entry flow as browser-in-person.mjs, ending on
// the Check payments screen whose Confirm is the recording gate.
await page
  .getByRole("button", { name: /Player 1 [\d,]+ points/ })
  .click();
await page
  .getByRole("button", { name: "On a discard", exact: true })
  .click();
await page.locator(".cx-seatchip", { hasText: "Player 2" }).click();
await page
  .getByRole("button", { name: "Score it from the tiles", exact: true })
  .click();
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

const CONFIRM_SEL = ".calculator-output .cx-btnrow button.primary";
const measure = () =>
  page.evaluate(
    ({ GOLD, CONFIRM_SEL }) => {
      const confirm = document.querySelector(CONFIRM_SEL);
      const cs = getComputedStyle(confirm);
      const goldHits = [];
      for (const el of document
        .querySelector("#screen-tables")
        .querySelectorAll("*")) {
        const s = getComputedStyle(el);
        for (const prop of ["backgroundColor", "color"]) {
          if (s[prop] === GOLD) {
            goldHits.push({
              prop,
              tag: el.tagName.toLowerCase(),
              cls: el.getAttribute("class") ?? "",
              text: (el.textContent ?? "").trim().slice(0, 40),
            });
          }
        }
      }
      return {
        confirmText: confirm.textContent.trim(),
        confirmBg: cs.backgroundColor,
        confirmColor: cs.color,
        goldHits,
      };
    },
    { GOLD, CONFIRM_SEL },
  );

const enabled = await measure();
await page.screenshot({ path: `${out}/confirm-enabled-390.png` });
await page
  .locator(".calculator-output")
  .screenshot({ path: `${out}/confirm-enabled-panel-390.png` });

// The corrections flow disables Confirm until corrections are applied;
// flip the state directly to measure the disabled treatment (the
// functional disable is covered by browser-in-person.mjs).
await page.evaluate(
  (sel) => {
    document.querySelector(sel).disabled = true;
  },
  CONFIRM_SEL,
);
const disabled = await page.evaluate((sel) => {
  const cs = getComputedStyle(document.querySelector(sel));
  return { bg: cs.backgroundColor, color: cs.color };
}, CONFIRM_SEL);
await page.screenshot({ path: `${out}/confirm-disabled-390.png` });

const metrics = { enabled, disabled, errors };
writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));

assert.deepEqual(errors, []);
assert.match(enabled.confirmText, /Confirm/);
assert.equal(
  enabled.confirmBg,
  SHEET,
  `Confirm background must be the sheet tint ${SHEET}, got ${enabled.confirmBg}`,
);
assert.equal(
  enabled.confirmColor,
  ON_TINT,
  `Confirm label must be the on-tint ink ${ON_TINT}, got ${enabled.confirmColor}`,
);
assert.equal(
  disabled.bg,
  SHEET,
  `disabled Confirm background must stay the sheet tint, got ${disabled.bg}`,
);
assert.notEqual(
  disabled.color,
  RETIRED_OLIVE,
  "disabled Confirm must not use the retired #4d4630 olive",
);
assert.deepEqual(
  enabled.goldHits,
  [],
  "no element on the in-person screen may wear gold in any property",
);
await browser.close();
console.log("gold-confirm: PASS");

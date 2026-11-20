import { browserLaunchOptions } from "./browser-harness.mjs";
/** Analyze captures (brief-analyze-v1 acceptance): the staged game
 * om-analyze-1 opened from Games → details → Analyze; Overall at the
 * top, scrolled, at the key-moments band, and at the end; Move by
 * move at decision 420 (the staged riichi miss, event 723 of 1013)
 * plus its below-the-fold bottom (score strip, slider, nav buttons,
 * footer note), at 390 and 412. Asserts the staged numbers render
 * before shooting. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = resolve(process.argv[3] ?? "work/analyze");
mkdirSync(out, { recursive: true });

const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/om-analyze-1.json", "utf8"),
);
const saved = fixture.saved;
const record = {
  id: saved.id ?? "om-analyze-1-record",
  length: saved.length,
  placement: 4,
  score: 7400,
  finishedAt: "2026-11-20T00:00:00Z",
  log: saved,
  stats: { hands: 8, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0 },
};

const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of [390, 412]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
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
    await page.goto(base);
    await page.evaluate((records) => {
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
    }, [record]);
    await page.reload();
    await page.locator("[data-tab=games]").click();
    await page.locator("#screen-games .hrow").last().click();
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    const screen = page.locator("#screen-analyze");
    await screen.locator(".an-seclab").first().waitFor();
    const overallText = await screen.evaluate((node) => node.textContent ?? "");
    assert.ok(overallText.includes("99.5%"), "overall shows 99.5% accuracy");
    assert.ok(overallText.includes("Misses — 3"), "overall shows 3 misses");
    assert.ok(
      overallText.includes("The coach grades its own policy"),
      "honesty lock renders",
    );
    await page.screenshot({ path: resolve(out, `overall-${width}-top.png`) });
    await screen.evaluate((node) => {
      const scroller = node.querySelector(".an-screen") ?? node;
      scroller.scrollTop = 850;
      node.scrollTop = 850;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(out, `overall-${width}-mid.png`) });
    // Key moments band: it sits between the score chart and the
    // per-player detail, a band the fixed scrolls step over — scroll
    // its section label into view and photograph the band itself.
    const momentsLabel = screen.locator(".an-seclab", { hasText: "Key moments" });
    await momentsLabel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const momentsBox = await momentsLabel.boundingBox();
    assert.ok(
      momentsBox && momentsBox.y >= 0 && momentsBox.y < 844,
      "key moments band scrolled into view",
    );
    await page.screenshot({ path: resolve(out, `overall-${width}-moments.png`) });
    await screen.evaluate((node) => {
      const scroller = node.querySelector(".an-screen") ?? node;
      scroller.scrollTop = 100000;
      node.scrollTop = 100000;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(out, `overall-${width}-bottom.png`) });

    // Move by move: seek the slider to event 723 (decision 419's
    // event, the staged riichi miss) and verify the verdict.
    await screen.getByRole("button", { name: "Move by move", exact: true }).click();
    const hit = screen.locator(".an-slider .hit");
    await hit.waitFor();
    const hitBox = await hit.boundingBox();
    const trackBox = await screen.locator(".an-slider .track").boundingBox();
    assert.ok(hitBox && trackBox, "slider geometry available");
    // seekFromPointer measures against the TRACK rect; the hit layer
    // extends 6px past it on both sides, so aim by track geometry.
    await page.mouse.click(
      trackBox.x + trackBox.width * (723 / 1012),
      hitBox.y + hitBox.height / 2,
    );
    await page.waitForTimeout(300);
    const movesText = await screen.evaluate((node) => node.textContent ?? "");
    assert.ok(
      movesText.includes("Decision 420 of 576"),
      `slider lands on decision 420 (saw: ${movesText.slice(0, 200)})`,
    );
    assert.ok(
      movesText.includes("Miss — stayed silent, coach says declare"),
      "riichi-miss verdict renders",
    );
    assert.ok(movesText.includes("1,300"), "staged dama value renders");
    assert.ok(movesText.includes("2,300"), "staged riichi value renders");
    // Compare-row attribution (approved frame P2): the Played row
    // names the played discard with its own wait; the Coach row
    // names the coach's discard and carries the riichi line's wait;
    // the board centre line carries the honba.
    assert.ok(
      movesText.includes("discard 9 of bamboo, no riichi."),
      "played row names the played discard (long tile name, not engine notation)",
    );
    assert.ok(
      movesText.includes("Wait 3 of bamboo (1 unseen)"),
      "played row carries the played line's own wait",
    );
    assert.ok(
      movesText.includes("declare riichi, discard 2 of bamboo."),
      "coach row names the coach's discard",
    );
    assert.ok(
      movesText.includes("Wait 5 of bamboo (3 unseen) + 8 of bamboo (3 unseen) — 6 unseen, two-sided."),
      "coach row carries the riichi line's wait",
    );
    assert.ok(movesText.includes("Repeat 1"), "board centre line carries the honba");
    await page.screenshot({ path: resolve(out, `moves-${width}-419.png`) });
    // Moves bottom: the score strip, slider, nav buttons and footer
    // note sit below the fold at this decision — scroll the screen
    // to its end and photograph them too.
    assert.ok(movesText.includes("Previous decision"), "decision nav renders");
    assert.ok(movesText.includes("Next event"), "event nav renders");
    assert.ok(
      movesText.includes("Unseen copies may be in opponents' hands"),
      "moves footer note renders",
    );
    await screen.evaluate((node) => {
      const scroller = node.querySelector(".an-screen") ?? node;
      scroller.scrollTop = 100000;
      node.scrollTop = 100000;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(out, `moves-${width}-419-bottom.png`) });
    assert.deepEqual(errors, [], `page errors at ${width}: ${errors.join("; ")}`);
    await ctx.close();
    console.log(`analyze captures at ${width}: ok`);
  }
} finally {
  await browser.close();
}
console.log(`captures in ${out}`);

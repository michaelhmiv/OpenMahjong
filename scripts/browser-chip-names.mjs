/**
 * B6 regression (fix round 3): opponent display names on the online
 * table render WHOLE at phone widths — no ellipsis — up to the app's
 * 32-character display-name cap (server `nameOf` validation and the
 * guest sheet's maxLength both cap at 32).
 *
 * Round 2's fix ellipsised names inside their chips as a "last
 * resort", but QC measured realistic names still truncating at
 * 390px (16 chars: scrollWidth 69 vs clientWidth 58; 26 chars: 119
 * vs 103). Three cap-length names cannot fit one line at the 11px
 * floor in a 390px band alongside winds and scores, so the name now
 * wraps inside its chip and the band grows to fit. This check seats
 * a real four-player room whose opponents carry the harshest names
 * the cap allows — a spaced 32-char Latin name, an unbroken 32-char
 * token, and a 14-char CJK name (wider per character than any Latin
 * cap name) — and asserts, on the host's 390px view and again at
 * 412px, that every opponent name measures scrollWidth ==
 * clientWidth, the band stays inside the viewport with no chip
 * overlap, and every score stays inside its chip.
 *
 * Set CHIP_NAME_SET=cjk32 to swap the CJK seat to a full 32-char
 * CJK name (the widest name the cap admits).
 *
 * Run against a built web client and a real local API with its own
 * disposable database (the postgres CI job's stack):
 *   node scripts/browser-chip-names.mjs http://localhost:4187 http://localhost:4188 work/chip-names
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-harness.mjs";

const web = process.argv[2] ?? "http://localhost:4187";
const api = process.argv[3] ?? "http://localhost:4188";
const output = resolve(process.argv[4] || "work/chip-names");
await mkdir(output, { recursive: true });
for (const host of [web, api])
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(host).hostname));

const NAMES =
  process.env.CHIP_NAME_SET === "cjk32"
    ? [
        "Host",
        "Alexandrina Featherstonehaugh Jr",
        "AbcdefghijklmnopqrstuvwxyzABCDEF",
        "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみ",
      ]
    : [
        "Host",
        "Alexandrina Featherstonehaugh Jr",
        "AbcdefghijklmnopqrstuvwxyzABCDEF",
        "あいうえおかきくけこさしすせ",
      ];
for (const n of NAMES.slice(1))
  assert.ok([...n].length <= 32, "test names stay within the 32-char cap");

const browser = await chromium.launch(browserLaunchOptions());
const report = { web, observedAt: new Date().toISOString(), nameSet: NAMES, views: [] };
try {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const p of pages) p.on("pageerror", (e) => errors.push(e.message));

  for (const [i, p] of pages.entries()) {
    await p.goto(web + "/#/online");
    await p.getByLabel("Display name").fill(NAMES[i]);
    await p.getByRole("button", { name: "Play as guest" }).click();
    await p.getByRole("button", { name: "Continue", exact: true }).click();
    await p.getByRole("heading", { name: "My games" }).waitFor();
  }

  const host = pages[0];
  await host.goto(web + "/#/online");
  await host.getByRole("radio", { name: "Riichi", exact: true }).click();
  await host.getByRole("radio", { name: "Correspondence", exact: true }).click();
  await host.getByRole("radio", { name: "East only", exact: true }).click();
  await host.getByRole("button", { name: "Create custom room" }).click();
  const invite = (await host.getByLabel("Invite link").textContent()).trim();
  for (const p of pages.slice(1)) {
    await p.goto(invite);
    await p.getByRole("heading", { name: "Room invitation" }).waitFor();
    await p.getByRole("button", { name: "Join room", exact: true }).click();
    await p.getByRole("button", { name: "Ready up", exact: true }).click();
  }
  await host.getByRole("button", { name: "Start match" }).click();
  await host.waitForFunction(
    () => document.querySelectorAll(".bandtop .chip .nm").length === 3,
  );

  const measure = (page) =>
    page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const chips = [...document.querySelectorAll(".bandtop .chip")].map((chip) => {
        const r = chip.getBoundingClientRect();
        const nm = chip.querySelector(".nm");
        const b = chip.querySelector("b");
        const br = b?.getBoundingClientRect();
        return {
          text: (chip.textContent || "").trim().replace(/\s+/g, " "),
          x: round(r.x),
          right: round(r.right),
          w: round(r.width),
          h: round(r.height),
          name: nm
            ? {
                text: nm.textContent,
                scrollW: nm.scrollWidth,
                clientW: nm.clientWidth,
                h: round(nm.getBoundingClientRect().height),
                fontSize: parseFloat(getComputedStyle(nm).fontSize),
              }
            : null,
          score: br
            ? { x: round(br.x), right: round(br.right), text: b.textContent }
            : null,
        };
      });
      const band = document.querySelector(".bandtop")?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        band: band ? { x: round(band.x), right: round(band.right), h: round(band.height) } : null,
        chips,
      };
    });

  const checkView = (view, width) => {
    assert.equal(view.chips.length, 3, "three opponent chips render");
    for (const chip of view.chips) {
      assert.ok(chip.name, `chip "${chip.text}" carries a name span`);
      assert.equal(
        chip.name.scrollW,
        chip.name.clientW,
        `name "${chip.name.text}" renders whole at ${width}px (scrollWidth ${chip.name.scrollW} vs clientWidth ${chip.name.clientW})`,
      );
      assert.ok(chip.name.fontSize >= 11, "name stays at or above the 11px floor");
      assert.ok(
        chip.score && chip.score.x >= chip.x - 0.5 && chip.score.right <= chip.right + 0.5,
        `score stays inside its chip at ${width}px`,
      );
    }
    assert.ok(view.chips[0].x >= -0.5, "band starts inside the viewport");
    assert.ok(
      view.chips.at(-1).right <= width + 0.5,
      "band ends inside the viewport",
    );
    for (let i = 1; i < view.chips.length; i++)
      assert.ok(
        view.chips[i].x >= view.chips[i - 1].right - 0.5,
        "chips do not overlap",
      );
  };

  // Measure every view and capture the evidence first; assertions
  // run afterwards so a failure still leaves its metrics on disk.
  const failures = [];
  const check = (view, width) => {
    try {
      checkView(view, width);
    } catch (e) {
      failures.push(e.message);
    }
  };

  await host.evaluate(() => document.fonts.ready);
  await host.waitForTimeout(300);
  const at390 = await measure(host);
  report.views.push({ page: "host", width: 390, ...at390 });
  await host.screenshot({ path: resolve(output, "online-table-names-390.png") });
  check(at390, 390);

  // A second seat's view: a different trio of opponents, same width.
  const guest = pages[2];
  await guest.waitForFunction(
    () => document.querySelectorAll(".bandtop .chip .nm").length === 3,
  );
  await guest.evaluate(() => document.fonts.ready);
  await guest.waitForTimeout(300);
  const guest390 = await measure(guest);
  report.views.push({ page: "seat-3", width: 390, ...guest390 });
  await guest.screenshot({ path: resolve(output, "online-table-names-seat3-390.png") });
  check(guest390, 390);

  // 412px non-regression: names whole there too, band contained.
  await host.setViewportSize({ width: 412, height: 844 });
  await host.waitForTimeout(300);
  const at412 = await measure(host);
  report.views.push({ page: "host", width: 412, ...at412 });
  await host.screenshot({ path: resolve(output, "online-table-names-412.png") });
  check(at412, 412);

  await writeFile(resolve(output, "chip-names.metrics.json"), JSON.stringify(report, null, 1));
  assert.deepEqual(errors, [], "no page errors");
  assert.deepEqual(failures, [], failures.join("\n"));
  console.log(
    "chip-names PASS:",
    report.views
      .map(
        (v) =>
          `${v.page}@${v.width} band h=${v.band.h} names=` +
          v.chips.map((c) => `${c.name.scrollW}/${c.name.clientW}`).join(","),
      )
      .join(" | "),
  );
} finally {
  await browser.close();
}

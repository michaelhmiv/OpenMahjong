// Run against a built web client and a real local API with its own disposable database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { evaluateVariantDiscards } from "@openmahjong/ai";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-harness.mjs";

const length = process.env.ONLINE_BROWSER_LENGTH ?? "east",
  pace = process.env.ONLINE_BROWSER_PACE ?? "correspondence";
const samples = [];
const web = process.argv[2] ?? "http://localhost:4187";
const api = process.argv[3] ?? "http://localhost:4188";
for (const host of [web, api])
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(host).hostname));
const browser = await chromium.launch(browserLaunchOptions());
const contexts = await Promise.all(
  Array.from({ length: 4 }, (_, i) =>
    browser.newContext({
      viewport: i ? { width: 960, height: 800 } : { width: 390, height: 844 },
    }),
  ),
);
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const errors = [];
for (const p of pages) p.on("pageerror", (e) => errors.push(e.message));
const csrf = [];
async function request(seat, path, body) {
  const start = performance.now();
  const r = await contexts[seat].request.fetch(api + "/api/online/" + path, {
    method: body ? "POST" : "GET",
    maxRetries: body ? 0 : 2,
    headers: { origin: web, "x-csrf-token": csrf[seat] ?? "" },
    ...(body ? { data: body } : {}),
  });
  if (path.startsWith("matches/") && !body)
    samples.push(performance.now() - start);
  const data = await r.json();
  await r.dispose();
  assert.ok(r.ok(), path + " " + JSON.stringify(data.error));
  return data;
}
try {
  for (const [i, p] of pages.entries()) {
    await p.goto(web + "/#/online");
    await p.getByLabel("Display name").fill("Test seat " + (i + 1));
    await p.getByRole("button", { name: "Play as guest" }).click();
    await p.getByRole("button", { name: "Continue", exact: true }).click();
    await p.getByRole("heading", { name: "My games" }).waitFor();
    csrf[i] = (await request(i, "me")).csrf;
  }
  // Lobby geometry (QC rule, multiplayer-ui-v1): the duo buttons are
  // equal in width AND height; Create custom room is smaller on
  // every dimension than one duo button.
  {
    const host = pages[0];
    const box = async (name) =>
      host.getByRole("button", { name }).boundingBox();
    const friendly = await box("Find Friendly game");
    const ranked = await box("Sign in for Ranked");
    const create = await box("Create custom room");
    assert.ok(friendly && ranked && create, "lobby actions render");
    assert.equal(friendly.height, ranked.height, "duo heights equal");
    assert.equal(friendly.width, ranked.width, "duo widths equal");
    assert.ok(create.width < friendly.width, "Create narrower than a duo button");
    assert.ok(create.height < friendly.height, "Create shorter than a duo button");
    // Queue flow: guest -> lobby -> Friendly queue sheet -> leave.
    await host.getByRole("button", { name: "Find Friendly game" }).click();
    await host.getByRole("heading", { name: "Finding a table" }).waitFor();
    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await host.getByRole("heading", { name: "My games" }).waitFor();
  }
  for (const variant of ["riichi", "hong-kong", "mcr", "taiwanese"]) {
    if (variant === "riichi" && length === "full") continue;
    const host = pages[0];
    await host.goto(web + "/#/online");
    const variantLabels = {
      riichi: "Riichi",
      "hong-kong": "Hong Kong Old Style",
      mcr: "MCR",
      taiwanese: "Taiwanese",
    };
    const lengthLabels =
      variant === "riichi"
        ? { east: "East only", south: "East + South" }
        : { east: "East", south: "East + South", full: "Four rounds" };
    const paceLabels = {
      correspondence: "Correspondence",
      live: "Live · 5+20",
      relaxed: "Relaxed · 10+40",
    };
    await host
      .getByRole("radio", { name: variantLabels[variant], exact: true })
      .click();
    await host
      .getByRole("radio", { name: paceLabels[pace], exact: true })
      .click();
    await host
      .getByRole("radio", { name: lengthLabels[length], exact: true })
      .click();
    await host.getByRole("button", { name: "Create custom room" }).click();
    const invite = await host.getByLabel("Invite link").inputValue();
    const id = new URL(host.url()).hash.split("/").at(-1);
    for (const p of pages.slice(1)) {
      await p.goto(invite);
      // Join-by-link lands as a sheet over the lobby, facts first.
      await p.getByRole("heading", { name: "Room invitation" }).waitFor();
      await p.getByRole("button", { name: "Join room", exact: true }).click();
      await p.getByRole("button", { name: "Ready up", exact: true }).click();
    }
    await host.getByRole("button", { name: "Start match" }).click();
    // The table's clock row names the mover only for timed paces; the
    // approved correspondence table (frame 15) shows "Correspondence /
    // No time limit" instead, so the post-start wait is pace-aware.
    // The Discard click below still proves the host holds the move.
    if (pace === "correspondence")
      await host.getByText("Correspondence", { exact: true }).waitFor();
    else await host.getByRole("heading", { name: "Your move" }).waitFor();
    await host
      .getByRole("button", { name: /^Discard / })
      .first()
      .click();
    const prefix = "matches/" + id;
    const early = await contexts[0].request.get(
      api + "/api/online/" + prefix + "/review",
    );
    assert.equal(early.status(), 409);
    await early.dispose();
    const clients = await Promise.all(
      pages.map((p) =>
        p.evaluate(() => sessionStorage.getItem("om-online-client")),
      ),
    );
    let positions = 0;
    for (; positions < 15000; positions++) {
      const views = await Promise.all(
        pages.map((_, i) => request(i, prefix + "?client=" + clients[i])),
      );
      if (views[0].state === "finished") {
        assert.ok(
          views.every(
            (v) => JSON.stringify(v.result) === JSON.stringify(views[0].result),
          ),
        );
        break;
      }
      await Promise.all(
        views.map(async (v, i) => {
          assert.equal(v.seat, i);
          if (pace === "correspondence") assert.equal(v.deadline, null);
          else assert.ok(Number.isFinite(v.deadline));
          assert.ok(!("journal" in v) && !("events" in v) && !("walls" in v));
          assert.ok(
            v.view.players.every((p) => !("tiles" in p) && !("hand" in p)),
          );
          if (!v.choices.length) return;
          let pick = ["tsumo", "ron", "discard", "pass"]
            .map((t) => v.choices.findIndex((a) => a.type === t))
            .find((n) => n >= 0);
          if (variant !== "riichi" && v.choices[pick]?.type === "discard") {
            const target = evaluateVariantDiscards(v.view).recommendation
              .tileId;
            const better = v.choices.findIndex(
              (a) => a.type === "discard" && a.tileId === target,
            );
            if (better >= 0) pick = better;
          }
          const body = {
            actionId: randomUUID(),
            revision: v.revision,
            choice: pick,
            client: clients[i],
            generation: v.generation,
            version: 1,
          };
          // A higher priority claim can settle the discard before this optional reply.
          const r = await contexts[i].request.post(
            api + "/api/online/" + prefix + "/actions",
            { data: body, headers: { origin: web, "x-csrf-token": csrf[i] } },
          );
          assert.ok(
            r.ok() || r.status() === 409,
            "move " + r.status() + " " + (await r.text()),
          );
          await r.dispose();
        }),
      );
    }
    assert.ok(positions < 15000);
    await host.getByRole("button", { name: "Analyze", exact: true }).click();
    // Start on a dealt board so the privacy assertion also detects an empty renderer.
    const step = host.getByRole("button", { name: "Next event" });
    for (
      let i = 0;
      i < 12 && !(await host.locator(".board-tile-back").count());
      i++
    )
      await step.click();
    assert.ok(await host.locator(".board-tile-back").count());
    await host.getByRole("button", { name: "Reveal all hands" }).click();
    assert.equal(await host.locator(".board-tile-back").count(), 0);
    await host.getByRole("button", { name: "Hide opponents’ hands" }).click();
    assert.ok(await host.locator(".board-tile-back").count());
    await step.click();
    await host.getByRole("button", { name: "Game details" }).click();
    await host.getByRole("button", { name: "Friendly rematch" }).click();
    await host.getByRole("heading", { name: "Waiting room" }).waitFor();
    const rematch = host.url().split("/").at(-1);
    assert.notEqual(rematch, id);
    await host.getByRole("button", { name: "Leave", exact: true }).click();
    await host.getByRole("heading", { name: "My games" }).waitFor();
    if (pace === "correspondence") {
      // Correspondence games are rows in My games on the lobby.
      await host
        .locator(".iprow", { hasText: "Correspondence" })
        .first()
        .waitFor();
    }
    console.log(
      [variant, length, pace].join(" ") +
        " completed across four private browsers in " +
        positions +
        " decisions",
    );
  }
  samples.sort((a, b) => a - b);
  console.log(
    "Seat snapshot latency across " +
      samples.length +
      " requests: p50 " +
      samples[Math.floor(samples.length * 0.5)].toFixed(1) +
      " ms, p95 " +
      samples[Math.floor(samples.length * 0.95)].toFixed(1) +
      " ms",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

// Run against a built web client and a real local API with its own disposable database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-harness.mjs";

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
  const r = await contexts[seat].request.fetch(api + "/api/online/" + path, {
    method: body ? "POST" : "GET",
    headers: { origin: web, "x-csrf-token": csrf[seat] ?? "" },
    ...(body ? { data: body } : {}),
  });
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
  for (const variant of ["riichi", "hong-kong", "mcr", "taiwanese"]) {
    const host = pages[0];
    await host.goto(web + "/#/online");
    await host
      .getByRole("combobox", { name: "Rules", exact: true })
      .selectOption(variant);
    await host
      .getByRole("combobox", { name: "Pace", exact: true })
      .selectOption("correspondence");
    await host.getByRole("button", { name: "Create custom room" }).click();
    const invite = await host.getByLabel("Invite link").inputValue();
    const id = new URL(host.url()).hash.split("/").at(-1);
    for (const p of pages.slice(1)) {
      await p.goto(invite);
      await p.getByRole("button", { name: "Join room", exact: true }).click();
      await p.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.getByRole("button", { name: "Start match" }).click();
    await host.getByRole("heading", { name: "Your move" }).waitFor();
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
          assert.equal(v.deadline, null);
          assert.ok(!("journal" in v) && !("events" in v) && !("walls" in v));
          assert.ok(
            v.view.players.every((p) => !("tiles" in p) && !("hand" in p)),
          );
          if (!v.choices.length) return;
          const pick = ["tsumo", "ron", "discard", "pass"]
            .map((t) => v.choices.findIndex((a) => a.type === t))
            .find((n) => n >= 0);
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
    assert.notEqual(host.url().split("/").at(-1), id);
    console.log(
      variant +
        " completed across four private browsers in " +
        positions +
        " decisions",
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

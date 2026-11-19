// Kill and replace the actual API behind the same address and persistent database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

const database = new URL(process.env.OPENMAHJONG_TEST_DB ?? "");
assert.ok(
  ["127.0.0.1", "localhost"].includes(database.hostname),
  "Loopback PostgreSQL required",
);
const admin = new Pool({ connectionString: database.href });
const schema = "om_crash_" + randomUUID().replaceAll("-", "");
const probe = createServer().listen(0, "127.0.0.1");
await once(probe, "listening");
const { port } = probe.address();
await new Promise((resolve) => probe.close(resolve));
const origin = "http://localhost:" + port,
  base = origin + "/api/online/";
let worker;
async function boot() {
  worker = spawn(process.execPath, ["packages/server/dist/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: origin,
      DATABASE_URL: database.href,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (worker.exitCode !== null)
      throw Error("API exited before becoming healthy");
    try {
      if ((await fetch(origin + "/healthz")).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error("API failed to start");
}
async function crash() {
  if (!worker || worker.exitCode !== null || worker.signalCode) return;
  const exited = once(worker, "exit");
  worker.kill("SIGKILL");
  await exited;
}
const actors = [],
  games = [];
async function call(seat, route, body) {
  const res = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      cookie: actors[seat]?.cookie ?? "",
      "content-type": "application/json",
      "x-csrf-token": actors[seat]?.csrf ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(res.ok, route + " HTTP " + res.status);
  return res;
}
async function json(seat, route, body) {
  return (await call(seat, route, body)).json();
}
const snapshots = (id) =>
  Promise.all(actors.map((_, seat) => json(seat, "matches/" + id)));
async function streamFirst(id) {
  const reader = (await call(0, "matches/" + id + "/stream")).body.getReader();
  let buffer = "";
  while (!buffer.includes("\n\n")) {
    const { done, value } = await reader.read();
    assert.ok(!done);
    buffer += new TextDecoder().decode(value);
  }
  return {
    reader,
    view: JSON.parse(
      buffer
        .split("\n")
        .find((line) => line.startsWith("data: "))
        .slice(6),
    ),
  };
}
await admin.query("CREATE SCHEMA " + schema);
database.searchParams.set("options", "-c search_path=" + schema);
try {
  await boot();
  for (let i = 0; i < 4; i++) {
    const res = await call(i, "guests", { name: "Crash test " + (i + 1) });
    actors.push({
      cookie: res.headers.get("set-cookie").split(";")[0],
      csrf: (await res.json()).csrf,
    });
  }
  for (const variant of ["riichi", "hong-kong", "mcr", "taiwanese"]) {
    const { id } = await json(0, "rooms", {
      variant,
      length: "east",
      pace: "correspondence",
    });
    const { invite } = await json(0, "matches/" + id);
    for (let i = 1; i < 4; i++) {
      await json(i, "rooms/join", { invite });
      await json(i, "matches/" + id + "/room", { kind: "ready" });
    }
    await json(0, "matches/" + id + "/room", { kind: "start" });
    const initial = await json(0, "matches/" + id);
    assert.equal(initial.deadline, null);
    const action = {
      actionId: randomUUID(),
      choice: initial.choices.findIndex((a) => a.type === "discard"),
      revision: initial.revision,
      version: 1,
    };
    const path = "matches/" + id + "/actions",
      ack = await json(0, path, action);
    games.push({ id, action, path, ack, views: await snapshots(id) });
  }
  const interrupted = await streamFirst(games[0].id);
  assert.deepEqual(interrupted.view, games[0].views[0]);
  await crash();
  try {
    while (!(await interrupted.reader.read()).done) {}
  } catch {
  } finally {
    interrupted.reader.releaseLock();
  }
  await admin.query(
    "UPDATE " +
      schema +
      ".online_seats SET seen_at=clock_timestamp()-interval '30 days'",
  );
  await boot();
  for (const { id, path, action, ack, views } of games) {
    assert.deepEqual(await snapshots(id), views);
    const stream = await streamFirst(id);
    assert.deepEqual(stream.view, views[0]);
    await stream.reader.cancel();
    assert.deepEqual(await json(0, path, action), ack);
    assert.deepEqual(await snapshots(id), views);
    const acting = views.find((v) => v.choices.length);
    assert.ok(acting);
    await json(acting.seat, path, {
      version: 1,
      choice: 0,
      revision: acting.revision,
      actionId: randomUUID(),
    });
  }
  console.log(
    "All four variants restored private snapshots, SSE and committed receipts across a hard API restart and 30 days of seat inactivity.",
  );
} finally {
  await crash();
  await admin.query("DROP SCHEMA " + schema + " CASCADE");
  await admin.end();
}

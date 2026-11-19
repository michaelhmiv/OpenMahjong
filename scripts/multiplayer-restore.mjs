// Exercise a backup and restore in two newly created databases on one disposable local Docker Postgres.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { runMigrations } from "../packages/server/dist/migrations.js";
import { OnlineTables } from "../packages/server/dist/online/service.js";

const url = new URL(process.env.OPENMAHJONG_TEST_DB ?? "");
assert.ok(
  ["127.0.0.1", "localhost"].includes(url.hostname),
  "Loopback database required",
);
const container = process.argv[2];
assert.match(container ?? "", /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/);
const prefix = "om_restore_" + randomUUID().replaceAll("-", "");
const docker = (command, input) =>
  execFileSync("docker", ["exec", "-i", container, ...command], {
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
const user = decodeURIComponent(url.username) || "postgres";
const databases = [],
  pools = [];
try {
  for (const suffix of ["source", "copy"]) {
    const name = prefix + "_" + suffix;
    docker(["createdb", "-U", user, name]);
    databases.push(name);
    const address = new URL(url);
    address.pathname = "/" + name;
    pools.push(new Pool({ connectionString: address.href }));
  }
  const [source, copy] = pools,
    server = new OnlineTables(source);
  await runMigrations(source);
  const players = [];
  for (let i = 0; i < 4; i++) {
    const id = randomUUID(),
      name = "Restore " + i;
    await source.query(
      "INSERT INTO users(id,google_sub,name) VALUES($1,$2,$3)",
      [id, "local-" + id, name],
    );
    await source.query(
      "INSERT INTO online_players(id,user_id,name,csrf) VALUES($1,$1,$2,$3)",
      [id, name, randomUUID()],
    );
    players.push({ id, user_id: id, name });
  }
  const format = { variant: "riichi", length: "east", pace: "correspondence" };
  const { id } = await server.transaction((d) =>
    server.create(d, players[0], format, "custom"),
  );
  const snapshot = (t, player, room) =>
    t.transaction((d) => t.snapshot(d, player.id, room));
  const invite = (await snapshot(server, players[0], id)).invite;
  for (const p of players.slice(1)) {
    await server.transaction((d) => server.join(d, p, null, invite));
    await server.transaction((d) => server.roomAction(d, p, id, "ready"));
  }
  await server.transaction((d) =>
    server.roomAction(d, players[0], id, "start"),
  );
  const { id: ranked } = await server.transaction((d) =>
    server.queue(d, players[0], format, "ranked"),
  );
  for (const p of players.slice(1))
    await server.transaction((d) => server.queue(d, p, format, "ranked"));
  for (const p of players)
    await server.transaction((d) => server.roomAction(d, p, ranked, "leave"));
  for (let i = 0; i < 2000; i++) {
    await server.tick();
    if ((await snapshot(server, players[0], ranked)).state === "finished")
      break;
  }
  const result = await snapshot(server, players[0], ranked);
  assert.equal(result.ratings.length, 4);
  const archive = docker([
    "pg_dump",
    "-U",
    user,
    "--format=custom",
    databases[0],
  ]);
  docker(
    [
      "pg_restore",
      "-U",
      user,
      "--exit-on-error",
      "--no-owner",
      "-d",
      databases[1],
    ],
    archive,
  );
  const restored = new OnlineTables(copy);
  assert.deepEqual(await runMigrations(copy), []);
  for (const p of players) {
    assert.deepEqual(
      await snapshot(restored, p, ranked),
      await snapshot(server, p, ranked),
    );
    assert.deepEqual(
      await snapshot(restored, p, id),
      await snapshot(server, p, id),
    );
  }
  const review = (t) =>
    t.transaction((d) => t.review(d, players[0].id, ranked));
  assert.deepEqual(await review(restored), await review(server));
  const cmd = { actionId: randomUUID(), revision: 0, choice: 0, version: 1 };
  for (const instance of [server, restored])
    await instance.transaction((d) =>
      instance.action(d, players[0].id, id, cmd),
    );
  for (const p of players)
    assert.deepEqual(
      await snapshot(restored, p, id),
      await snapshot(server, p, id),
    );
  console.log(
    "Restored four private seats and their next decision, a completed ranked replay, and all four rating ledger entries.",
  );
} finally {
  for (const pool of pools) await pool.end();
  for (const name of databases) docker(["dropdb", "-U", user, name]);
}

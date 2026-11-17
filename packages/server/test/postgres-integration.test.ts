import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { defaultMigrationsDir, runMigrations } from "../src/migrations.js";
import { PgStore } from "../src/pg-store.js";
const connectionString = process.env["OPENMAHJONG_TEST_DB"];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function isolated() {
  if (
    !connectionString ||
    !["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)
  )
    throw new Error(
      "This destructive-schema fixture requires an explicit loopback test database",
    );
  const schema = `om_test_${randomUUID().replaceAll("-", "")}`,
    admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
      connectionString,
      options: `-c search_path=${schema}`,
    }),
    store = new PgStore(pool);
  cleanups.push(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  return { pool, store };
}
describe.skipIf(!connectionString)(
  "real PostgreSQL migration and ownership boundaries",
  () => {
    it("migrates a clean schema and separates historical Riichi and new variant statistics", async () => {
      const { pool, store } = await isolated();
      const applied = await runMigrations(pool);
      expect(applied).toHaveLength(7);
      expect(await runMigrations(pool)).toEqual([]);
      const user = await store.upsertUser({
        googleSub: "synthetic-pg",
        name: "Test player",
        avatarUrl: null,
      });
      const base = {
        id: randomUUID(),
        length: "east" as const,
        placement: 2,
        score: 25000,
        finishedAt: new Date("2026-11-17T00:00:00Z"),
        log: null,
        stats: {
          hands: 4,
          riichi: 1,
          dealIns: 1,
          handsWon: 1,
          winPoints: 3900,
        },
      };
      await store.insertGame(user.id, base);
      await store.insertGame(user.id, {
        ...base,
        id: randomUUID(),
        variant: "hong-kong",
        length: "full",
        score: 1200,
        stats: { hands: 16, riichi: 0, dealIns: 0, handsWon: 2, winPoints: 96 },
      });
      expect((await store.getStats(user.id)).games).toBe(1);
      expect((await store.getStats(user.id, "hong-kong")).winPoints).toBe(96);
      expect(
        (await store.listGames(user.id, 100)).find(
          (g) => g.variant === "hong-kong",
        )!.length,
      ).toBe("full");
      expect((await store.getGame(user.id, base.id))!.stats.winPoints).toBe(
        3900,
      );
      for (const variant of ["mcr", "taiwanese"] as const) {
        const id = randomUUID();
        await store.insertGame(user.id, {
          ...base,
          id,
          variant,
          length: "full",
          stats: { ...base.stats, riichi: 0 },
        });
        expect((await store.getStats(user.id, variant)).games).toBe(1);
        expect((await store.getGame(user.id, id))!.variant).toBe(variant);
      }
      expect((await store.getStats(user.id)).games).toBe(1);
    });
    it("upgrades the prior five migrations without rewriting a historical record and serializes two boots", async () => {
      const { pool, store } = await isolated(),
        dir = await mkdtemp(join(tmpdir(), "om-prior-migrations-"));
      cleanups.push(() => rm(dir, { recursive: true, force: true }));
      for (const file of (await readdir(defaultMigrationsDir())).filter((f) =>
        /^00[1-5]_/.test(f),
      ))
        await cp(join(defaultMigrationsDir(), file), join(dir, file));
      expect(await runMigrations(pool, dir)).toHaveLength(5);
      const user = await store.upsertUser({
        googleSub: "prior-pg",
        name: "Historical fixture",
        avatarUrl: null,
      });
      const id = randomUUID();
      await pool.query(
        `INSERT INTO games(user_id,id,length,placement,score,finished_at,log,hands,riichi,deal_ins,hands_won,win_points) VALUES($1,$2,'east',1,30000,now(),'null',4,1,0,1,5200)`,
        [user.id, id],
      );
      const results = await Promise.all([
        runMigrations(pool),
        runMigrations(pool),
      ]);
      expect(results.map((r) => r.length).sort()).toEqual([0, 2]);
      const record = await store.getGame(user.id, id);
      expect(record!.score).toBe(30000);
      expect(record!.stats.winPoints).toBe(5200);
      expect((await store.getStats(user.id)).games).toBe(1);
    });
    it("performs atomic revisions and idempotency with private ownership and deletion cascades", async () => {
      const { pool, store } = await isolated();
      await runMigrations(pool);
      const user = await store.upsertUser({
        googleSub: "ledger-pg",
        name: "Synthetic owner",
        avatarUrl: null,
      });
      const other = await store.upsertUser({
        googleSub: "other-pg",
        name: "Other fixture",
        avatarUrl: null,
      });
      const state = { v: 1, id: "table-a", ledger: [] };
      const first = await store.writeTable(
        user.id,
        "table-a",
        0,
        "one",
        "digest-one",
        state,
      );
      expect(first.status).toBe("saved");
      expect(
        (
          await store.writeTable(
            user.id,
            "table-a",
            0,
            "one",
            "digest-one",
            state,
          )
        ).status,
      ).toBe("duplicate");
      expect(
        (
          await store.writeTable(
            user.id,
            "table-a",
            0,
            "one",
            "different",
            state,
          )
        ).status,
      ).toBe("key-reused");
      const concurrent = await Promise.all([
        store.writeTable(user.id, "table-a", 1, "two", "digest-two", state),
        store.writeTable(user.id, "table-a", 1, "three", "digest-three", state),
      ]);
      expect(concurrent.map((r) => r.status).sort()).toEqual([
        "conflict",
        "saved",
      ]);
      expect(await store.getTable(other.id, "table-a")).toBeNull();
      expect(await store.listTables(other.id)).toEqual([]);
      await store.putResume(user.id, {
        state: { v: 3 },
        clientSavedAt: new Date(),
      });
      await store.deleteUser(user.id);
      expect(await store.getTable(user.id, "table-a")).toBeNull();
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM in_person_writes",
          )
        ).rows[0]!.count,
      ).toBe(0);
      expect(await store.getResume(user.id)).toBeNull();
    });
  },
);

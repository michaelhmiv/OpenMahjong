/** Ordered per-file migrations, serialized across concurrent server boots. */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export function defaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

export async function runMigrations(pool: Pool, migrationsDir = defaultMigrationsDir()): Promise<string[]> {
  const client = await pool.connect();
  const lock = "hashtextextended('openmahjong-migrations:' || current_schema(), 0)";
  let locked = false;
  try {
    await client.query(`SELECT pg_advisory_lock(${lock})`);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map(row => row.name));
    const files = (await readdir(migrationsDir)).filter(file => file.endsWith(".sql")).sort();
    const done: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        done.push(file);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    return done;
  } finally {
    try {
      if (locked) await client.query(`SELECT pg_advisory_unlock(${lock})`);
    } finally { client.release(); }
  }
}

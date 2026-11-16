/**
 * Migration runner, executed at boot: applies any `NNNN_name.sql`
 * files from the migrations directory that are not yet recorded in
 * `schema_migrations`, each in its own transaction, in name order.
 * Idempotent — a second boot applies nothing.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/** Default migrations location: packages/server/migrations, resolved
 *  relative to this module (works from both src/ and dist/). */
export function defaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

export async function runMigrations(
  pool: Pool,
  migrationsDir: string = defaultMigrationsDir(),
): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM schema_migrations`,
  );
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [
        file,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    done.push(file);
  }
  return done;
}

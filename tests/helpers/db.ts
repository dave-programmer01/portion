import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "../../src/db/schema.ts";
import type { Db } from "../../src/db/index.ts";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/**
 * Spin up an in-memory Postgres (pglite) with the real schema applied by
 * replaying the committed migration files in order. This exercises the actual
 * DDL and lets the server query helpers run against a genuine Postgres engine —
 * catching join/dedup/scoping bugs a mock never would. `db` is cast to the app's
 * `Db` type so the same helpers used in production run unchanged here.
 */
export async function makeTestDb(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await client.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, client };
}

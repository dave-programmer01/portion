import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

/**
 * Seed the shared `food_master` cache with a curated set of common global foods
 * so search / manual entry has a reliable anchor (especially for non-Western
 * dishes the AI and Open Food Facts both miss). Idempotent: skips any food whose
 * name already exists as a `manual` row, so it's safe to re-run after expanding
 * scripts/data/foods.json.
 *
 * Run: DATABASE_URL is read from .env (same as drizzle-kit). `npm run db:seed-foods`.
 */
const here = dirname(fileURLToPath(import.meta.url));

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(here, "..", ".env"), "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  const raw = m?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!raw) throw new Error("DATABASE_URL not found in env or .env");
  return raw;
}

const sql = neon(readDatabaseUrl());
const { foods } = JSON.parse(
  readFileSync(join(here, "data", "foods.json"), "utf8"),
);

let inserted = 0;
let skipped = 0;
for (const f of foods) {
  const existing = await sql`
    SELECT id FROM food_master
    WHERE name = ${f.name} AND source = 'manual' LIMIT 1`;
  if (existing.length) {
    skipped += 1;
    continue;
  }
  await sql`
    INSERT INTO food_master
      (source, name, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, default_serving_g, confidence)
    VALUES
      ('manual', ${f.name}, ${f.kcal}, ${f.protein}, ${f.carbs}, ${f.fat}, ${f.servingG ?? null}, 1)`;
  inserted += 1;
}

console.log(
  `Seeded food_master: ${inserted} inserted, ${skipped} already present (of ${foods.length}).`,
);

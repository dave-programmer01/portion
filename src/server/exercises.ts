import { sql } from "drizzle-orm";

import { db } from "@/db";
import { exercises, type Exercise } from "@/db/schema";
import { canPerform } from "@/lib/equipment";

import { EXERCISE_SEED } from "./exercises-data";

/** id → required equipment items (the source of truth for access filtering). */
const REQUIRES = new Map(EXERCISE_SEED.map((e) => [e.id, e.requires]));

/**
 * Lazily seed the exercise library (idempotent). Re-seeds when the seed set has
 * grown (new movements added) so freshly-added exercises land without a manual
 * migration; `onConflictDoNothing` keeps existing rows untouched and re-runs cheap.
 */
export async function ensureExercisesSeeded(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(exercises);
  if (Number(count) >= EXERCISE_SEED.length) return;
  // Strip the code-only `requires` field before inserting into the DB table.
  await db
    .insert(exercises)
    .values(EXERCISE_SEED.map(({ requires: _r, ...row }) => row))
    .onConflictDoNothing();
}

/**
 * Exercises the user can actually perform given the equipment they own. An
 * exercise is allowed only when the user owns every item it requires (empty
 * requirements = bodyweight, always allowed).
 */
export async function getAllowedExercises(
  ownedEquipment: string[],
): Promise<Exercise[]> {
  await ensureExercisesSeeded();
  const all = await db.select().from(exercises);
  return all.filter((e) => canPerform(REQUIRES.get(e.id) ?? [], ownedEquipment));
}

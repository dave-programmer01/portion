import { db } from "@/db";
import { exercises, type Equipment, type Exercise } from "@/db/schema";

import { EXERCISE_SEED } from "./exercises-data";

/**
 * Lazily seed the exercise library (idempotent). Called before any workout read
 * or generation so the curated set always exists without a manual migration
 * step. `onConflictDoNothing` keeps re-runs cheap and safe.
 */
export async function ensureExercisesSeeded(): Promise<void> {
  const existing = await db.select({ id: exercises.id }).from(exercises).limit(1);
  if (existing.length > 0) return;
  await db.insert(exercises).values(EXERCISE_SEED).onConflictDoNothing();
}

/** Which library `equipment` values a user with the given equipment can use. */
const EQUIPMENT_ACCESS: Record<Equipment, string[]> = {
  bodyweight: ["bodyweight"],
  dumbbells: ["bodyweight", "dumbbells"],
  full_gym: ["bodyweight", "dumbbells", "barbell", "machine", "cable"],
};

/** Exercises the user can actually perform, given their available equipment. */
export async function getAllowedExercises(
  equipment: Equipment,
): Promise<Exercise[]> {
  await ensureExercisesSeeded();
  const allowed = EQUIPMENT_ACCESS[equipment];
  const all = await db.select().from(exercises);
  return all.filter((e) => allowed.includes(e.equipment));
}

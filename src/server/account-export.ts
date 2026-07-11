import { eq } from "drizzle-orm";

import { type Db } from "@/db";
import {
  foodEntry,
  foodItem,
  nutritionTargets,
  profiles,
  savedMeal,
  setLog,
  stepLog,
  users,
  weightLog,
  workoutDay,
  workoutPlan,
  workoutSession,
} from "@/db/schema";

/**
 * Gather every user-scoped row into a single portable document (GDPR/CCPA data
 * portability). Global/reference tables (food_master, exercises) and internal
 * ops data (ai_call_log) are intentionally excluded — they aren't the user's
 * personal data. Tables without a userId (food_item, workout_day, set_log) are
 * scoped through their parent. Takes an explicit `db` so it's integration-tested
 * against a real Postgres engine, guaranteeing it never leaks another user's rows.
 */
export async function buildAccountExport(database: Db, userId: string) {
  const [
    [user],
    [profile],
    [targets],
    entries,
    items,
    savedMeals,
    plans,
    days,
    sessions,
    sets,
    weights,
    steps,
  ] = await Promise.all([
    database.select().from(users).where(eq(users.id, userId)).limit(1),
    database.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    database
      .select()
      .from(nutritionTargets)
      .where(eq(nutritionTargets.userId, userId))
      .limit(1),
    database.select().from(foodEntry).where(eq(foodEntry.userId, userId)),
    database
      .select({ item: foodItem })
      .from(foodItem)
      .innerJoin(foodEntry, eq(foodItem.entryId, foodEntry.id))
      .where(eq(foodEntry.userId, userId)),
    database.select().from(savedMeal).where(eq(savedMeal.userId, userId)),
    database.select().from(workoutPlan).where(eq(workoutPlan.userId, userId)),
    database
      .select({ day: workoutDay })
      .from(workoutDay)
      .innerJoin(workoutPlan, eq(workoutDay.planId, workoutPlan.id))
      .where(eq(workoutPlan.userId, userId)),
    database
      .select()
      .from(workoutSession)
      .where(eq(workoutSession.userId, userId)),
    database
      .select({ set: setLog })
      .from(setLog)
      .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
      .where(eq(workoutSession.userId, userId)),
    database.select().from(weightLog).where(eq(weightLog.userId, userId)),
    database.select().from(stepLog).where(eq(stepLog.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    account: user ?? null,
    profile: profile ?? null,
    nutritionTargets: targets ?? null,
    food: {
      entries,
      items: items.map((r) => r.item),
      savedMeals,
    },
    workouts: {
      plans,
      days: days.map((r) => r.day),
      sessions,
      sets: sets.map((r) => r.set),
    },
    weightLogs: weights,
    stepLogs: steps,
  };
}

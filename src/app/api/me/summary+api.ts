import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  foodEntry,
  nutritionTargets,
  profiles,
  weightLog,
  workoutDay,
  workoutPlan,
  workoutSession,
} from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Aggregated stats for the Profile screen: workout counts, a day streak, this
 * week's activity, recent completed workouts, and the day's calories vs target.
 * All derived from data the app actually tracks (no fabricated metrics).
 */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive-day workout streak ending today or yesterday. */
function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const today = new Date();
  const todayStr = isoDate(today);
  const yest = new Date(today);
  yest.setUTCDate(yest.getUTCDate() - 1);
  const start = set.has(todayStr) ? today : set.has(isoDate(yest)) ? yest : null;
  if (!start) return 0;
  let streak = 0;
  const cursor = new Date(start);
  while (set.has(isoDate(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const today = new Date();
  const todayStr = isoDate(today);
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const mondayStr = isoDate(monday);

  const completedWhere = and(
    eq(workoutSession.userId, userId),
    isNotNull(workoutSession.completedAt),
  );

  const [
    [{ total } = { total: 0 }],
    [{ week } = { week: 0 }],
    streakRows,
    recent,
    [targets],
    [{ eatenToday } = { eatenToday: 0 }],
    [plan],
    [profile],
    [latestWeight],
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(workoutSession).where(completedWhere),
    db
      .select({ week: sql<number>`count(*)` })
      .from(workoutSession)
      .where(and(completedWhere, sql`${workoutSession.loggedDate} >= ${mondayStr}`)),
    db
      .selectDistinct({ d: workoutSession.loggedDate })
      .from(workoutSession)
      .where(completedWhere)
      .orderBy(desc(workoutSession.loggedDate))
      .limit(120),
    db
      .select({
        id: workoutSession.id,
        completedAt: workoutSession.completedAt,
        name: workoutDay.name,
        exercises: workoutDay.exercises,
      })
      .from(workoutSession)
      .innerJoin(workoutDay, eq(workoutDay.id, workoutSession.dayId))
      .where(completedWhere)
      .orderBy(desc(workoutSession.completedAt))
      .limit(5),
    db.select().from(nutritionTargets).where(eq(nutritionTargets.userId, userId)),
    db
      .select({ eatenToday: sql<number>`coalesce(sum(${foodEntry.totalCalories}), 0)` })
      .from(foodEntry)
      .where(
        and(
          eq(foodEntry.userId, userId),
          eq(foodEntry.loggedDate, todayStr),
          eq(foodEntry.status, "complete"),
        ),
      ),
    db
      .select()
      .from(workoutPlan)
      .where(and(eq(workoutPlan.userId, userId), eq(workoutPlan.isActive, true)))
      .limit(1),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db
      .select()
      .from(weightLog)
      .where(eq(weightLog.userId, userId))
      .orderBy(desc(weightLog.loggedDate))
      .limit(1),
  ]);

  return Response.json({
    totalWorkouts: Number(total),
    workoutsThisWeek: Number(week),
    streakDays: computeStreak(streakRows.map((r) => r.d)),
    // Most recent day the user logged food (ISO date), or null if never. Powers
    // the "welcome back" motivation card + the bell's unread signal.
    lastLoggedDate: streakRows.length
      ? ([...streakRows.map((r) => r.d)].sort().at(-1) ?? null)
      : null,
    planDaysPerWeek: plan?.daysPerWeek ?? profile?.trainingDaysPerWeek ?? 0,
    goal: profile?.goal ?? null,
    caloriesTarget: targets?.calories ?? null,
    caloriesEatenToday: Number(eatenToday),
    currentWeightKg: latestWeight?.weightKg ?? profile?.weightKg ?? null,
    unitPreference: profile?.unitPreference ?? "metric",
    recent: recent.map((r) => ({
      id: r.id,
      name: r.name,
      completedAt: r.completedAt,
      exercises: Array.isArray(r.exercises) ? r.exercises.length : 0,
    })),
  });
});

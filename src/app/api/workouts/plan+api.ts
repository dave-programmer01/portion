import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, workoutDay, workoutPlan, type Goal } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { ensureExercisesSeeded } from "@/server/exercises";
import { exercises as exercisesTable } from "@/db/schema";
import { getUserTier } from "@/server/billing";
import { planLimits } from "@/lib/gating";
import { inngest } from "@/inngest/client";
import { WORKOUT_GENERATE_EVENT } from "@/config";

/**
 * Active workout plan.
 *  GET  → { plan, days, library } (plan may be `generating`/`failed`; poll on those)
 *  POST → (re)generate: create a fresh `generating` plan, kick the Inngest job.
 */

/** Free tier default: 3-day full body regardless of the requested days. */
function splitForDays(days: number): { name: string; split: string } {
  if (days <= 3) return { name: "3-Day Full Body", split: "full_body" };
  if (days === 4) return { name: "4-Day Upper / Lower", split: "upper_lower" };
  return { name: `${days}-Day Push / Pull / Legs`, split: "ppl" };
}

export const GET = route(async (request) => {
  const userId = await requireUser(request);
  await ensureExercisesSeeded();

  const [plan] = await db
    .select()
    .from(workoutPlan)
    .where(and(eq(workoutPlan.userId, userId), eq(workoutPlan.isActive, true)))
    .orderBy(asc(workoutPlan.createdAt));

  if (!plan) return Response.json({ plan: null, days: [], library: [] });

  const days = await db
    .select()
    .from(workoutDay)
    .where(eq(workoutDay.planId, plan.id))
    .orderBy(asc(workoutDay.dayIndex));

  const library = await db.select().from(exercisesTable);

  return Response.json({ plan, days, library });
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (!profile) {
    return Response.json({ error: "Finish onboarding first" }, { status: 400 });
  }

  // Tier gating: free = one 3-day full-body plan, no regeneration. Premium can
  // regenerate and get up to 6 training days.
  const tier = await getUserTier(userId);
  const limits = planLimits(tier);
  const [existing] = await db
    .select({ id: workoutPlan.id })
    .from(workoutPlan)
    .where(and(eq(workoutPlan.userId, userId), eq(workoutPlan.isActive, true)));
  if (existing && !limits.canRegenerate) {
    return Response.json(
      {
        error: "Upgrade to regenerate your plan and unlock 4–6 day splits.",
        code: "paywall",
      },
      { status: 402 },
    );
  }

  // One active plan at a time — retire any previous ones.
  await db
    .update(workoutPlan)
    .set({ isActive: false })
    .where(eq(workoutPlan.userId, userId));

  const days = Math.min(profile.trainingDaysPerWeek, limits.maxDaysPerWeek);
  const { name, split } = splitForDays(days);

  const [plan] = await db
    .insert(workoutPlan)
    .values({
      userId,
      name,
      goal: profile.goal as Goal,
      daysPerWeek: days,
      split,
      status: "generating",
      isActive: true,
    })
    .returning();

  try {
    await inngest.send({
      name: WORKOUT_GENERATE_EVENT,
      data: { planId: plan.id, userId },
    });
  } catch (err) {
    // Don't fail the request if the event bus is down — the plan stays
    // `generating` and the client can retry generation.
    console.error("[workouts/plan] inngest.send failed", err);
  }

  return Response.json({ plan, days: [], library: [] });
});

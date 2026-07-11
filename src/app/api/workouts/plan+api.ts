import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  profiles,
  workoutDay,
  workoutPlan,
  workoutSession,
  type Goal,
} from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { ensureExercisesSeeded } from "@/server/exercises";
import { exercises as exercisesTable } from "@/db/schema";
import { getUserTier, plansSince, monthToDateSpendUsd } from "@/server/billing";
import { planLimits, workoutGenAllowed } from "@/lib/gating";
import { normalizeFocus, isFullBody, planName } from "@/lib/workout-focus";
import { inngest } from "@/inngest/client";
import { WORKOUT_GENERATE_EVENT, config } from "@/config";

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

  // Which of these days have a completed session THIS week (Mon-based)? Drives
  // the Plan Overview progress bar + per-day status (done / current / upcoming).
  const monday = new Date();
  const dow = monday.getUTCDay(); // 0 Sun … 6 Sat
  monday.setUTCDate(monday.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const mondayStr = monday.toISOString().slice(0, 10);
  const dayIds = days.map((d) => d.id);

  const completed = dayIds.length
    ? await db
        .selectDistinct({ dayId: workoutSession.dayId })
        .from(workoutSession)
        .where(
          and(
            eq(workoutSession.userId, userId),
            inArray(workoutSession.dayId, dayIds),
            isNotNull(workoutSession.completedAt),
            gte(workoutSession.loggedDate, mondayStr),
          ),
        )
    : [];

  const library = await db.select().from(exercisesTable);

  return Response.json({
    plan,
    days,
    library,
    completedDayIds: completed.map((c) => c.dayId),
    weekStart: mondayStr,
  });
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

  // Optional focus selection from the picker. If provided, remember it on the
  // profile; otherwise keep whatever the user chose before. A body with no
  // `focusAreas` (e.g. a plain "regenerate") leaves the stored choice untouched.
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const providedFocus = Array.isArray((raw as { focusAreas?: unknown }).focusAreas)
    ? normalizeFocus((raw as { focusAreas: unknown }).focusAreas)
    : null;
  const focus = providedFocus ?? normalizeFocus(profile.focusAreas);
  if (providedFocus) {
    await db
      .update(profiles)
      .set({ focusAreas: providedFocus, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
  }

  // Tier gating: free = one 3-day full-body plan, no regeneration. Premium can
  // regenerate and get up to 6 training days — up to a high daily safety cap.
  // Global spend ceiling + per-user burst guard apply to everyone (cost abuse).
  const tier = await getUserTier(userId);
  const limits = planLimits(tier);
  const [existing] = await db
    .select({ id: workoutPlan.id })
    .from(workoutPlan)
    .where(and(eq(workoutPlan.userId, userId), eq(workoutPlan.isActive, true)));
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [gensToday, gensLastMinute, spend] = await Promise.all([
    plansSince(userId, startOfDay),
    plansSince(userId, new Date(Date.now() - 60_000)),
    monthToDateSpendUsd(),
  ]);
  const decision = workoutGenAllowed({
    tier,
    hasActivePlan: !!existing,
    gensToday,
    gensLastMinute,
    premiumDailyLimit: config.premiumWorkoutGensPerDay,
    burstPerMinute: config.aiBurstPerMinute,
    monthSpendUsd: spend,
    spendCeilingUsd: config.monthlyAiSpendCeilingUsd,
  });
  if (!decision.allowed) {
    // Free hitting the regen wall → upsell (402). Cost/abuse guards → 429.
    const paywall = decision.reason === "needs_upgrade";
    const message =
      decision.reason === "needs_upgrade"
        ? "Upgrade to regenerate and customize your plan anytime."
        : decision.reason === "spend_ceiling"
          ? "Plan generation is paused for now — please try again later."
          : "You're generating plans too quickly — give it a moment.";
    return Response.json(
      { error: message, reason: decision.reason, code: paywall ? "paywall" : "rate_limited" },
      { status: paywall ? 402 : 429 },
    );
  }

  // One active plan at a time — retire any previous ones.
  await db
    .update(workoutPlan)
    .set({ isActive: false })
    .where(eq(workoutPlan.userId, userId));

  const days = Math.min(profile.trainingDaysPerWeek, limits.maxDaysPerWeek);
  const name = planName(days, focus);
  const split = isFullBody(focus) ? splitForDays(days).split : "focus";

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

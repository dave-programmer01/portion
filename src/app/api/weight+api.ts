import { z } from "zod";
import { and, asc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { weightLog, profiles, nutritionTargets } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { getUserTier } from "@/server/billing";
import { historyCutoff } from "@/lib/gating";
import { computeTargets } from "@/lib/nutrition";
import { config } from "@/config";

/**
 * Body-weight log.
 *  GET  → weigh-ins within the tier's history window + target/current.
 *  POST → record today's (or a given day's) weight. Logging *today* also
 *         updates the profile's current weight and recomputes Mifflin-St Jeor
 *         targets, so calorie goals track the user's actual weight over time.
 */

export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const today = new Date().toISOString().slice(0, 10);
  const tier = await getUserTier(userId);
  const cutoff = historyCutoff(tier, today, config.historyFreeDays);

  const logs = await db
    .select()
    .from(weightLog)
    .where(
      cutoff
        ? and(eq(weightLog.userId, userId), gte(weightLog.loggedDate, cutoff))
        : eq(weightLog.userId, userId),
    )
    .orderBy(asc(weightLog.loggedDate));

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));

  return Response.json({
    logs,
    currentKg: logs.at(-1)?.weightKg ?? profile?.weightKg ?? null,
    targetKg: profile?.targetWeightKg ?? null,
    unitPreference: profile?.unitPreference ?? "metric",
  });
});

const bodySchema = z.object({
  loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(500),
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid weight" }, { status: 400 });
  }
  const { loggedDate, weightKg } = parsed.data;

  // One weigh-in per day — replace any existing entry for that date.
  await db
    .delete(weightLog)
    .where(
      and(eq(weightLog.userId, userId), eq(weightLog.loggedDate, loggedDate)),
    );
  await db.insert(weightLog).values({ userId, loggedDate, weightKg });

  // Today's weigh-in becomes the profile's current weight → recompute targets.
  const today = new Date().toISOString().slice(0, 10);
  if (loggedDate === today) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    if (profile) {
      await db
        .update(profiles)
        .set({ weightKg, updatedAt: new Date() })
        .where(eq(profiles.userId, userId));
      const t = computeTargets({
        sex: profile.sex,
        age: profile.age,
        heightCm: profile.heightCm,
        weightKg,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
      });
      await db
        .update(nutritionTargets)
        .set({ ...t, computedAt: new Date() })
        .where(eq(nutritionTargets.userId, userId));
    }
  }

  return Response.json({ ok: true });
});

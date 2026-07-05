import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, nutritionTargets } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { computeTargets } from "@/lib/nutrition";

/**
 * Profile + nutrition targets.
 *  GET → { profile, targets } (nulls until onboarding is finished)
 *  PUT → save onboarding answers, (re)compute Mifflin-St Jeor targets, return both
 */

const bodySchema = z.object({
  goal: z.enum(["lose", "maintain", "gain"]),
  sex: z.enum(["male", "female"]),
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(90).max(250),
  weightKg: z.number().min(30).max(400),
  targetWeightKg: z.number().min(30).max(400).nullable().optional(),
  activityLevel: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
  ]),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  equipment: z.enum(["bodyweight", "dumbbells", "full_gym"]),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  injuries: z.string().max(500).nullable().optional(),
  unitPreference: z.enum(["metric", "imperial"]).default("metric"),
  healthAck: z.boolean(),
  healthFlag: z.boolean().default(false),
});

export const GET = route(async (request) => {
  const userId = await requireUser(request);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [targets] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId));

  return Response.json({ profile: profile ?? null, targets: targets ?? null });
});

export const PUT = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid profile", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const now = new Date();
  await db
    .insert(profiles)
    .values({ userId, ...data, onboardingCompletedAt: now })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...data, onboardingCompletedAt: now, updatedAt: now },
    });

  // Targets are derived, never AI. Recompute on every profile write.
  const t = computeTargets(data);
  await db
    .insert(nutritionTargets)
    .values({ userId, ...t, computedAt: now })
    .onConflictDoUpdate({
      target: nutritionTargets.userId,
      set: { ...t, computedAt: now },
    });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [targets] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId));

  return Response.json({ profile, targets });
});

import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, nutritionTargets } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { computeTargets } from "@/lib/nutrition";
import { normalizeEquipment } from "@/lib/equipment";
import { config } from "@/config";

/**
 * Profile + nutrition targets.
 *  GET → { profile, targets } (nulls until onboarding is finished)
 *  PUT → save onboarding answers, (re)compute Mifflin-St Jeor targets, return both
 */

const bodySchema = z.object({
  goal: z.enum(["lose", "maintain", "gain"]),
  sex: z.enum(["male", "female"]),
  age: z
    .number()
    .int()
    .min(config.minAgeYears, `You must be at least ${config.minAgeYears}.`)
    .max(100),
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
  // The owned-equipment inventory. Optional so profile edits that omit it (e.g.
  // changing units) never wipe it.
  equipmentItems: z.array(z.string()).optional(),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  // Daily step goal. Optional so edits that omit it don't reset it.
  stepGoal: z.number().int().min(1000).max(100000).optional(),
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
  // Clean the inventory when provided; when omitted, leave `equipmentItems`
  // untouched (undefined is skipped by Drizzle) so unrelated edits don't wipe it.
  if (data.equipmentItems) {
    data.equipmentItems = normalizeEquipment(data.equipmentItems);
  }

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

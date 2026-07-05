import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { savedMeal } from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Saved meals (favorites) for one-tap re-logging. GET lists the user's meals;
 * POST saves a new one from a set of items. Re-logging just POSTs these items
 * to /api/food/entries with source "saved".
 */

const itemSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string(),
  servingLabel: z.string().nullable().optional(),
  calories: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable().optional(),
  items: z.array(itemSchema).min(1),
});

export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const meals = await db
    .select()
    .from(savedMeal)
    .where(eq(savedMeal.userId, userId))
    .orderBy(desc(savedMeal.createdAt));
  return Response.json({ meals });
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid meal" }, { status: 400 });
  }
  const { name, mealType, items } = parsed.data;
  const totalCalories = Math.round(
    items.reduce((sum, i) => sum + i.calories, 0),
  );

  const [meal] = await db
    .insert(savedMeal)
    .values({
      userId,
      name,
      mealType: mealType ?? null,
      items: items.map((i) => ({ ...i, brand: i.brand ?? null })),
      totalCalories,
    })
    .returning();

  return Response.json({ meal });
});

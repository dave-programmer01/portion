import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem, foodMaster, type EntryStatus } from "@/db/schema";
import { config } from "@/config";

/**
 * Recompute an entry's denormalised macro totals from its child items and set
 * its status. Called after items are added/edited (manual, barcode, and the
 * Inngest vision job) so the dashboard can read totals without joining items.
 */
export async function recomputeEntryTotals(
  entryId: string,
  status?: EntryStatus,
): Promise<void> {
  const items = await db
    .select()
    .from(foodItem)
    .where(eq(foodItem.entryId, entryId));

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      proteinG: acc.proteinG + i.proteinG,
      carbsG: acc.carbsG + i.carbsG,
      fatG: acc.fatG + i.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  await db
    .update(foodEntry)
    .set({
      totalCalories: Math.round(totals.calories),
      totalProteinG: Math.round(totals.proteinG),
      totalCarbsG: Math.round(totals.carbsG),
      totalFatG: Math.round(totals.fatG),
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(foodEntry.id, entryId));
}

/** One food as returned by the vision model (macros are TOTALS for its portion). */
type AnalyzedFood = {
  name: string;
  unit: string;
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * Cache confident, photo-analysed foods into the shared `food_master` table so
 * they show up in search and can be re-logged without another AI call.
 *
 * The cache is strictly per-100g, so we can only derive per-100g macros from a
 * gram-measured portion — items measured in "serving"/"piece"/etc. are skipped
 * (their grams are unknown). Low-confidence results are skipped entirely. Exact
 * name matches are reused to avoid piling up duplicates. Returns a `foodMasterId`
 * (or null) aligned to the input array, best-effort — caching must never break
 * the log flow.
 *
 * @returns array of foodMasterId | null, one per input item (same order)
 */
export async function cacheAiFoods(
  items: AnalyzedFood[],
  confidence: number,
): Promise<(string | null)[]> {
  if (confidence < config.aiCacheMinConfidence) return items.map(() => null);

  return Promise.all(
    items.map(async (i) => {
      if (i.unit !== "g" || i.quantity <= 0 || i.calories <= 0) return null;
      try {
        const [existing] = await db
          .select({ id: foodMaster.id })
          .from(foodMaster)
          .where(and(eq(foodMaster.source, "ai"), eq(foodMaster.name, i.name)))
          .limit(1);
        if (existing) return existing.id;

        const factor = 100 / i.quantity; // portion grams → per-100g
        const [row] = await db
          .insert(foodMaster)
          .values({
            source: "ai",
            name: i.name,
            caloriesPer100: i.calories * factor,
            proteinPer100: i.proteinG * factor,
            carbsPer100: i.carbsG * factor,
            fatPer100: i.fatG * factor,
            defaultServingG: i.quantity,
            confidence,
          })
          .returning({ id: foodMaster.id });
        return row?.id ?? null;
      } catch (err) {
        console.error("[food] cacheAiFoods failed for", i.name, err);
        return null;
      }
    }),
  );
}

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, type Db } from "@/db";
import {
  foodEntry,
  foodItem,
  foodMaster,
  type EntryStatus,
  type SavedMealItem,
} from "@/db/schema";
import { config } from "@/config";

/**
 * Recently-logged foods for one-tap re-logging. Pulls the user's latest
 * complete-entry items, dedupes by name (keeping the freshest macros), and caps
 * the list. Returned in `SavedMealItem` shape so the client re-logs a recent the
 * same way it re-logs a saved meal. Takes an explicit `db` so it's integration-
 * testable against a pglite instance.
 */
export async function getRecentFoods(
  database: Db,
  userId: string,
  limit = 12,
): Promise<SavedMealItem[]> {
  const rows = await database
    .select({
      name: foodItem.name,
      brand: foodItem.brand,
      quantity: foodItem.quantity,
      unit: foodItem.unit,
      servingLabel: foodItem.servingLabel,
      calories: foodItem.calories,
      proteinG: foodItem.proteinG,
      carbsG: foodItem.carbsG,
      fatG: foodItem.fatG,
    })
    .from(foodItem)
    .innerJoin(foodEntry, eq(foodItem.entryId, foodEntry.id))
    .where(and(eq(foodEntry.userId, userId), eq(foodEntry.status, "complete")))
    .orderBy(desc(foodEntry.createdAt), desc(foodItem.createdAt))
    .limit(80);

  const seen = new Set<string>();
  const recents: SavedMealItem[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recents.push({
      name: r.name,
      brand: r.brand,
      quantity: r.quantity,
      unit: r.unit,
      servingLabel: r.servingLabel,
      calories: r.calories,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
    });
    if (recents.length >= limit) break;
  }
  return recents;
}

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

/** A single item's user-verified macros (TOTALS for the logged portion). */
type CorrectedItem = {
  name: string;
  unit: string;
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * When a user corrects an AI-estimated item, write the verified per-100g macros
 * back to the shared `food_master` cache so the app gets smarter with use — the
 * next person who logs the same dish gets a human-checked number instead of a
 * guess. This is the flywheel that closes the accuracy gap on regional/unfamiliar
 * foods over time.
 *
 * Only gram-measured items yield per-100g macros. We update an existing editable
 * cache row (an earlier `ai`/`manual` guess of the same name, promoting it to
 * `manual` = user-verified) or insert a new one — but never touch authoritative
 * barcode rows (they carry a real product's data). Best-effort: never blocks the
 * edit.
 */
export async function cacheUserCorrections(
  database: Db,
  items: CorrectedItem[],
): Promise<void> {
  // Sequential on purpose: only a handful of items per edit, and it avoids
  // assuming a connection pool (keeps it portable across drivers).
  for (const i of items) {
    if (i.unit !== "g" || i.quantity <= 0 || i.calories <= 0) continue;
    const factor = 100 / i.quantity; // portion grams → per-100g
    const macros = {
      caloriesPer100: i.calories * factor,
      proteinPer100: i.proteinG * factor,
      carbsPer100: i.carbsG * factor,
      fatPer100: i.fatG * factor,
      defaultServingG: i.quantity,
      confidence: 1, // human-verified
    };
    try {
      const [existing] = await database
        .select({ id: foodMaster.id })
        .from(foodMaster)
        .where(
          and(
            eq(foodMaster.name, i.name),
            isNull(foodMaster.barcode),
            inArray(foodMaster.source, ["ai", "manual"]),
          ),
        )
        .limit(1);
      if (existing) {
        await database
          .update(foodMaster)
          .set({ source: "manual", ...macros })
          .where(eq(foodMaster.id, existing.id));
      } else {
        await database
          .insert(foodMaster)
          .values({ source: "manual", name: i.name, ...macros });
      }
    } catch (err) {
      console.error("[food] cacheUserCorrections failed for", i.name, err);
    }
  }
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

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem, type EntryStatus } from "@/db/schema";

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

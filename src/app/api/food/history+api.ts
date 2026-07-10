import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, nutritionTargets } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { getUserTier } from "@/server/billing";
import { historyCutoff } from "@/lib/gating";
import { config } from "@/config";

/**
 * Per-day calorie/macro totals for the progress charts. Windowed to the tier's
 * history allowance (free = last N days). Days with no complete entries are
 * simply absent; the client fills gaps with zero.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 90);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  let from = start.toISOString().slice(0, 10);

  const tier = await getUserTier(userId);
  const cutoff = historyCutoff(tier, todayStr, config.historyFreeDays);
  if (cutoff && cutoff > from) from = cutoff; // clamp free tier to its window

  const rows = await db
    .select({
      date: foodEntry.loggedDate,
      calories: sql<number>`coalesce(sum(${foodEntry.totalCalories}), 0)`,
      proteinG: sql<number>`coalesce(sum(${foodEntry.totalProteinG}), 0)`,
      carbsG: sql<number>`coalesce(sum(${foodEntry.totalCarbsG}), 0)`,
      fatG: sql<number>`coalesce(sum(${foodEntry.totalFatG}), 0)`,
    })
    .from(foodEntry)
    .where(
      and(
        eq(foodEntry.userId, userId),
        eq(foodEntry.status, "complete"),
        gte(foodEntry.loggedDate, from),
      ),
    )
    .groupBy(foodEntry.loggedDate);

  const [targets] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId));

  return Response.json({
    from,
    to: todayStr,
    days: rows.map((r) => ({
      date: r.date,
      calories: Number(r.calories),
      proteinG: Number(r.proteinG),
      carbsG: Number(r.carbsG),
      fatG: Number(r.fatG),
    })),
    target: targets?.calories ?? null,
    historyFreeDays: config.historyFreeDays,
    tier,
  });
});

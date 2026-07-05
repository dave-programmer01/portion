import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem, nutritionTargets } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { getUserTier } from "@/server/billing";
import { canViewDate } from "@/lib/gating";
import { config } from "@/config";

/**
 * Daily food dashboard payload: every entry for the given local day (each with
 * its items) plus the user's targets. The client groups by meal type and sums
 * `complete` entries against the targets.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }

  // History gating: free tier can only see the last N days.
  const today = new Date().toISOString().slice(0, 10);
  const tier = await getUserTier(userId);
  if (!canViewDate(tier, date, today, config.historyFreeDays)) {
    return Response.json(
      { error: "Upgrade to see older history.", code: "paywall", locked: true },
      { status: 402 },
    );
  }

  const entries = await db
    .select()
    .from(foodEntry)
    .where(and(eq(foodEntry.userId, userId), eq(foodEntry.loggedDate, date)))
    .orderBy(desc(foodEntry.createdAt));

  const ids = entries.map((e) => e.id);
  const items = ids.length
    ? await db.select().from(foodItem).where(inArray(foodItem.entryId, ids))
    : [];

  const [targets] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId));

  return Response.json({
    date,
    targets: targets ?? null,
    entries: entries.map((e) => ({
      ...e,
      items: items.filter((i) => i.entryId === e.id),
    })),
  });
});

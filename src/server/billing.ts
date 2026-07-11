import { and, count, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { users, foodEntry, workoutPlan, aiCallLog, type Tier } from "@/db/schema";

/**
 * Billing/quota reads + writes. Tier is the source of truth for gating; it's
 * synced from RevenueCat (webhook → Inngest) but can also be set by the dev
 * upgrade path. Quota is derived by counting today's photo entries — a failed
 * scan flips to `failed` and drops out of the count, so failures never burn
 * quota (per the plan) with no extra bookkeeping.
 */

/** Effective tier: premium only while not expired. */
export async function getUserTier(userId: string): Promise<Tier> {
  const [u] = await db
    .select({ tier: users.tier, expiresAt: users.tierExpiresAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!u || u.tier !== "premium") return "free";
  if (u.expiresAt && u.expiresAt.getTime() < Date.now()) return "free";
  return "premium";
}

export async function setTier(
  userId: string,
  tier: Tier,
  expiresAt: Date | null = null,
): Promise<void> {
  await db
    .update(users)
    .set({ tier, tierExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Photo scans that count against quota today (pending + complete). */
export async function photoScansToday(
  userId: string,
  date: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(foodEntry)
    .where(
      and(
        eq(foodEntry.userId, userId),
        eq(foodEntry.loggedDate, date),
        eq(foodEntry.source, "photo"),
        inArray(foodEntry.status, ["pending", "complete"]),
      ),
    );
  return row?.n ?? 0;
}

/** Photo scans created since `since` (wall-clock, via createdAt) — burst guard. */
export async function photoScansSince(
  userId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(foodEntry)
    .where(
      and(
        eq(foodEntry.userId, userId),
        eq(foodEntry.source, "photo"),
        inArray(foodEntry.status, ["pending", "complete"]),
        gte(foodEntry.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/** Workout plans this user created since `since` (daily regen cap + burst). */
export async function plansSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workoutPlan)
    .where(
      and(eq(workoutPlan.userId, userId), gte(workoutPlan.createdAt, since)),
    );
  return row?.n ?? 0;
}

/** Month-to-date AI spend in USD across all users (global beta ceiling). */
export async function monthToDateSpendUsd(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiCallLog.costUsd}), 0)` })
    .from(aiCallLog)
    .where(gte(aiCallLog.createdAt, start));
  return Number(row?.total ?? 0);
}

/** Photo scans across all users today (spend/usage metric). */
export async function scansTodayGlobal(date: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(foodEntry)
    .where(and(eq(foodEntry.loggedDate, date), eq(foodEntry.source, "photo")));
  return row?.n ?? 0;
}

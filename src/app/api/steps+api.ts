import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { stepLog, profiles } from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Daily steps.
 *  GET  → { days: [{date, steps}], goal } for the last N days (default 7).
 *  PUT  → upsert a day's step total (from the device pedometer). Uses GREATEST
 *         so a re-subscribe / lower live count never overwrites the day's peak.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Math.min(Math.max(Number.isFinite(raw) ? raw : 7, 1), 31);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);

  const [rows, [profile]] = await Promise.all([
    db
      .select({ date: stepLog.loggedDate, steps: stepLog.steps })
      .from(stepLog)
      .where(and(eq(stepLog.userId, userId), gte(stepLog.loggedDate, startStr)))
      .orderBy(desc(stepLog.loggedDate)),
    db
      .select({ stepGoal: profiles.stepGoal })
      .from(profiles)
      .where(eq(profiles.userId, userId)),
  ]);

  return Response.json({ days: rows, goal: profile?.stepGoal ?? 10000 });
});

const bodySchema = z.object({
  loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).max(300000),
});

export const PUT = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid steps" }, { status: 400 });
  }
  const { loggedDate, steps } = parsed.data;

  await db
    .insert(stepLog)
    .values({ userId, loggedDate, steps })
    .onConflictDoUpdate({
      target: [stepLog.userId, stepLog.loggedDate],
      set: { steps: sql`greatest(${stepLog.steps}, ${steps})`, updatedAt: new Date() },
    });

  return Response.json({ ok: true });
});

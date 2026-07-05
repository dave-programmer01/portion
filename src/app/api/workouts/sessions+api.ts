import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  setLog,
  workoutDay,
  workoutPlan,
  workoutSession,
} from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Start (or resume) a workout session for a given day. If an unfinished session
 * for that day already exists today we return it instead of creating a new one,
 * so backgrounding and reopening mid-workout keeps your logged sets.
 */
const bodySchema = z.object({
  dayId: z.string().uuid(),
  loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }
  const { dayId, loggedDate } = parsed.data;

  // Ownership: the day's plan must belong to the user.
  const [row] = await db
    .select({ day: workoutDay, planUser: workoutPlan.userId })
    .from(workoutDay)
    .innerJoin(workoutPlan, eq(workoutPlan.id, workoutDay.planId))
    .where(eq(workoutDay.id, dayId));
  if (!row || row.planUser !== userId) {
    return Response.json({ error: "Day not found" }, { status: 404 });
  }

  // Resume an in-progress session for this day today, if any.
  const [existing] = await db
    .select()
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(workoutSession.dayId, dayId),
        eq(workoutSession.loggedDate, loggedDate),
        isNull(workoutSession.completedAt),
      ),
    );

  if (existing) {
    const sets = await db
      .select()
      .from(setLog)
      .where(eq(setLog.sessionId, existing.id));
    return Response.json({ session: existing, sets });
  }

  const [session] = await db
    .insert(workoutSession)
    .values({ userId, dayId, loggedDate })
    .returning();

  // Pre-create one set-log row per target set so the UI just fills them in.
  const rows = row.day.exercises.flatMap((ex) =>
    Array.from({ length: ex.sets }, (_, i) => ({
      sessionId: session.id,
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      setIndex: i,
      targetReps: ex.reps,
    })),
  );
  const sets = rows.length
    ? await db.insert(setLog).values(rows).returning()
    : [];

  return Response.json({ session, sets });
});

import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { setLog, workoutSession } from "@/db/schema";
import { requireUser, route, HttpError } from "@/server/auth";

/**
 * Update a live session: log reps/weight, tick sets complete, and finish the
 * session. Only the owner can touch it, and set rows must belong to the session.
 */
const setSchema = z.object({
  id: z.string().uuid(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  completed: z.boolean().optional(),
});
const patchSchema = z.object({
  sets: z.array(setSchema).optional(),
  completed: z.boolean().optional(),
});

function idFrom(request: Request): string {
  const id = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Bad id");
  return id;
}

async function requireOwnedSession(request: Request, userId: string) {
  const id = idFrom(request);
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, id), eq(workoutSession.userId, userId)));
  if (!session) throw new HttpError(404, "Session not found");
  return session;
}

export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const session = await requireOwnedSession(request, userId);
  const sets = await db
    .select()
    .from(setLog)
    .where(eq(setLog.sessionId, session.id));
  return Response.json({ session, sets });
});

export const PATCH = route(async (request) => {
  const userId = await requireUser(request);
  const session = await requireOwnedSession(request, userId);
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid update" }, { status: 400 });
  }

  for (const s of parsed.data.sets ?? []) {
    const patch: Partial<typeof setLog.$inferInsert> = {};
    if (s.reps !== undefined) patch.reps = s.reps;
    if (s.weightKg !== undefined) patch.weightKg = s.weightKg;
    if (s.completed !== undefined) patch.completed = s.completed;
    if (Object.keys(patch).length === 0) continue;
    // Scope the update to this session so a caller can't edit foreign set rows.
    await db
      .update(setLog)
      .set(patch)
      .where(and(eq(setLog.id, s.id), eq(setLog.sessionId, session.id)));
  }

  if (parsed.data.completed) {
    await db
      .update(workoutSession)
      .set({ completedAt: new Date() })
      .where(eq(workoutSession.id, session.id));
  }

  const [fresh] = await db
    .select()
    .from(workoutSession)
    .where(eq(workoutSession.id, session.id));
  const sets = await db
    .select()
    .from(setLog)
    .where(eq(setLog.sessionId, session.id));
  return Response.json({ session: fresh, sets });
});

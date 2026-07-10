import { desc, eq, isNotNull, and } from "drizzle-orm";

import { db } from "@/db";
import { workoutSession } from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Suggest a reminder time from when the user usually trains. Session start times
 * are stored in UTC, so the client passes its timezone offset (`tz`, minutes of
 * UTC − local, from `Date.getTimezoneOffset()`) and we return the median local
 * start time rounded to 15 minutes. Needs a few sessions before we suggest.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const tzRaw = Number(new URL(request.url).searchParams.get("tz"));
  const offset = Number.isFinite(tzRaw) ? tzRaw : 0;

  const rows = await db
    .select({ startedAt: workoutSession.startedAt })
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.userId, userId),
        isNotNull(workoutSession.startedAt),
      ),
    )
    .orderBy(desc(workoutSession.startedAt))
    .limit(60);

  // Local minutes-of-day for each session start.
  const mins = rows
    .map((r) => r.startedAt)
    .filter((d): d is Date => d instanceof Date)
    .map((d) => {
      const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
      return (((utcMin - offset) % 1440) + 1440) % 1440;
    });

  if (mins.length < 3) {
    return Response.json({ hour: null, sampleSize: mins.length });
  }

  mins.sort((a, b) => a - b);
  const median = mins[Math.floor(mins.length / 2)];
  const rounded = (Math.round(median / 15) * 15) % 1440;

  return Response.json({
    hour: Math.floor(rounded / 60),
    minute: rounded % 60,
    sampleSize: mins.length,
  });
});

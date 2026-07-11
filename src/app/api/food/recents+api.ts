import { db } from "@/db";
import { requireUser, route } from "@/server/auth";
import { getRecentFoods } from "@/server/food";

/**
 * Recently-logged foods for one-tap re-logging. People eat the same things most
 * days, so surfacing recents on the log chooser kills the biggest source of
 * logging fatigue. The query/dedup logic lives in `getRecentFoods` so it's
 * integration-tested against a real Postgres engine.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const recents = await getRecentFoods(db, userId);
  return Response.json({ recents });
});

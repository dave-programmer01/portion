import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { pushTokens } from "@/db/schema";
import { requireUser, route } from "@/server/auth";

/**
 * Device push-token registry.
 *  POST   → register/refresh this device's Expo push token for the user.
 *  DELETE → remove a token (user turned notifications off, or signed out).
 * A token is unique across the table, so re-registering it on a new account
 * reassigns it rather than duplicating.
 */

const bodySchema = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(["ios", "android"]).optional(),
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }
  const { token, platform } = parsed.data;
  const now = new Date();
  await db
    .insert(pushTokens)
    .values({ userId, token, platform, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId, platform, updatedAt: now },
    });
  return Response.json({ ok: true });
});

export const DELETE = route(async (request) => {
  const userId = await requireUser(request);
  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
  }
  return Response.json({ ok: true });
});

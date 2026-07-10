import { and, eq, isNotNull } from "drizzle-orm";
import { createClerkClient } from "@clerk/backend";

import { db } from "@/db";
import { users, foodEntry } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { deleteImageKitFiles } from "@/server/imagekit";

/**
 * In-app account deletion (App Store requirement). Removes the user's meal
 * photos from ImageKit, then removes all Neon data by deleting the `users` row —
 * every user-scoped table cascades from it — then deletes the Clerk user so the
 * identity is gone too. The client signs out afterwards and lands on the auth
 * screen.
 */
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
});

export const DELETE = route(async (request) => {
  const userId = await requireUser(request);

  // Delete meal photos from ImageKit before we lose the fileIds to the cascade.
  // Best-effort: image-deletion failures must not block account deletion.
  const photos = await db
    .select({ fileId: foodEntry.imageFileId })
    .from(foodEntry)
    .where(and(eq(foodEntry.userId, userId), isNotNull(foodEntry.imageFileId)));
  await deleteImageKitFiles(photos.map((p) => p.fileId!).filter(Boolean));

  // Wipe Neon (cascades profiles, food, workouts, weight, etc.).
  await db.delete(users).where(eq(users.id, userId));

  // Then remove the Clerk identity. If this fails the row is already gone and
  // the stale Clerk session will 401 on next use, so the user is still locked out.
  try {
    await clerk.users.deleteUser(userId);
  } catch (err) {
    console.error("[account] Clerk deleteUser failed", err);
  }

  return new Response(null, { status: 204 });
});

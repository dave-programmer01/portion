import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, users } from "@/db/schema";
import { deleteImageKitFiles } from "@/server/imagekit";

import { inngest, USER_DELETED_EVENT, type ClerkDeletedUser } from "../client";

/**
 * Consumes `clerk/user.deleted` and removes the user from Neon. Clerk's delete
 * payload is minimal (just the id), so we key off that. Deleting a row that's
 * already gone is a no-op, which keeps this idempotent on retries.
 *
 * We also purge the user's meal photos from ImageKit first — the in-app
 * deletion path (`/api/account`) does this, and a user removed from the Clerk
 * dashboard must not leave orphaned images behind (our privacy policy promises
 * their data is erased).
 */
export const deleteUser = inngest.createFunction(
  {
    id: "delete-clerk-user",
    name: "Delete Clerk user from Neon",
    triggers: [{ event: USER_DELETED_EVENT }],
  },
  async ({ event, step }) => {
    const user = event.data as ClerkDeletedUser;

    if (!user.id) {
      // Nothing to key the delete off of — surface it in the dev dashboard.
      throw new Error("Clerk user.deleted event had no id");
    }

    const userId = user.id;

    // Delete meal photos before the DB cascade drops the fileIds. Best-effort:
    // ImageKit failures must not block erasing the user's data.
    await step.run("delete-imagekit-photos", async () => {
      const photos = await db
        .select({ fileId: foodEntry.imageFileId })
        .from(foodEntry)
        .where(
          and(eq(foodEntry.userId, userId), isNotNull(foodEntry.imageFileId)),
        );
      await deleteImageKitFiles(photos.map((p) => p.fileId!).filter(Boolean));
      return { count: photos.length };
    });

    await step.run("delete-user", async () => {
      await db.delete(users).where(eq(users.id, userId));
    });

    return { userId };
  },
);

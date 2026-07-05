import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { inngest, USER_DELETED_EVENT, type ClerkDeletedUser } from "../client";

/**
 * Consumes `clerk/user.deleted` and removes the user from Neon. Clerk's delete
 * payload is minimal (just the id), so we key off that. Deleting a row that's
 * already gone is a no-op, which keeps this idempotent on retries.
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

    await step.run("delete-user", async () => {
      await db.delete(users).where(eq(users.id, userId));
    });

    return { userId };
  },
);

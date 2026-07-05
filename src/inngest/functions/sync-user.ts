import { db } from "@/db";
import { users } from "@/db/schema";

import {
  inngest,
  USER_CREATED_EVENT,
  USER_UPDATED_EVENT,
  type ClerkUser,
} from "../client";

/**
 * Consumes `clerk/user.created` + `clerk/user.updated` and upserts the user into
 * Neon. One upsert handles both cases and stays idempotent, so re-sent webhooks
 * or out-of-order created/updated delivery both converge to the latest state.
 */
export const syncUser = inngest.createFunction(
  {
    id: "sync-clerk-user",
    name: "Sync Clerk user to Neon",
    triggers: [{ event: USER_CREATED_EVENT }, { event: USER_UPDATED_EVENT }],
  },
  async ({ event, step }) => {
    const user = event.data as ClerkUser;

    const email =
      user.email_addresses.find((e) => e.id === user.primary_email_address_id)
        ?.email_address ?? user.email_addresses[0]?.email_address;

    if (!email) {
      // No email means nothing to key auth off of — fail loudly so it shows up
      // in the Inngest dev dashboard rather than silently writing a bad row.
      throw new Error(`Clerk user ${user.id} has no email address`);
    }

    await step.run("upsert-user", async () => {
      await db
        .insert(users)
        .values({
          id: user.id,
          email,
          firstName: user.first_name,
          lastName: user.last_name,
          imageUrl: user.image_url,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            firstName: user.first_name,
            lastName: user.last_name,
            imageUrl: user.image_url,
            updatedAt: new Date(),
          },
        });
    });

    return { userId: user.id, email };
  },
);

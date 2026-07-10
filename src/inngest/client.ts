import { Inngest } from "inngest";

/**
 * The subset of Clerk's `user.created` payload we care about. Clerk sends a lot
 * more; we only type what the sync job reads. Mirrors the webhook `data` object.
 */
export type ClerkUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
};

/**
 * `user.deleted` carries a minimal "deleted object" — just the id (and it can be
 * absent if the user was already gone), never the full user record.
 */
export type ClerkDeletedUser = {
  id?: string;
  deleted: boolean;
  object: "user";
};

/** Event name constants so producer (webhook) and consumers (functions) agree. */
export const USER_CREATED_EVENT = "clerk/user.created" as const;
export const USER_UPDATED_EVENT = "clerk/user.updated" as const;
export const USER_DELETED_EVENT = "clerk/user.deleted" as const;

/**
 * Inngest client. Auto-switches between the local dev server and Inngest Cloud:
 * when `INNGEST_SIGNING_KEY` is set (production) the SDK signs requests and uses
 * Cloud; otherwise it uses the keyless local dev server.
 */
export const inngest = new Inngest({
  id: "portion",
  // Production (NODE_ENV=production, INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY set)
  // uses Inngest Cloud and signs requests; anything else uses the keyless local
  // dev server. Keyed off NODE_ENV so a local `.env` flag can't leak into a deploy.
  isDev: process.env.NODE_ENV !== "production",
});

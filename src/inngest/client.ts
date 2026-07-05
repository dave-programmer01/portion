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
 * Dev-only client. With `isDev: true` the SDK talks to the local Inngest dev
 * server and skips request signing — so no INNGEST_EVENT_KEY /
 * INNGEST_SIGNING_KEY are needed. Set keys + drop `isDev` for production.
 */
export const inngest = new Inngest({
  id: "portion",
  isDev: true,
});

import { Webhook } from "svix";

import {
  inngest,
  USER_CREATED_EVENT,
  USER_UPDATED_EVENT,
  USER_DELETED_EVENT,
  type ClerkUser,
  type ClerkDeletedUser,
} from "@/inngest/client";

// Clerk signs webhooks with Svix. In dev, point a Clerk webhook endpoint (via
// your ngrok URL) at `POST /api/webhooks/clerk` and subscribe to the `user.*`
// events. We verify the signature, then hand the payload to Inngest and return
// fast — all DB work happens in the background jobs so Clerk gets a quick 2xx.
type ClerkWebhookEvent =
  | { type: "user.created" | "user.updated"; data: ClerkUser }
  | { type: "user.deleted"; data: ClerkDeletedUser }
  | { type: string; data: unknown };

export async function POST(request: Request) {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    return Response.json(
      { error: "CLERK_WEBHOOK_SIGNING_SECRET is not set" },
      { status: 500 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing Svix headers" }, { status: 400 });
  }

  // Signature is computed over the raw body, so read text (not json).
  const body = await request.text();

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(signingSecret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "user.created":
      await inngest.send({ name: USER_CREATED_EVENT, data: event.data });
      break;
    case "user.updated":
      await inngest.send({ name: USER_UPDATED_EVENT, data: event.data });
      break;
    case "user.deleted":
      await inngest.send({ name: USER_DELETED_EVENT, data: event.data });
      break;
    // Other event types (sessions, orgs, …) are acked but not forwarded.
  }

  // Ack every event we recognise the signature for, even unhandled types, so
  // Clerk doesn't retry things we're intentionally ignoring.
  return Response.json({ received: true });
}

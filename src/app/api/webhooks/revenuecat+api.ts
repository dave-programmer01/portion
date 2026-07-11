import { inngest } from "@/inngest/client";
import { TIER_UPDATE_EVENT } from "@/config";
import { tierForRcEvent } from "@/lib/billing-events";

/**
 * RevenueCat webhook → tier sync. RevenueCat POSTs subscription lifecycle
 * events; we authenticate with the shared secret configured in the RevenueCat
 * dashboard (sent as the `Authorization` header), map the event to a tier, and
 * hand off to Inngest so the DB write happens in the background and RC gets a
 * fast 2xx. `app_user_id` is the Clerk user id (set via Purchases.logIn).
 *
 * The event→tier mapping lives in `@/lib/billing-events` so it's unit-tested.
 */

type RcEvent = {
  event?: {
    type?: string;
    app_user_id?: string;
    expiration_at_ms?: number | null;
  };
};

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret) {
    return Response.json(
      { error: "REVENUECAT_WEBHOOK_AUTH is not set" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as RcEvent;
  const ev = body.event;
  const userId = ev?.app_user_id;
  const type = ev?.type ?? "";

  const decision = tierForRcEvent(type);
  if (userId && decision.changes) {
    await inngest.send({
      name: TIER_UPDATE_EVENT,
      data: {
        userId,
        tier: decision.tier,
        expiresAt: ev?.expiration_at_ms ?? null,
      },
    });
  }

  // Ack everything we authenticate so RC doesn't retry ignored event types.
  return Response.json({ received: true });
}

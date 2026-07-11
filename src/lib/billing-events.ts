/**
 * Pure mapping from a RevenueCat webhook event type to the tier change it should
 * produce. Kept out of the route handler so the money-critical decision — which
 * events grant vs. revoke premium — is unit-testable without HTTP/DB/Inngest.
 *
 * Cancellation / billing-issue events are intentionally NOT terminal: access
 * lasts until the subscription actually expires (EXPIRATION).
 */

export type Tier = "premium" | "free";

export type TierDecision =
  | { changes: false }
  | { changes: true; tier: Tier };

const GRANTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
]);
const REVOKES = new Set(["EXPIRATION"]);

export function tierForRcEvent(type: string): TierDecision {
  if (GRANTS.has(type)) return { changes: true, tier: "premium" };
  if (REVOKES.has(type)) return { changes: true, tier: "free" };
  // Cancellation, billing issues, transfers, test events, etc. — acknowledge
  // but don't touch the user's tier.
  return { changes: false };
}

import { setTier } from "@/server/billing";
import { TIER_UPDATE_EVENT } from "@/config";
import type { Tier } from "@/db/schema";

import { inngest } from "../client";

type TierEvent = { userId: string; tier: Tier; expiresAt: number | null };

/**
 * Applies a RevenueCat-driven tier change to Neon. Kept idempotent (a plain
 * upsert of the tier) so replayed/duplicate webhooks converge to the same state.
 */
export const updateTier = inngest.createFunction(
  {
    id: "update-user-tier",
    name: "Update user tier from RevenueCat",
    triggers: [{ event: TIER_UPDATE_EVENT }],
  },
  async ({ event, step }) => {
    const { userId, tier, expiresAt } = event.data as TierEvent;
    await step.run("set-tier", async () => {
      await setTier(userId, tier, expiresAt ? new Date(expiresAt) : null);
    });
    return { userId, tier };
  },
);

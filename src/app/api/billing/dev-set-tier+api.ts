import { z } from "zod";

import { requireUser, route } from "@/server/auth";
import { setTier } from "@/server/billing";
import { config } from "@/config";

/**
 * Dev-only tier toggle used by the paywall's mock-upgrade button while
 * RevenueCat isn't wired. Disabled once real keys are present (`revenuecat.
 * enabled`), so it can never flip tiers in production.
 */
const bodySchema = z.object({ tier: z.enum(["free", "premium"]) });

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  if (config.revenuecat.enabled) {
    return Response.json(
      { error: "Not available — purchases are live." },
      { status: 403 },
    );
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid tier" }, { status: 400 });
  }
  await setTier(userId, parsed.data.tier, null);
  return Response.json({ tier: parsed.data.tier });
});

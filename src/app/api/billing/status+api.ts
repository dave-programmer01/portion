import { requireUser, route } from "@/server/auth";
import { getUserTier, photoScansToday } from "@/server/billing";
import { config } from "@/config";

/**
 * Billing snapshot for the client: current tier + today's scan usage + policy
 * limits, so the UI can show "2 of 3 scans left", gate features, and decide
 * whether to present the paywall.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const today = new Date().toISOString().slice(0, 10);
  const [tier, scansToday] = await Promise.all([
    getUserTier(userId),
    photoScansToday(userId, today),
  ]);
  const scanLimit = config.freeScansPerDay;
  return Response.json({
    tier,
    scansToday,
    scanLimit,
    scansRemaining: tier === "premium" ? null : Math.max(0, scanLimit - scansToday),
    historyFreeDays: config.historyFreeDays,
    prices: config.prices,
    revenueCatEnabled: config.revenuecat.enabled,
  });
});

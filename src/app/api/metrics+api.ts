import { route } from "@/server/auth";
import { monthToDateSpendUsd, scansTodayGlobal } from "@/server/billing";
import { config } from "@/config";

/**
 * Ops metrics: today's global scan count + month-to-date AI spend against the
 * ceiling. Guarded by a shared admin secret (set `ADMIN_METRICS_SECRET`); if
 * unset, the endpoint is disabled so it can't leak aggregates.
 */
export const GET = route(async (request) => {
  const secret = process.env.ADMIN_METRICS_SECRET;
  if (!secret) return Response.json({ error: "Not found" }, { status: 404 });
  if (request.headers.get("x-admin-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [scansToday, monthSpendUsd] = await Promise.all([
    scansTodayGlobal(today),
    monthToDateSpendUsd(),
  ]);
  const ceiling = config.monthlyAiSpendCeilingUsd;

  return Response.json({
    date: today,
    scansToday,
    monthSpendUsd: Math.round(monthSpendUsd * 10000) / 10000,
    ceilingUsd: ceiling,
    remainingUsd: Math.round((ceiling - monthSpendUsd) * 10000) / 10000,
    freeScansPaused: monthSpendUsd >= ceiling,
  });
});

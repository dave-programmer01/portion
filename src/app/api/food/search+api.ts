import { route } from "@/server/auth";
import { searchProducts } from "@/server/openfoodfacts";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { config } from "@/config";

/**
 * Free-text food search via Open Food Facts. Returns normalised per-100g rows.
 * Kept read-only (we don't cache every search hit to `foodMaster` — only
 * barcode lookups and confirmed logs get cached, per the plan's confidence gate).
 */
export const GET = route(async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  // Every search hits OFF, so rate-limit per IP before the outbound call.
  const rl = rateLimit(`off:${clientIp(request)}`, config.offLookupsPerMinute, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many lookups — please slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const results = await searchProducts(q, 20);
  return Response.json({ results });
});

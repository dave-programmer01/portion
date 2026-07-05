import { route } from "@/server/auth";
import { searchProducts } from "@/server/openfoodfacts";

/**
 * Free-text food search via Open Food Facts. Returns normalised per-100g rows.
 * Kept read-only (we don't cache every search hit to `foodMaster` — only
 * barcode lookups and confirmed logs get cached, per the plan's confidence gate).
 */
export const GET = route(async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });
  const results = await searchProducts(q, 20);
  return Response.json({ results });
});

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodMaster } from "@/db/schema";
import { route } from "@/server/auth";
import { lookupBarcode } from "@/server/openfoodfacts";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { config } from "@/config";

/**
 * Barcode → food. Checks the global `foodMaster` cache first; on a miss, hits
 * Open Food Facts and caches the result so the next scan is instant and free.
 * Returns per-100g macros + a default serving so the client can render a picker.
 */
export const GET = route(async (request) => {
  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) return Response.json({ error: "code required" }, { status: 400 });

  const [cached] = await db
    .select()
    .from(foodMaster)
    .where(eq(foodMaster.barcode, code));
  if (cached) return Response.json({ food: cached });

  // Cache miss → we're about to call OFF. Rate-limit per IP (cache hits above
  // are free and never counted).
  const rl = rateLimit(`off:${clientIp(request)}`, config.offLookupsPerMinute, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many lookups — please slow down.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const off = await lookupBarcode(code);
  if (!off) return Response.json({ food: null }, { status: 404 });

  const [saved] = await db
    .insert(foodMaster)
    .values({
      source: "off",
      barcode: off.barcode,
      name: off.name,
      brand: off.brand,
      caloriesPer100: off.caloriesPer100,
      proteinPer100: off.proteinPer100,
      carbsPer100: off.carbsPer100,
      fatPer100: off.fatPer100,
      defaultServingG: off.defaultServingG,
      servingLabel: off.servingLabel,
    })
    .returning();

  return Response.json({ food: saved });
});

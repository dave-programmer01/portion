/**
 * Estimate-based price source (Phase 1). Pure + offline: takes the curated
 * per-serving USD estimates on each catalog item and scales them by the region
 * multiplier from the device locale. No network, no AI, works everywhere — the
 * global floor that every richer price source degrades back to.
 */

import type { CatalogItem } from "../suggest";
import type { PriceContext, PricedFood, PriceSource } from "./types";

/** Round to cents so summed totals don't accumulate float noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const estimatedPriceSource: PriceSource = {
  kind: "estimate",
  price(foods: CatalogItem[], ctx: PriceContext): PricedFood[] {
    return foods.map((f) => ({
      name: f.name,
      emoji: f.emoji,
      calories: f.calories,
      proteinG: f.proteinG,
      cost: round2(f.costPerServingUsd * ctx.costMultiplier),
      currency: ctx.currency,
      source: "estimate",
    }));
  },
};

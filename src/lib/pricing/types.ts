/**
 * Pricing abstraction — the single seam that lets the budget optimizer stay the
 * same as our price data improves. Phase 1 ships `EstimatedPriceSource` (offline,
 * curated estimates × a coarse region multiplier). Later phases add
 * `CrowdPriceSource` (user-reported / Open Prices) and `RetailApiPriceSource`
 * (real per-store prices, resolved server-side) — each just produces the same
 * `PricedFood[]` shape the optimizer already consumes.
 */

import type { CatalogItem } from "../suggest";

export type PriceSourceKind = "estimate" | "crowd" | "retail";

/** A catalog food with a concrete, region-adjusted price attached. */
export type PricedFood = {
  name: string;
  emoji: string;
  calories: number;
  proteinG: number;
  /** Cost of one serving in `currency`, already region-adjusted. */
  cost: number;
  currency: string;
  source: PriceSourceKind;
};

/** Where the user is (drives currency + local cost level). */
export type PriceContext = {
  /** ISO 3166-1 alpha-2 region code, e.g. "US". */
  regionCode: string;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** Symbol for display, e.g. "$" (from the device locale). */
  currencySymbol: string;
  /** Cost-of-food multiplier vs. the US baseline (1.0). */
  costMultiplier: number;
};

export interface PriceSource {
  readonly kind: PriceSourceKind;
  /**
   * Attach prices to a list of catalog foods for the given context. Synchronous
   * for the estimate source (pure, offline); networked sources resolve their
   * data server-side and hand the resulting `PricedFood[]` to the optimizer.
   */
  price(foods: CatalogItem[], ctx: PriceContext): PricedFood[];
}

/**
 * Region + currency resolution for budget-aware eating. Pure (no expo import) so
 * it stays unit-testable: callers read `Localization.getLocales()[0]` on the
 * client and pass the raw fields in. Maps a device locale to a currency, a
 * display symbol, and a coarse cost-of-food multiplier from config.
 */

import { config } from "../config";
import type { PriceContext } from "./pricing/types";

/** Coarse cost-of-food multiplier for a region code (US baseline = 1.0). */
export function costMultiplierForRegion(
  regionCode: string | null | undefined,
): number {
  const m = config.budget.regionCostMultipliers;
  const key = (regionCode ?? "").toUpperCase();
  return m[key] ?? m.DEFAULT ?? 1;
}

/** The subset of `expo-localization`'s locale we actually need. */
export type LocaleInput = {
  regionCode?: string | null;
  currencyCode?: string | null;
  currencySymbol?: string | null;
};

/**
 * Build the pricing context for the user's locale. Everything degrades safely:
 * unknown region → multiplier 1.0, missing currency → the configured fallback,
 * missing symbol → the currency code itself.
 */
export function resolveBudgetContext(locale: LocaleInput | null | undefined): PriceContext {
  const regionCode = (locale?.regionCode ?? "").toUpperCase() || "US";
  const currency = locale?.currencyCode || config.budget.fallbackCurrency;
  const currencySymbol = locale?.currencySymbol || `${currency} `;
  return {
    regionCode,
    currency,
    currencySymbol,
    costMultiplier: costMultiplierForRegion(regionCode),
  };
}

/** Format an amount for display, e.g. "$5.80". Avoids Intl (patchy on Hermes). */
export function formatMoney(amount: number, currencySymbol: string): string {
  return `${currencySymbol}${amount.toFixed(2)}`;
}

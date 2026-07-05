import type { Tier } from "@/db/schema";

/**
 * Pure tier-gating rules (no DB / no network) so they're trivially unit-tested
 * and shared by server enforcement + client UI. All the "what can a free user
 * do" policy lives here in one place.
 */

/** Earliest date (YYYY-MM-DD) a tier may view; null = unlimited (premium). */
export function historyCutoff(
  tier: Tier,
  today: string,
  freeDays: number,
): string | null {
  if (tier === "premium") return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (freeDays - 1));
  return d.toISOString().slice(0, 10);
}

/** Whether a tier may view a given date's data. */
export function canViewDate(
  tier: Tier,
  date: string,
  today: string,
  freeDays: number,
): boolean {
  const cutoff = historyCutoff(tier, today, freeDays);
  return cutoff === null || date >= cutoff;
}

export type ScanDecision =
  | { allowed: true }
  | { allowed: false; reason: "daily_cap" | "spend_ceiling" };

/**
 * Can this user run an AI photo scan right now? Premium is always allowed.
 * Free users are blocked at the daily cap, and globally blocked once the
 * monthly AI spend ceiling is hit (barcode/search stay free — enforced by the
 * caller only gating the photo path).
 */
export function photoScanAllowed(input: {
  tier: Tier;
  scansToday: number;
  dailyLimit: number;
  monthSpendUsd: number;
  spendCeilingUsd: number;
}): ScanDecision {
  if (input.tier === "premium") return { allowed: true };
  if (input.monthSpendUsd >= input.spendCeilingUsd) {
    return { allowed: false, reason: "spend_ceiling" };
  }
  if (input.scansToday >= input.dailyLimit) {
    return { allowed: false, reason: "daily_cap" };
  }
  return { allowed: true };
}

/** Workout-plan capabilities per tier. */
export function planLimits(tier: Tier): {
  maxDaysPerWeek: number;
  canRegenerate: boolean;
} {
  return tier === "premium"
    ? { maxDaysPerWeek: 6, canRegenerate: true }
    : { maxDaysPerWeek: 3, canRegenerate: false };
}

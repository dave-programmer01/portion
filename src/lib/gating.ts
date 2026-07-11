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

/** Why an AI action was blocked. `daily_cap`/`needs_upgrade` → paywall (402);
 *  the rest are abuse/cost guards → rate-limited (429). */
export type BlockReason =
  | "daily_cap"
  | "needs_upgrade"
  | "spend_ceiling"
  | "abuse_cap"
  | "burst";
export type Decision = { allowed: true } | { allowed: false; reason: BlockReason };
// Back-compat alias.
export type ScanDecision = Decision;

/**
 * Can this user run an AI photo scan right now? Order matters — global + burst
 * guards apply to EVERY tier (premium included) so no single account can blow
 * the budget or script rapid-fire calls. Then the per-tier daily limit: a small
 * free cap, and a high premium "safety" cap that's invisible to real users.
 */
export function photoScanAllowed(input: {
  tier: Tier;
  scansToday: number;
  scansLastMinute: number;
  freeDailyLimit: number;
  premiumDailyLimit: number;
  burstPerMinute: number;
  monthSpendUsd: number;
  spendCeilingUsd: number;
}): Decision {
  // Hard global kill-switch — applies to premium too.
  if (input.monthSpendUsd >= input.spendCeilingUsd) {
    return { allowed: false, reason: "spend_ceiling" };
  }
  // Burst guard — any tier.
  if (input.scansLastMinute >= input.burstPerMinute) {
    return { allowed: false, reason: "burst" };
  }
  const limit =
    input.tier === "premium" ? input.premiumDailyLimit : input.freeDailyLimit;
  if (input.scansToday >= limit) {
    return {
      allowed: false,
      reason: input.tier === "premium" ? "abuse_cap" : "daily_cap",
    };
  }
  return { allowed: true };
}

/**
 * Can this user (re)generate a workout plan right now? Same global/burst guards,
 * then: free gets one plan (no regen → upgrade prompt); premium can regenerate
 * up to a high daily safety cap.
 */
export function workoutGenAllowed(input: {
  tier: Tier;
  hasActivePlan: boolean;
  gensToday: number;
  gensLastMinute: number;
  premiumDailyLimit: number;
  burstPerMinute: number;
  monthSpendUsd: number;
  spendCeilingUsd: number;
}): Decision {
  if (input.monthSpendUsd >= input.spendCeilingUsd) {
    return { allowed: false, reason: "spend_ceiling" };
  }
  if (input.gensLastMinute >= input.burstPerMinute) {
    return { allowed: false, reason: "burst" };
  }
  if (input.tier !== "premium") {
    return input.hasActivePlan
      ? { allowed: false, reason: "needs_upgrade" }
      : { allowed: true };
  }
  if (input.gensToday >= input.premiumDailyLimit) {
    return { allowed: false, reason: "abuse_cap" };
  }
  return { allowed: true };
}

/**
 * Workout-plan capabilities per tier. Everyone gets a full plan for the number
 * of days they chose at onboarding (up to 6) — crippling a free user's *first*
 * plan is a bad first impression. The premium hook is **regeneration /
 * customization** (re-roll, change focus), not a worse initial plan.
 */
export function planLimits(tier: Tier): {
  maxDaysPerWeek: number;
  canRegenerate: boolean;
} {
  return tier === "premium"
    ? { maxDaysPerWeek: 6, canRegenerate: true }
    : { maxDaysPerWeek: 6, canRegenerate: false };
}

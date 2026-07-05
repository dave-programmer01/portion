/**
 * Central config. Per the working agreement, model ids, limits, prices and the
 * spend ceiling are NEVER hardcoded at call sites — they live here and can be
 * overridden by env so we can tune them without a code change.
 *
 * Anything prefixed `EXPO_PUBLIC_` is safe to read on the client; everything
 * else is server-only (Inngest jobs / API routes).
 */

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  /**
   * AI provider + models. The stack targets Anthropic `claude-haiku-4-5`, but
   * we're running on OpenAI for the beta (only OPENAI_API_KEY is provisioned).
   * Kept behind config so swapping back is a one-line change + provider module.
   */
  ai: {
    provider: (process.env.AI_PROVIDER ?? "openai") as "openai" | "anthropic",
    visionModel: process.env.AI_VISION_MODEL ?? "gpt-4o-mini",
    textModel: process.env.AI_TEXT_MODEL ?? "gpt-4o-mini",
  },

  /** Downscale the longest edge to this before an AI vision call (cost control). */
  imageMaxPx: num(process.env.IMAGE_MAX_PX, 1024),

  /** Free-tier quota. Enforced server-side (Phase 4). */
  freeScansPerDay: num(process.env.FREE_SCANS_PER_DAY, 3),

  /** Free tier can view this many days of history; premium is unlimited. */
  historyFreeDays: num(process.env.HISTORY_FREE_DAYS, 7),

  /** Beta AI spend ceiling. Guardrail enforced in Phase 6. */
  monthlyAiSpendCeilingUsd: num(process.env.MONTHLY_AI_SPEND_CEILING_USD, 20),

  /**
   * RevenueCat. `enabled` flips on only when a public SDK key is present, so in
   * dev (no key) the paywall offers a mock upgrade and no native purchase runs.
   */
  revenuecat: {
    enabled: !!(
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ??
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    ),
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "",
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "",
    entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? "premium",
  },

  /** RevenueCat prices (display only; store is source of truth at purchase). */
  prices: {
    monthlyUsd: num(process.env.PRICE_MONTHLY_USD, 9.99),
    annualUsd: num(process.env.PRICE_ANNUAL_USD, 59.99),
    annualTrialDays: num(process.env.ANNUAL_TRIAL_DAYS, 7),
  },

  /**
   * Per-model AI pricing in USD per 1M tokens (input/output). Used to compute
   * `costUsd` on every call for the spend dashboard + ceiling. gpt-4o-mini
   * pricing as of 2025; override via env if it changes.
   */
  aiPricing: {
    "gpt-4o-mini": {
      inputPerM: num(process.env.PRICE_GPT4OMINI_IN, 0.15),
      outputPerM: num(process.env.PRICE_GPT4OMINI_OUT, 0.6),
    },
  } as Record<string, { inputPerM: number; outputPerM: number }>,
} as const;

/** USD cost of a call given its model + token usage. */
export function aiCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = config.aiPricing[model] ?? { inputPerM: 0, outputPerM: 0 };
  return (
    (promptTokens / 1_000_000) * p.inputPerM +
    (completionTokens / 1_000_000) * p.outputPerM
  );
}

/** Inngest event names — one source of truth for producers + consumers. */
export const PHOTO_ANALYZE_EVENT = "food/photo.uploaded" as const;
export const WORKOUT_GENERATE_EVENT = "workout/plan.requested" as const;
export const TIER_UPDATE_EVENT = "billing/tier.changed" as const;

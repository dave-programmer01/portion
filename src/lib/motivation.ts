/**
 * Motivation content — pure and dependency-free so BOTH the in-app Motivation
 * Center (client) and the engagement push cron (server/Inngest) can share the
 * exact same copy and card logic. No React, no SecureStore, no expo imports —
 * callers pass a plain context in. Fully unit-testable.
 *
 * Two things live here:
 *  1. `buildMotivationCards` — contextual cards from the user's real activity.
 *  2. Message pools (quotes + push copy) rotated deterministically by a seed.
 */

export type MotivationCard = {
  /** Stable within a day so "seen" tracking is deterministic. */
  id: string;
  kind:
    | "welcome_back"
    | "streak"
    | "log_reminder"
    | "budget"
    | "enable_notifs"
    | "quote";
  emoji: string;
  title: string;
  body: string;
  /** Optional deep-link action. `href` is an expo-router path. */
  cta?: { label: string; href: string };
  /** Higher = more important; the Center and the unread dot sort/gate on this. */
  priority: number;
};

export type MotivationContext = {
  /** Local date key, e.g. "2026-08-19" — used to make card ids stable per day. */
  today: string;
  streakDays: number;
  loggedToday: boolean;
  /** Whole days since the last food log; null = never logged. */
  daysSinceLastLog: number | null;
  /** Calories left for today, or null when targets aren't ready. */
  remainingCalories: number | null;
  hasBudget: boolean;
  notificationsEnabled: boolean;
  /** Rotates the quote of the day (e.g. day-of-year). */
  daySeed: number;
};

/** Curated motivational one-liners. Kept short — they read as a daily card. */
export const MOTIVATION_QUOTES: string[] = [
  "You don't have to be extreme, just consistent.",
  "Small plates, big results. One log at a time.",
  "The best workout is the one you actually do today.",
  "Progress is progress, no matter how small.",
  "Discipline is choosing what you want most over what you want now.",
  "You're not starting over. You're starting from experience.",
  "A little every day adds up to a lot.",
  "Fuel your body like it's the only one you've got. It is.",
  "Motivation gets you started; habit keeps you going.",
  "Don't count the days, make the days count.",
  "Strong isn't a look, it's a habit.",
  "One healthy choice always leads to another.",
  "Showing up is half the battle, and you're here.",
  "Cheap, simple, consistent beats fancy and abandoned.",
  "Your future self is watching, so make them proud.",
];

/** Deterministic quote for a given day seed. */
export function quoteOfTheDay(daySeed: number): string {
  const i =
    ((Math.trunc(daySeed) % MOTIVATION_QUOTES.length) +
      MOTIVATION_QUOTES.length) %
    MOTIVATION_QUOTES.length;
  return MOTIVATION_QUOTES[i];
}

/**
 * Build the Motivation Center feed from the user's activity. Ordered by priority
 * (most important first). The quote of the day is always appended last so the
 * feed is never empty.
 */
export function buildMotivationCards(ctx: MotivationContext): MotivationCard[] {
  const cards: MotivationCard[] = [];

  // Welcome-back — highest priority when the user has been away a couple of days.
  if (ctx.daysSinceLastLog != null && ctx.daysSinceLastLog >= 2) {
    cards.push({
      id: `welcome_back-${ctx.today}`,
      kind: "welcome_back",
      emoji: "👋",
      title: "Welcome back!",
      body: `It's been ${ctx.daysSinceLastLog} days. No guilt, just pick up where you left off. One quick log gets you rolling again.`,
      cta: { label: "Log a meal", href: "/log" },
      priority: 100,
    });
  }

  // Streak — celebrate momentum, or nudge to protect it.
  if (ctx.streakDays >= 2) {
    cards.push({
      id: `streak-${ctx.today}`,
      kind: "streak",
      emoji: "🔥",
      title: `${ctx.streakDays}-day streak`,
      body: ctx.loggedToday
        ? "Logged today, so your streak is safe. Keep the fire going!"
        : "Log something today to keep your streak alive.",
      cta: ctx.loggedToday ? undefined : { label: "Log now", href: "/log" },
      priority: 80,
    });
  }

  // Daily log reminder — the tiny-action half of the habit loop.
  if (!ctx.loggedToday) {
    const remaining = ctx.remainingCalories;
    cards.push({
      id: `log_reminder-${ctx.today}`,
      kind: "log_reminder",
      emoji: "🍽️",
      title: "Log today's meals",
      body:
        remaining != null && remaining > 0
          ? `You've got ${Math.round(remaining).toLocaleString()} kcal left today. Log what you've eaten to stay on track.`
          : "A few taps keeps your day accurate and your streak alive.",
      cta: { label: "Log now", href: "/log" },
      priority: 70,
    });
  }

  // Budget encouragement — only when the user opted into budget eating.
  if (ctx.hasBudget) {
    cards.push({
      id: `budget-${ctx.today}`,
      kind: "budget",
      emoji: "🪙",
      title: "Eat well for less today",
      body: "Your budget picks are ready on Home. Cheap, high-protein, and on target.",
      cta: { label: "See picks", href: "/home" },
      priority: 50,
    });
  }

  // Soft-ask to enable notifications — low priority, only when they're off.
  if (!ctx.notificationsEnabled) {
    cards.push({
      id: `enable_notifs-${ctx.today}`,
      kind: "enable_notifs",
      emoji: "🔔",
      title: "Never miss a day",
      body: "Turn on reminders and we'll nudge you to log and train, then welcome you back if life gets busy.",
      cta: { label: "Turn on reminders", href: "/reminders" },
      priority: 40,
    });
  }

  // Quote of the day — always present so the feed is never empty.
  cards.push({
    id: `quote-${ctx.today}`,
    kind: "quote",
    emoji: "💬",
    title: "Daily motivation",
    body: quoteOfTheDay(ctx.daySeed),
    priority: 10,
  });

  return cards.sort((a, b) => b.priority - a.priority);
}

// --- Server push copy (used by the engagement cron) ---

const WINBACK_PUSH: { title: string; body: string }[] = [
  {
    title: "We saved your spot 👋",
    body: "It only takes 30 seconds to log. Pick up right where you left off.",
  },
  {
    title: "Your goals miss you 💪",
    body: "One quick log today gets your momentum back. You've got this.",
  },
  {
    title: "Still here for you 🍎",
    body: "No streak to feel guilty about, just open Portion and log one thing.",
  },
  {
    title: "Small step, big difference",
    body: "A single log today beats a perfect plan tomorrow. Let's go.",
  },
];

/** Deterministic win-back push copy for a dormant user, rotated by a seed. */
export function winbackPush(seed: number): { title: string; body: string } {
  const i =
    ((Math.trunc(seed) % WINBACK_PUSH.length) + WINBACK_PUSH.length) %
    WINBACK_PUSH.length;
  return WINBACK_PUSH[i];
}

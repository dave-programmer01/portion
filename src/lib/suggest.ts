/**
 * Rules-based "what to eat next" suggestion — the app's wedge is telling
 * beginners what to do today, not handing them an empty diary. This is
 * deliberately NOT an AI call: it costs nothing, works offline, and picks from a
 * small curated catalog of common, beginner-friendly foods that fit the calories
 * the user has left and help close their biggest remaining macro gap (usually
 * protein). Macros are rough per-portion estimates; the user adjusts on log.
 */

import { config } from "../config";

export type FoodSuggestion = {
  name: string;
  emoji: string;
  calories: number;
  proteinG: number;
  /** Rough USD-per-serving estimate (US baseline; scale by region elsewhere). */
  costPerServingUsd: number;
  reason: string;
};

export type CatalogItem = {
  name: string;
  emoji: string;
  calories: number;
  proteinG: number;
  highProtein: boolean;
  /**
   * Rough US per-serving cost in USD. Curated content (like the macros), not a
   * config limit. Drives the budget optimizer's protein-per-dollar ranking —
   * see lib/budget-optimizer.ts. Keep every item > 0 (a test enforces this).
   */
  costPerServingUsd: number;
};

// Common, beginner-friendly foods from a range of cuisines (our users are
// global, so the catalog shouldn't be Western-only). Macros + costs are rough
// per-portion estimates the user adjusts on log — kept intentionally small.
// Costs are US-baseline; region scaling happens in lib/region.ts.
export const CATALOG: CatalogItem[] = [
  // High-protein options
  { name: "Greek yogurt & fruit", emoji: "🍓", calories: 150, proteinG: 15, highProtein: true, costPerServingUsd: 0.9 },
  { name: "Two boiled eggs", emoji: "🥚", calories: 140, proteinG: 12, highProtein: true, costPerServingUsd: 0.4 },
  { name: "Grilled chicken & rice", emoji: "🍗", calories: 450, proteinG: 38, highProtein: true, costPerServingUsd: 1.8 },
  { name: "Chicken thigh & rice", emoji: "🍗", calories: 500, proteinG: 35, highProtein: true, costPerServingUsd: 1.5 },
  { name: "Beans & rice", emoji: "🫘", calories: 380, proteinG: 20, highProtein: true, costPerServingUsd: 0.5 },
  { name: "Lentils & rice", emoji: "🍛", calories: 350, proteinG: 18, highProtein: true, costPerServingUsd: 0.45 },
  { name: "Lentils / dal", emoji: "🍲", calories: 230, proteinG: 18, highProtein: true, costPerServingUsd: 0.35 },
  { name: "Canned tuna", emoji: "🥫", calories: 120, proteinG: 26, highProtein: true, costPerServingUsd: 1.0 },
  { name: "Oats & milk", emoji: "🌾", calories: 300, proteinG: 14, highProtein: true, costPerServingUsd: 0.5 },
  { name: "Grilled fish & veg", emoji: "🐟", calories: 320, proteinG: 30, highProtein: true, costPerServingUsd: 3.0 },
  { name: "Tofu stir-fry", emoji: "🥢", calories: 300, proteinG: 20, highProtein: true, costPerServingUsd: 1.2 },
  { name: "Paneer & roti", emoji: "🧆", calories: 400, proteinG: 22, highProtein: true, costPerServingUsd: 1.3 },
  { name: "Chicken & plantain", emoji: "🍗", calories: 450, proteinG: 35, highProtein: true, costPerServingUsd: 1.6 },
  { name: "Protein shake", emoji: "🥤", calories: 160, proteinG: 25, highProtein: true, costPerServingUsd: 1.0 },
  { name: "Cottage cheese bowl", emoji: "🥣", calories: 180, proteinG: 20, highProtein: true, costPerServingUsd: 0.9 },
  // Lighter / snack options
  { name: "Hummus & pita", emoji: "🥙", calories: 280, proteinG: 10, highProtein: false, costPerServingUsd: 0.8 },
  { name: "Peanut butter toast", emoji: "🍞", calories: 250, proteinG: 10, highProtein: false, costPerServingUsd: 0.3 },
  { name: "Fruit & nuts", emoji: "🥭", calories: 200, proteinG: 6, highProtein: false, costPerServingUsd: 0.9 },
  { name: "Apple & peanut butter", emoji: "🍎", calories: 220, proteinG: 7, highProtein: false, costPerServingUsd: 0.45 },
  { name: "Handful of almonds", emoji: "🌰", calories: 170, proteinG: 6, highProtein: false, costPerServingUsd: 0.8 },
  { name: "Glass of milk", emoji: "🥛", calories: 120, proteinG: 8, highProtein: false, costPerServingUsd: 0.25 },
  { name: "Banana", emoji: "🍌", calories: 105, proteinG: 1, highProtein: false, costPerServingUsd: 0.25 },
];

/** Grams of protein per dollar — the budget optimizer's core ranking metric. */
export function proteinPerDollar(item: {
  proteinG: number;
  costPerServingUsd: number;
}): number {
  return item.costPerServingUsd > 0 ? item.proteinG / item.costPerServingUsd : 0;
}

/**
 * Pick one suggestion that fits the remaining calorie budget. When the user is
 * still well short on protein, prefer a high-protein option; otherwise pick the
 * item that best fills the remaining calories. Rotates by day so it isn't
 * identical every time. Returns null when the day's budget is essentially spent.
 */
export function suggestNextMeal(input: {
  remainingCalories: number;
  remainingProteinG: number;
  daySeed?: number;
}): FoodSuggestion | null {
  const { remainingCalories, remainingProteinG } = input;
  if (remainingCalories < config.suggest.minRemainingCalories) return null;

  const proteinFocused = remainingProteinG > config.suggest.proteinGapThresholdG;
  // Allow a little headroom over the exact remaining budget.
  const fits = CATALOG.filter(
    (f) => f.calories <= remainingCalories + config.suggest.calorieHeadroom,
  );
  const pool = (fits.length ? fits : CATALOG).filter(
    (f) => !proteinFocused || f.highProtein,
  );
  const candidates = pool.length ? pool : CATALOG;

  const ranked = [...candidates].sort((a, b) =>
    proteinFocused
      ? b.proteinG - a.proteinG
      : Math.abs(a.calories - remainingCalories) -
        Math.abs(b.calories - remainingCalories),
  );

  // Rotate among the top few so the card feels fresh across days.
  const top = ranked.slice(0, config.suggest.rotationTop);
  const seed = input.daySeed ?? 0;
  const pick = top[seed % top.length] ?? ranked[0];
  if (!pick) return null;

  return {
    name: pick.name,
    emoji: pick.emoji,
    calories: pick.calories,
    proteinG: pick.proteinG,
    costPerServingUsd: pick.costPerServingUsd,
    reason: proteinFocused
      ? `~${pick.proteinG}g protein to hit your target`
      : `~${pick.calories} kcal to round out your day`,
  };
}

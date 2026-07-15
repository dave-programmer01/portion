/**
 * Budget optimizer — "eat well on what you can afford". Given a day's calorie +
 * protein targets, a per-day money budget, and a list of region-priced foods,
 * greedily assembles a day of eating that maximises protein-per-dollar without
 * exceeding the budget or the calorie ceiling. This is the classic *diet
 * problem*: deterministic, offline, NO AI — so it never touches the spend
 * ceiling, and it's identical regardless of where the prices came from (see
 * lib/pricing). Builds on the same philosophy as lib/suggest.ts.
 */

import { config } from "../config";
import { proteinPerDollar } from "./suggest";
import type { PricedFood } from "./pricing/types";

export type BudgetTargets = { calories: number; proteinG: number };

/** One line in a budget day — a food plus how many servings of it to buy. */
export type BudgetDayItem = {
  food: PricedFood;
  servings: number;
  cost: number;
  calories: number;
  proteinG: number;
};

export type BudgetDay = {
  items: BudgetDayItem[];
  totalCost: number;
  totalCalories: number;
  totalProteinG: number;
  budget: number;
  currency: string;
  currencySymbol: string;
  /** Fraction of the protein target the plan reaches (0..1, clamped). */
  proteinCoverage: number;
  /** True once the plan covers the configured share of the protein target. */
  meetsProtein: boolean;
  /** True when nothing was affordable at all (budget below the cheapest food). */
  empty: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Greedily build the day. At each step, among the foods we can still afford that
 * keep us under the calorie ceiling, pick the highest protein-per-dollar (ties
 * broken toward fewer calories, then name for determinism). Repeat until the
 * protein goal is met, the budget/calorie room runs out, or the item caps hit.
 */
export function planBudgetDay(input: {
  targets: BudgetTargets;
  budget: number;
  foods: PricedFood[];
  currencySymbol?: string;
}): BudgetDay {
  const { targets, budget, foods } = input;
  const currency = foods[0]?.currency ?? config.budget.fallbackCurrency;
  const currencySymbol = input.currencySymbol ?? `${currency} `;

  const proteinGoal = targets.proteinG * config.budget.proteinTargetCoverage;
  const calorieCeiling = targets.calories + config.suggest.calorieHeadroom;

  // Priceable foods only; sort once for a stable, deterministic search order.
  const priceable = foods
    .filter((f) => f.cost > 0)
    .sort(
      (a, b) =>
        proteinPerDollar({ proteinG: b.proteinG, costPerServingUsd: b.cost }) -
          proteinPerDollar({
            proteinG: a.proteinG,
            costPerServingUsd: a.cost,
          }) ||
        a.calories - b.calories ||
        a.name.localeCompare(b.name),
    );

  const counts = new Map<string, number>();
  let totalCost = 0;
  let totalCalories = 0;
  let totalProteinG = 0;

  while (totalProteinG < proteinGoal) {
    const distinct = counts.size;
    let pick: PricedFood | null = null;
    for (const f of priceable) {
      const used = counts.get(f.name) ?? 0;
      if (used >= config.budget.maxServingsPerItem) continue;
      if (used === 0 && distinct >= config.budget.maxItems) continue;
      if (round2(totalCost + f.cost) > budget) continue;
      if (totalCalories + f.calories > calorieCeiling) continue;
      pick = f; // priceable is pre-sorted, so the first fit is the best fit
      break;
    }
    if (!pick) break;
    counts.set(pick.name, (counts.get(pick.name) ?? 0) + 1);
    totalCost = round2(totalCost + pick.cost);
    totalCalories += pick.calories;
    totalProteinG += pick.proteinG;
  }

  // Materialise grouped line items in priceable (ranked) order.
  const items: BudgetDayItem[] = [];
  for (const f of priceable) {
    const servings = counts.get(f.name) ?? 0;
    if (servings <= 0) continue;
    items.push({
      food: f,
      servings,
      cost: round2(f.cost * servings),
      calories: f.calories * servings,
      proteinG: f.proteinG * servings,
    });
  }

  const proteinCoverage =
    targets.proteinG > 0
      ? Math.min(1, totalProteinG / targets.proteinG)
      : 0;

  return {
    items,
    totalCost,
    totalCalories,
    totalProteinG,
    budget,
    currency,
    currencySymbol,
    proteinCoverage,
    meetsProtein: totalProteinG >= proteinGoal,
    empty: items.length === 0,
  };
}

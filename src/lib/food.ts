import { macrosForGrams } from "./nutrition";
import type { MealType } from "@/db/schema";

/**
 * Client-side food helpers shared by the log-flow screens. Kept free of native
 * imports so it's easy to reason about the macro math in one place.
 */

/** A per-100g food (from barcode/search or the cache) we can log. */
export type FoodMasterLite = {
  id?: string;
  name: string;
  brand?: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultServingG?: number | null;
  servingLabel?: string | null;
};

/** Shape POSTed to /api/food/entries. */
export type LogItem = {
  name: string;
  brand?: string | null;
  quantity: number;
  unit: string;
  servingLabel?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  foodMasterId?: string | null;
};

/** Build a loggable item from a per-100g food scaled to a gram amount. */
export function itemFromMaster(food: FoodMasterLite, grams: number): LogItem {
  const m = macrosForGrams(
    {
      calories: food.caloriesPer100,
      proteinG: food.proteinPer100,
      carbsG: food.carbsPer100,
      fatG: food.fatPer100,
    },
    grams,
  );
  return {
    name: food.name,
    brand: food.brand ?? null,
    quantity: grams,
    unit: "g",
    servingLabel: food.servingLabel ?? null,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    foodMasterId: food.id ?? null,
  };
}

export const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: "breakfast", label: "Breakfast", emoji: "🍳" },
  { value: "lunch", label: "Lunch", emoji: "🥗" },
  { value: "dinner", label: "Dinner", emoji: "🍽️" },
  { value: "snack", label: "Snack", emoji: "🍎" },
];

/** Sensible default meal based on local time of day. */
export function defaultMeal(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

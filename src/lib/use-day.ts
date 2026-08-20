import { useEffect } from "react";

import { useApi, useFetch } from "./api";
import type {
  FoodEntry,
  FoodItem,
  MealType,
  NutritionTargets,
} from "@/db/schema";

/** One day's food log + targets, as returned by /api/food/day. */
export type DayEntry = FoodEntry & { items: FoodItem[] };
export type DayData = {
  date: string;
  targets: NutritionTargets | null;
  entries: DayEntry[];
};

export type DayTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * Load a day's food log. While any entry is still `pending` (a photo being
 * analyzed) we poll so the optimistic "analyzing…" card flips to real macros
 * without the user pulling to refresh.
 */
export function useDay(date: string) {
  const { request } = useApi();
  const query = useFetch(
    () => request<DayData>(`/api/food/day?date=${date}`),
    [date],
  );

  const hasPending = query.data?.entries.some((e) => e.status === "pending");
  const { refetch } = query;
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => void refetch({ background: true }), 4000);
    return () => clearInterval(id);
  }, [hasPending, refetch]);

  return query;
}

/** Sum the day's entries into a single macro total. */
export function dayTotals(entries: DayEntry[]): DayTotals {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.totalCalories,
      proteinG: acc.proteinG + e.totalProteinG,
      carbsG: acc.carbsG + e.totalCarbsG,
      fatG: acc.fatG + e.totalFatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Group entries by meal type, preserving a stable meal order. */
export function groupByMeal(entries: DayEntry[]): Record<MealType, DayEntry[]> {
  const groups: Record<MealType, DayEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of entries) groups[e.mealType].push(e);
  return groups;
}

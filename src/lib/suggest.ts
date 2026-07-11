/**
 * Rules-based "what to eat next" suggestion — the app's wedge is telling
 * beginners what to do today, not handing them an empty diary. This is
 * deliberately NOT an AI call: it costs nothing, works offline, and picks from a
 * small curated catalog of common, beginner-friendly foods that fit the calories
 * the user has left and help close their biggest remaining macro gap (usually
 * protein). Macros are rough per-portion estimates; the user adjusts on log.
 */

export type FoodSuggestion = {
  name: string;
  emoji: string;
  calories: number;
  proteinG: number;
  reason: string;
};

type CatalogItem = {
  name: string;
  emoji: string;
  calories: number;
  proteinG: number;
  highProtein: boolean;
};

// Common, beginner-friendly foods from a range of cuisines (our users are
// global, so the catalog shouldn't be Western-only). Macros are rough
// per-portion estimates the user adjusts on log — kept intentionally small.
const CATALOG: CatalogItem[] = [
  // High-protein options
  { name: "Greek yogurt & fruit", emoji: "🍓", calories: 150, proteinG: 15, highProtein: true },
  { name: "Two boiled eggs", emoji: "🥚", calories: 140, proteinG: 12, highProtein: true },
  { name: "Grilled chicken & rice", emoji: "🍗", calories: 450, proteinG: 38, highProtein: true },
  { name: "Beans & rice", emoji: "🫘", calories: 380, proteinG: 20, highProtein: true },
  { name: "Lentils & rice", emoji: "🍛", calories: 350, proteinG: 18, highProtein: true },
  { name: "Grilled fish & veg", emoji: "🐟", calories: 320, proteinG: 30, highProtein: true },
  { name: "Tofu stir-fry", emoji: "🥢", calories: 300, proteinG: 20, highProtein: true },
  { name: "Paneer & roti", emoji: "🧆", calories: 400, proteinG: 22, highProtein: true },
  { name: "Chicken & plantain", emoji: "🍗", calories: 450, proteinG: 35, highProtein: true },
  { name: "Protein shake", emoji: "🥤", calories: 160, proteinG: 25, highProtein: true },
  { name: "Cottage cheese bowl", emoji: "🥣", calories: 180, proteinG: 20, highProtein: true },
  // Lighter / snack options
  { name: "Hummus & pita", emoji: "🥙", calories: 280, proteinG: 10, highProtein: false },
  { name: "Fruit & nuts", emoji: "🥭", calories: 200, proteinG: 6, highProtein: false },
  { name: "Apple & peanut butter", emoji: "🍎", calories: 220, proteinG: 7, highProtein: false },
  { name: "Handful of almonds", emoji: "🌰", calories: 170, proteinG: 6, highProtein: false },
  { name: "Banana", emoji: "🍌", calories: 105, proteinG: 1, highProtein: false },
];

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
  if (remainingCalories < 120) return null;

  const proteinFocused = remainingProteinG > 25;
  // Allow a little headroom over the exact remaining budget.
  const fits = CATALOG.filter((f) => f.calories <= remainingCalories + 60);
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
  const top = ranked.slice(0, 3);
  const seed = input.daySeed ?? 0;
  const pick = top[seed % top.length] ?? ranked[0];
  if (!pick) return null;

  return {
    name: pick.name,
    emoji: pick.emoji,
    calories: pick.calories,
    proteinG: pick.proteinG,
    reason: proteinFocused
      ? `~${pick.proteinG}g protein to hit your target`
      : `~${pick.calories} kcal to round out your day`,
  };
}

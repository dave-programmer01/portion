import type {
  ActivityLevel,
  Goal,
  Sex,
} from "@/db/schema";

/**
 * Pure nutrition math — NO AI. Targets come from Mifflin-St Jeor + an activity
 * multiplier + a goal adjustment, exactly as locked in AGENTS.md. Kept free of
 * server/client imports so it runs (and unit-tests) anywhere.
 */

/** Physical Activity Level multipliers applied to BMR to get TDEE. */
const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Calorie adjustment per goal (fraction of TDEE). */
const GOAL_ADJUSTMENT: Record<Goal, number> = {
  lose: -0.2, // ~20% deficit
  maintain: 0,
  gain: 0.12, // lean surplus
};

/** Floor so an aggressive deficit never prescribes an unsafe intake. */
const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };

export type TargetsInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
};

export type Targets = {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Mifflin-St Jeor basal metabolic rate. */
export function mifflinStJeorBmr(input: TargetsInput): number {
  const { weightKg, heightCm, age, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * Full target computation. Protein anchored to bodyweight (muscle retention /
 * growth for beginners), fat at 25% of calories, carbs take the remainder.
 */
export function computeTargets(input: TargetsInput): Targets {
  const bmr = mifflinStJeorBmr(input);
  const tdee = bmr * ACTIVITY_MULTIPLIER[input.activityLevel];

  const adjusted = tdee * (1 + GOAL_ADJUSTMENT[input.goal]);
  const calories = Math.max(MIN_CALORIES[input.sex], Math.round(adjusted));

  // Protein: 1.8 g/kg. Fat: 25% of calories. Carbs: whatever's left.
  const proteinG = Math.round(input.weightKg * 1.8);
  const fatG = Math.round((calories * 0.25) / 9);
  const carbsG = Math.max(
    0,
    Math.round((calories - proteinG * 4 - fatG * 9) / 4),
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    proteinG,
    carbsG,
    fatG,
  };
}

// --- Macro scaling for food logging ---

export type Macros = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Scale per-100g macros to an arbitrary gram amount. */
export function macrosForGrams(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    calories: Math.round(per100.calories * f),
    proteinG: round1(per100.proteinG * f),
    carbsG: round1(per100.carbsG * f),
    fatG: round1(per100.fatG * f),
  };
}

/** Sum a list of items into a single macro total (rounded calories). */
export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteinG: round1(acc.proteinG + m.proteinG),
      carbsG: round1(acc.carbsG + m.carbsG),
      fatG: round1(acc.fatG + m.fatG),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Unit conversion (canonical storage is metric) ---

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;

/** cm → { ft, in } for imperial height display. */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cmToIn(cm));
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}

/** { ft, in } → cm for imperial height entry. */
export function ftInToCm(ft: number, inch: number): number {
  return inToCm(ft * 12 + inch);
}

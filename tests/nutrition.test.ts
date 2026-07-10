import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mifflinStJeorBmr,
  computeTargets,
  macrosForGrams,
  sumMacros,
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
} from "../src/lib/nutrition.ts";

test("Mifflin-St Jeor BMR — male vs female offset", () => {
  const base = { age: 25, heightCm: 175, weightKg: 72 } as const;
  const male = mifflinStJeorBmr({
    ...base,
    sex: "male",
    activityLevel: "sedentary",
    goal: "maintain",
  });
  const female = mifflinStJeorBmr({
    ...base,
    sex: "female",
    activityLevel: "sedentary",
    goal: "maintain",
  });
  assert.equal(Math.round(male), 1694);
  // Female is exactly 166 kcal lower (+5 vs -161).
  assert.equal(Math.round(male - female), 166);
});

test("computeTargets — maintain macros add up sensibly", () => {
  const t = computeTargets({
    sex: "male",
    age: 25,
    heightCm: 175,
    weightKg: 72,
    activityLevel: "sedentary",
    goal: "maintain",
  });
  assert.equal(t.bmr, 1694);
  assert.equal(t.tdee, 2033);
  assert.equal(t.calories, 2033);
  assert.equal(t.proteinG, 130); // 1.8 g/kg
  assert.equal(t.fatG, 56); // 25% of kcal / 9
  assert.equal(t.carbsG, 252); // remainder
});

test("computeTargets — deficit lowers calories, floor protects", () => {
  const lose = computeTargets({
    sex: "male",
    age: 25,
    heightCm: 175,
    weightKg: 72,
    activityLevel: "sedentary",
    goal: "lose",
  });
  assert.ok(lose.calories < 2033, "deficit is below maintenance");

  // Small female in a deficit hits the 1200 kcal floor.
  const floored = computeTargets({
    sex: "female",
    age: 20,
    heightCm: 150,
    weightKg: 45,
    activityLevel: "sedentary",
    goal: "lose",
  });
  assert.equal(floored.calories, 1200);
});

test("macrosForGrams scales linearly from per-100g", () => {
  const per100 = { calories: 200, proteinG: 10, carbsG: 20, fatG: 5 };
  assert.deepEqual(macrosForGrams(per100, 100), per100);
  assert.deepEqual(macrosForGrams(per100, 50), {
    calories: 100,
    proteinG: 5,
    carbsG: 10,
    fatG: 2.5,
  });
});

test("sumMacros totals a list", () => {
  const total = sumMacros([
    { calories: 100, proteinG: 5, carbsG: 10, fatG: 2 },
    { calories: 250, proteinG: 30, carbsG: 5, fatG: 8 },
  ]);
  assert.equal(total.calories, 350);
  assert.equal(total.proteinG, 35);
});

test("unit conversions round-trip", () => {
  assert.ok(Math.abs(lbToKg(kgToLb(70)) - 70) < 1e-9);
  const { ft, in: inch } = cmToFtIn(180);
  assert.equal(ft, 5);
  assert.equal(inch, 11);
  assert.ok(Math.abs(ftInToCm(5, 11) - 180.34) < 0.5);
});

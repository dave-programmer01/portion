import { test } from "node:test";
import assert from "node:assert/strict";

import { CATALOG } from "../src/lib/suggest.ts";
import { estimatedPriceSource } from "../src/lib/pricing/index.ts";
import { resolveBudgetContext } from "../src/lib/region.ts";
import { planBudgetDay } from "../src/lib/budget-optimizer.ts";

const US = resolveBudgetContext({
  regionCode: "US",
  currencyCode: "USD",
  currencySymbol: "$",
});
const usFoods = estimatedPriceSource.price(CATALOG, US);

test("planBudgetDay — never exceeds the budget", () => {
  const day = planBudgetDay({
    targets: { calories: 2000, proteinG: 140 },
    budget: 7,
    foods: usFoods,
  });
  assert.ok(day.totalCost <= 7 + 1e-9, `spent ${day.totalCost} of a 7 budget`);
});

test("planBudgetDay — a generous budget covers the protein target", () => {
  const day = planBudgetDay({
    targets: { calories: 2200, proteinG: 120 },
    budget: 20,
    foods: usFoods,
  });
  assert.ok(day.meetsProtein, `only reached ${day.totalProteinG}g protein`);
  assert.ok(day.proteinCoverage >= 1);
});

test("planBudgetDay — respects the calorie ceiling", () => {
  const day = planBudgetDay({
    targets: { calories: 1500, proteinG: 200 },
    budget: 100, // plenty of money; calories are the binding constraint
    foods: usFoods,
  });
  assert.ok(day.totalCalories <= 1500 + 60, `ate ${day.totalCalories} kcal`);
});

test("planBudgetDay — favors cheap high-protein staples on a tight budget", () => {
  const day = planBudgetDay({
    targets: { calories: 2000, proteinG: 120 },
    budget: 8,
    foods: usFoods,
  });
  const names = day.items.map((i) => i.food.name);
  const cheapChamps = [
    "Lentils / dal",
    "Lentils & rice",
    "Two boiled eggs",
    "Beans & rice",
    "Glass of milk",
    "Canned tuna",
    "Oats & milk",
  ];
  assert.ok(
    names.some((n) => cheapChamps.includes(n)),
    `expected a cheap staple, got ${names.join(", ")}`,
  );
  // A premium protein should not win a tight budget.
  assert.ok(
    !names.includes("Grilled fish & veg"),
    "expensive fish should not appear on a tight budget",
  );
});

test("planBudgetDay — empty when the budget is below the cheapest food", () => {
  const day = planBudgetDay({
    targets: { calories: 2000, proteinG: 120 },
    budget: 0.1,
    foods: usFoods,
  });
  assert.equal(day.empty, true);
  assert.equal(day.items.length, 0);
  assert.equal(day.totalCost, 0);
});

test("planBudgetDay — deterministic for identical input", () => {
  const input = {
    targets: { calories: 2000, proteinG: 120 },
    budget: 7,
    foods: usFoods,
  };
  assert.deepEqual(planBudgetDay(input), planBudgetDay(input));
});

test("estimatedPriceSource — a lower region multiplier lowers the price", () => {
  const india = resolveBudgetContext({
    regionCode: "IN",
    currencyCode: "INR",
    currencySymbol: "₹",
  });
  const inFoods = estimatedPriceSource.price(CATALOG, india);
  const usEgg = usFoods.find((f) => f.name === "Two boiled eggs")!;
  const inEgg = inFoods.find((f) => f.name === "Two boiled eggs")!;
  assert.ok(inEgg.cost < usEgg.cost, "India (0.4×) should be cheaper than US");
  assert.equal(inEgg.currency, "INR");
});

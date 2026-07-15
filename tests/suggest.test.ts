import { test } from "node:test";
import assert from "node:assert/strict";

import { suggestNextMeal, CATALOG, proteinPerDollar } from "../src/lib/suggest.ts";
import { badgeFor } from "../src/lib/badge.ts";

test("suggestNextMeal — no suggestion once the day's budget is basically spent", () => {
  assert.equal(
    suggestNextMeal({ remainingCalories: 80, remainingProteinG: 40 }),
    null,
  );
});

test("suggestNextMeal — prioritises protein when the protein gap is large", () => {
  const s = suggestNextMeal({
    remainingCalories: 600,
    remainingProteinG: 60,
  });
  assert.ok(s, "expected a suggestion");
  // With a big protein gap and room to spare, the pick should be protein-rich.
  assert.ok(s!.proteinG >= 20, `expected high-protein pick, got ${s!.proteinG}g`);
  assert.match(s!.reason, /protein/);
});

test("suggestNextMeal — never suggests something far over the remaining budget", () => {
  const s = suggestNextMeal({
    remainingCalories: 160,
    remainingProteinG: 5,
  });
  assert.ok(s, "expected a suggestion");
  // Allowed a little headroom (60 kcal) over the remaining budget, no more.
  assert.ok(
    s!.calories <= 160 + 60,
    `suggested ${s!.calories} kcal against a 160 budget`,
  );
});

test("suggestNextMeal — daySeed rotates the pick deterministically", () => {
  const input = { remainingCalories: 600, remainingProteinG: 60 };
  const a = suggestNextMeal({ ...input, daySeed: 0 });
  const b = suggestNextMeal({ ...input, daySeed: 0 });
  // Same seed → same suggestion (stable within a day).
  assert.deepEqual(a, b);
});

test("CATALOG — every food carries a positive per-serving cost", () => {
  for (const f of CATALOG) {
    assert.ok(
      f.costPerServingUsd > 0,
      `${f.name} is missing a cost (would divide by zero)`,
    );
  }
});

test("proteinPerDollar — cheap staples beat premium proteins", () => {
  const dal = CATALOG.find((f) => f.name === "Lentils / dal")!;
  const fish = CATALOG.find((f) => f.name === "Grilled fish & veg")!;
  assert.ok(
    proteinPerDollar(dal) > proteinPerDollar(fish),
    "lentils should give more protein per dollar than grilled fish",
  );
});

test("suggestNextMeal — carries a cost estimate on the pick", () => {
  const s = suggestNextMeal({ remainingCalories: 600, remainingProteinG: 60 });
  assert.ok(s, "expected a suggestion");
  assert.ok(s!.costPerServingUsd > 0, "suggestion should include a cost");
});

test("badgeFor — reflects real activity", () => {
  assert.equal(badgeFor(7, 3), "On a Streak");
  assert.equal(badgeFor(0, 5), "Consistent Achiever");
  assert.equal(badgeFor(0, 0), "Getting Started");
});

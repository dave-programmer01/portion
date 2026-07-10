import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canPerform,
  normalizeEquipment,
  deriveEquipmentTier,
  resolveOwnedEquipment,
} from "../src/lib/equipment.ts";
import { focusMuscleGroups, type FocusArea } from "../src/lib/workout-focus.ts";
import { EXERCISE_SEED } from "../src/server/exercises-data.ts";

test("canPerform — bodyweight always allowed; multi-item needs all", () => {
  assert.equal(canPerform([], []), true);
  assert.equal(canPerform(["dumbbells"], ["dumbbells"]), true);
  assert.equal(canPerform(["dumbbells"], []), false);
  assert.equal(canPerform(["dumbbells", "bench"], ["dumbbells"]), false);
  assert.equal(canPerform(["dumbbells", "bench"], ["dumbbells", "bench"]), true);
});

test("normalizeEquipment — filters junk and de-dupes", () => {
  assert.deepEqual(normalizeEquipment(undefined), []);
  assert.deepEqual(normalizeEquipment(["dumbbells", "nope", 3]), ["dumbbells"]);
  assert.deepEqual(normalizeEquipment(["bands", "bands"]), ["bands"]);
});

test("deriveEquipmentTier — legacy tier from inventory", () => {
  assert.equal(deriveEquipmentTier([]), "bodyweight");
  assert.equal(deriveEquipmentTier(["dumbbells"]), "dumbbells");
  assert.equal(deriveEquipmentTier(["barbell"]), "full_gym");
  assert.equal(deriveEquipmentTier(["machine"]), "full_gym");
  assert.equal(deriveEquipmentTier(["pullup_bar"]), "bodyweight");
});

test("resolveOwnedEquipment — prefers inventory, falls back to tier", () => {
  assert.deepEqual(resolveOwnedEquipment(["bands"], "full_gym"), ["bands"]);
  assert.deepEqual(resolveOwnedEquipment([], "dumbbells"), ["dumbbells"]);
  assert.deepEqual(resolveOwnedEquipment(null, "bodyweight"), []);
});

test("no-equipment users get at least one exercise for every focus area", () => {
  const requires = new Map(EXERCISE_SEED.map((e) => [e.id, e.requires]));
  const areas: FocusArea[] = ["chest", "back", "shoulders", "arms", "legs", "abs"];
  for (const area of areas) {
    const groups = focusMuscleGroups([area]);
    const available = EXERCISE_SEED.filter(
      (e) =>
        groups.includes(e.muscleGroup) &&
        canPerform(requires.get(e.id) ?? [], []),
    );
    assert.ok(
      available.length > 0,
      `no bodyweight exercise available for focus "${area}"`,
    );
  }
});

test("inventory unlocks the right exercises (pull-up bar enables inverted row)", () => {
  const row = EXERCISE_SEED.find((e) => e.id === "inverted-row")!;
  assert.equal(canPerform(row.requires, []), false); // no bar → not allowed
  assert.equal(canPerform(row.requires, ["pullup_bar"]), true);
});

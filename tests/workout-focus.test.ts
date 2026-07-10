import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFocus,
  isFullBody,
  focusMuscleGroups,
  focusLabel,
  planName,
} from "../src/lib/workout-focus.ts";

test("normalizeFocus — junk / empty falls back to full body", () => {
  assert.deepEqual(normalizeFocus(undefined), ["full_body"]);
  assert.deepEqual(normalizeFocus([]), ["full_body"]);
  assert.deepEqual(normalizeFocus(["nonsense", 42]), ["full_body"]);
});

test("normalizeFocus — full_body is exclusive", () => {
  assert.deepEqual(normalizeFocus(["chest", "full_body"]), ["full_body"]);
});

test("normalizeFocus — keeps valid areas and de-dupes", () => {
  assert.deepEqual(normalizeFocus(["chest", "arms", "chest"]), ["chest", "arms"]);
});

test("isFullBody", () => {
  assert.equal(isFullBody(["full_body"]), true);
  assert.equal(isFullBody([]), true);
  assert.equal(isFullBody(["legs"]), false);
});

test("focusMuscleGroups — expands to library groups; full body = all (empty)", () => {
  assert.deepEqual(focusMuscleGroups(["full_body"]), []);
  assert.deepEqual(focusMuscleGroups(["arms"]), ["Biceps", "Triceps"]);
  assert.deepEqual(focusMuscleGroups(["chest", "abs"]), ["Chest", "Core"]);
});

test("focusLabel — readable summaries", () => {
  assert.equal(focusLabel(["full_body"]), "Full Body");
  assert.equal(focusLabel(["chest"]), "Chest");
  assert.equal(focusLabel(["chest", "arms"]), "Chest & Arms");
  assert.equal(focusLabel(["chest", "arms", "legs"]), "Chest, Arms +1");
});

test("planName — full body uses split names, focus uses a focus title", () => {
  assert.equal(planName(3, ["full_body"]), "3-Day Full Body");
  assert.equal(planName(4, ["full_body"]), "4-Day Upper / Lower");
  assert.equal(planName(5, ["full_body"]), "5-Day Push / Pull / Legs");
  assert.equal(planName(3, ["chest"]), "3-Day Chest Focus");
  assert.equal(planName(4, ["arms", "abs"]), "4-Day Arms & Abs Focus");
});

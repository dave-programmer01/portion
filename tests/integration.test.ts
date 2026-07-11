import { test } from "node:test";
import assert from "node:assert/strict";

import { makeTestDb } from "./helpers/db.ts";
import { getRecentFoods, cacheUserCorrections } from "@/server/food";
import { buildAccountExport } from "@/server/account-export";
import {
  getOrCreateCode,
  redeemCode,
  referralStats,
} from "@/server/referrals";
import { config } from "@/config";
import {
  foodEntry,
  foodItem,
  foodMaster,
  users,
  workoutDay,
  workoutPlan,
} from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Integration tests: real query helpers run against a real Postgres engine
 * (pglite) with the app's migrations applied. These catch join/dedup/scoping
 * bugs — especially cross-user data leaks — that pure-function tests can't.
 */

test("getRecentFoods — dedupes by name (freshest wins), skips non-complete + other users", async () => {
  const { db } = await makeTestDb();
  await db.insert(users).values([
    { id: "u1", email: "u1@test.dev" },
    { id: "u2", email: "u2@test.dev" },
  ]);

  const [older] = await db
    .insert(foodEntry)
    .values({
      userId: "u1",
      loggedDate: "2026-07-01",
      mealType: "lunch",
      source: "photo",
      status: "complete",
      createdAt: new Date("2026-07-01T12:00:00Z"),
    })
    .returning();
  const [newer] = await db
    .insert(foodEntry)
    .values({
      userId: "u1",
      loggedDate: "2026-07-05",
      mealType: "dinner",
      source: "photo",
      status: "complete",
      createdAt: new Date("2026-07-05T12:00:00Z"),
    })
    .returning();
  const [pending] = await db
    .insert(foodEntry)
    .values({
      userId: "u1",
      loggedDate: "2026-07-06",
      mealType: "snack",
      source: "photo",
      status: "pending",
      createdAt: new Date("2026-07-06T12:00:00Z"),
    })
    .returning();
  const [other] = await db
    .insert(foodEntry)
    .values({
      userId: "u2",
      loggedDate: "2026-07-05",
      mealType: "lunch",
      source: "photo",
      status: "complete",
      createdAt: new Date("2026-07-05T12:00:00Z"),
    })
    .returning();

  await db.insert(foodItem).values([
    { entryId: older.id, name: "Chicken", calories: 300 },
    { entryId: newer.id, name: "Chicken", calories: 500 },
    { entryId: newer.id, name: "Rice", calories: 200 },
    { entryId: pending.id, name: "Pending Snack", calories: 150 },
    { entryId: other.id, name: "Other User Food", calories: 999 },
  ]);

  const recents = await getRecentFoods(db, "u1");
  const names = recents.map((r) => r.name);

  // "Chicken" collapses to one row, keeping the freshest entry's macros (500).
  assert.equal(names.filter((n) => n === "Chicken").length, 1);
  assert.equal(recents.find((r) => r.name === "Chicken")?.calories, 500);
  assert.ok(names.includes("Rice"));
  // A still-analyzing (pending) entry's items don't show as re-loggable.
  assert.ok(!names.includes("Pending Snack"));
  // Another user's food never leaks into u1's recents.
  assert.ok(!names.includes("Other User Food"));
});

test("getRecentFoods — respects the limit", async () => {
  const { db } = await makeTestDb();
  await db.insert(users).values({ id: "u1", email: "u1@test.dev" });
  const [entry] = await db
    .insert(foodEntry)
    .values({
      userId: "u1",
      loggedDate: "2026-07-05",
      mealType: "lunch",
      source: "photo",
      status: "complete",
    })
    .returning();
  await db.insert(foodItem).values(
    Array.from({ length: 20 }, (_, i) => ({
      entryId: entry.id,
      name: `Food ${i}`,
      calories: 100 + i,
    })),
  );

  const recents = await getRecentFoods(db, "u1", 12);
  assert.equal(recents.length, 12);
});

test("cacheUserCorrections — promotes an AI guess to verified, inserts new, spares barcode rows", async () => {
  const { db } = await makeTestDb();
  await db.insert(foodMaster).values([
    // A shaky AI guess that a user is about to correct.
    { source: "ai", name: "Jollof Rice", caloriesPer100: 100, proteinPer100: 2, carbsPer100: 20, fatPer100: 1 },
    // An authoritative barcode product — must never be overwritten.
    { source: "off", name: "Branded Bar", barcode: "12345", caloriesPer100: 400, proteinPer100: 20, carbsPer100: 40, fatPer100: 15 },
  ]);

  await cacheUserCorrections(db, [
    // 200g → 300 kcal ⇒ 150 kcal/100g; promotes the AI row in place.
    { name: "Jollof Rice", unit: "g", quantity: 200, calories: 300, proteinG: 8, carbsG: 50, fatG: 6 },
    // Brand-new food ⇒ inserted as a verified manual row.
    { name: "Pounded Yam", unit: "g", quantity: 100, calories: 130, proteinG: 1, carbsG: 32, fatG: 0 },
    // Not gram-measured ⇒ ignored (can't derive per-100g).
    { name: "Suya (skip)", unit: "serving", quantity: 1, calories: 250, proteinG: 20, carbsG: 5, fatG: 15 },
  ]);

  const rows = await db.select().from(foodMaster);

  const jollof = rows.filter((r) => r.name === "Jollof Rice");
  assert.equal(jollof.length, 1); // updated in place, not duplicated
  assert.equal(jollof[0]!.source, "manual"); // promoted to user-verified
  assert.equal(Math.round(jollof[0]!.caloriesPer100), 150);

  const yam = rows.find((r) => r.name === "Pounded Yam");
  assert.ok(yam && yam.source === "manual");
  assert.equal(Math.round(yam!.caloriesPer100), 130);

  // Non-gram item was skipped.
  assert.ok(!rows.some((r) => r.name === "Suya (skip)"));

  // Barcode row is completely untouched.
  const bar = rows.find((r) => r.name === "Branded Bar");
  assert.equal(bar!.source, "off");
  assert.equal(bar!.barcode, "12345");
  assert.equal(Math.round(bar!.caloriesPer100), 400);
});

test("buildAccountExport — returns the user's rows across tables and never another user's", async () => {
  const { db } = await makeTestDb();
  await db.insert(users).values([
    { id: "A", email: "a@test.dev", firstName: "Ann" },
    { id: "B", email: "b@test.dev" },
  ]);

  const [aEntry] = await db
    .insert(foodEntry)
    .values({
      userId: "A",
      loggedDate: "2026-07-05",
      mealType: "lunch",
      source: "manual",
      status: "complete",
    })
    .returning();
  const [bEntry] = await db
    .insert(foodEntry)
    .values({
      userId: "B",
      loggedDate: "2026-07-05",
      mealType: "lunch",
      source: "manual",
      status: "complete",
    })
    .returning();
  await db.insert(foodItem).values([
    { entryId: aEntry.id, name: "A Salad", calories: 250 },
    { entryId: bEntry.id, name: "B Burger", calories: 800 },
  ]);

  const [aPlan] = await db
    .insert(workoutPlan)
    .values({
      userId: "A",
      name: "A Plan",
      goal: "lose",
      daysPerWeek: 3,
      split: "full_body",
    })
    .returning();
  const [bPlan] = await db
    .insert(workoutPlan)
    .values({
      userId: "B",
      name: "B Plan",
      goal: "gain",
      daysPerWeek: 4,
      split: "upper_lower",
    })
    .returning();
  await db.insert(workoutDay).values([
    { planId: aPlan.id, dayIndex: 0, name: "A Day", exercises: [] },
    { planId: bPlan.id, dayIndex: 0, name: "B Day", exercises: [] },
  ]);

  const exp = await buildAccountExport(db, "A");

  assert.equal(exp.account?.id, "A");
  assert.equal(exp.account?.email, "a@test.dev");
  // Own food only (item scoped through its entry).
  assert.equal(exp.food.entries.length, 1);
  assert.equal(exp.food.items.length, 1);
  assert.equal(exp.food.items[0]!.name, "A Salad");
  // Own workouts only (day scoped through its plan).
  assert.equal(exp.workouts.plans.length, 1);
  assert.equal(exp.workouts.days.length, 1);
  assert.equal(exp.workouts.days[0]!.name, "A Day");
  // Hard isolation check: nothing belonging to user B appears anywhere.
  const blob = JSON.stringify(exp);
  assert.ok(!blob.includes("B Burger"));
  assert.ok(!blob.includes("B Day"));
  assert.ok(!blob.includes("b@test.dev"));
});

test("referrals — getOrCreateCode is stable and redeem rewards both sides", async () => {
  const { db } = await makeTestDb();
  await db.insert(users).values([
    { id: "A", email: "a@test.dev" }, // referrer
    { id: "B", email: "b@test.dev" }, // new friend
  ]);

  const code1 = await getOrCreateCode(db, "A");
  const code2 = await getOrCreateCode(db, "A");
  assert.equal(code1, code2); // one stable code per user
  assert.ok(code1.length >= 6);

  const res = await redeemCode(db, "B", code1);
  assert.deepEqual(res, { ok: true, rewardDays: config.referral.rewardDays });

  // Both users are now premium with ~rewardDays of runway.
  const rows = await db.select().from(users);
  for (const id of ["A", "B"]) {
    const u = rows.find((r) => r.id === id)!;
    assert.equal(u.tier, "premium");
    assert.ok(u.tierExpiresAt && u.tierExpiresAt.getTime() > Date.now());
  }

  const stats = await referralStats(db, "A");
  assert.equal(stats.invited, 1);
  assert.equal(stats.code, code1);
});

test("referrals — enforces self-referral, one-per-user, new-user, and bad codes", async () => {
  const { db } = await makeTestDb();
  await db.insert(users).values([
    { id: "A", email: "a@test.dev" },
    { id: "B", email: "b@test.dev" },
    { id: "C", email: "c@test.dev" },
    // Existing (old) account — outside the new-user window.
    {
      id: "OLD",
      email: "old@test.dev",
      createdAt: new Date(Date.now() - 60 * DAY_MS),
    },
  ]);
  const codeA = await getOrCreateCode(db, "A");
  const codeC = await getOrCreateCode(db, "C");

  // Unknown code.
  assert.deepEqual(await redeemCode(db, "B", "ZZZZZZZ"), {
    ok: false,
    reason: "invalid_code",
  });
  // Can't redeem your own.
  assert.deepEqual(await redeemCode(db, "A", codeA), {
    ok: false,
    reason: "self_referral",
  });
  // Established accounts can't farm rewards.
  assert.deepEqual(await redeemCode(db, "OLD", codeA), {
    ok: false,
    reason: "not_new_user",
  });

  // B redeems once — fine; a second attempt (even a different code) is blocked.
  assert.equal((await redeemCode(db, "B", codeA)).ok, true);
  assert.deepEqual(await redeemCode(db, "B", codeC), {
    ok: false,
    reason: "already_redeemed",
  });
});

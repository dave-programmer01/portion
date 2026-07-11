import { test } from "node:test";
import assert from "node:assert/strict";

import {
  historyCutoff,
  canViewDate,
  photoScanAllowed,
  workoutGenAllowed,
  planLimits,
} from "../src/lib/gating.ts";

test("historyCutoff — free window is inclusive of today", () => {
  // 7-day window ending today = today minus 6 days.
  assert.equal(historyCutoff("free", "2026-07-05", 7), "2026-06-29");
  assert.equal(historyCutoff("premium", "2026-07-05", 7), null);
});

test("canViewDate — free tier blocked before the cutoff", () => {
  assert.equal(canViewDate("free", "2026-07-05", "2026-07-05", 7), true);
  assert.equal(canViewDate("free", "2026-06-29", "2026-07-05", 7), true);
  assert.equal(canViewDate("free", "2026-06-28", "2026-07-05", 7), false);
  assert.equal(canViewDate("premium", "2020-01-01", "2026-07-05", 7), true);
});

// --- photoScanAllowed ---

type ScanInput = Parameters<typeof photoScanAllowed>[0];
const scanBase: ScanInput = {
  tier: "free",
  scansToday: 0,
  scansLastMinute: 0,
  freeDailyLimit: 3,
  premiumDailyLimit: 100,
  burstPerMinute: 8,
  monthSpendUsd: 0,
  spendCeilingUsd: 20,
};
const scan = (o: Partial<ScanInput>) => photoScanAllowed({ ...scanBase, ...o });

test("photoScanAllowed — free daily cap", () => {
  assert.deepEqual(scan({ scansToday: 2 }), { allowed: true });
  assert.deepEqual(scan({ scansToday: 3 }), { allowed: false, reason: "daily_cap" });
});

test("photoScanAllowed — premium allowed within its safety cap", () => {
  assert.deepEqual(scan({ tier: "premium", scansToday: 99 }), { allowed: true });
});

test("photoScanAllowed — premium blocked at its daily safety cap", () => {
  assert.deepEqual(scan({ tier: "premium", scansToday: 100 }), {
    allowed: false,
    reason: "abuse_cap",
  });
});

test("photoScanAllowed — spend ceiling blocks EVERY tier (premium too)", () => {
  assert.deepEqual(scan({ monthSpendUsd: 20 }), {
    allowed: false,
    reason: "spend_ceiling",
  });
  assert.deepEqual(scan({ tier: "premium", scansToday: 0, monthSpendUsd: 20 }), {
    allowed: false,
    reason: "spend_ceiling",
  });
});

test("photoScanAllowed — burst guard blocks rapid-fire (any tier)", () => {
  assert.deepEqual(scan({ scansLastMinute: 8 }), {
    allowed: false,
    reason: "burst",
  });
  assert.deepEqual(scan({ tier: "premium", scansLastMinute: 8 }), {
    allowed: false,
    reason: "burst",
  });
});

// --- workoutGenAllowed ---

type GenInput = Parameters<typeof workoutGenAllowed>[0];
const genBase: GenInput = {
  tier: "free",
  hasActivePlan: false,
  gensToday: 0,
  gensLastMinute: 0,
  premiumDailyLimit: 20,
  burstPerMinute: 8,
  monthSpendUsd: 0,
  spendCeilingUsd: 20,
};
const gen = (o: Partial<GenInput>) => workoutGenAllowed({ ...genBase, ...o });

test("workoutGenAllowed — free gets one plan, no regeneration", () => {
  assert.deepEqual(gen({}), { allowed: true });
  assert.deepEqual(gen({ hasActivePlan: true }), {
    allowed: false,
    reason: "needs_upgrade",
  });
});

test("workoutGenAllowed — premium regenerates up to the daily safety cap", () => {
  assert.deepEqual(gen({ tier: "premium", hasActivePlan: true, gensToday: 19 }), {
    allowed: true,
  });
  assert.deepEqual(gen({ tier: "premium", gensToday: 20 }), {
    allowed: false,
    reason: "abuse_cap",
  });
});

test("workoutGenAllowed — ceiling + burst apply to premium too", () => {
  assert.deepEqual(gen({ tier: "premium", monthSpendUsd: 20 }), {
    allowed: false,
    reason: "spend_ceiling",
  });
  assert.deepEqual(gen({ tier: "premium", gensLastMinute: 8 }), {
    allowed: false,
    reason: "burst",
  });
});

test("planLimits — everyone gets full days; only regen is gated", () => {
  assert.deepEqual(planLimits("free"), { maxDaysPerWeek: 6, canRegenerate: false });
  assert.deepEqual(planLimits("premium"), { maxDaysPerWeek: 6, canRegenerate: true });
});

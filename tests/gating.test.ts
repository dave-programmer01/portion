import { test } from "node:test";
import assert from "node:assert/strict";

import {
  historyCutoff,
  canViewDate,
  photoScanAllowed,
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

test("photoScanAllowed — premium is always allowed", () => {
  const d = photoScanAllowed({
    tier: "premium",
    scansToday: 999,
    dailyLimit: 3,
    monthSpendUsd: 999,
    spendCeilingUsd: 20,
  });
  assert.deepEqual(d, { allowed: true });
});

test("photoScanAllowed — free daily cap", () => {
  const base = { tier: "free" as const, dailyLimit: 3, monthSpendUsd: 0, spendCeilingUsd: 20 };
  assert.deepEqual(photoScanAllowed({ ...base, scansToday: 2 }), { allowed: true });
  assert.deepEqual(photoScanAllowed({ ...base, scansToday: 3 }), {
    allowed: false,
    reason: "daily_cap",
  });
});

test("photoScanAllowed — spend ceiling blocks free before the daily cap", () => {
  const d = photoScanAllowed({
    tier: "free",
    scansToday: 0,
    dailyLimit: 3,
    monthSpendUsd: 20,
    spendCeilingUsd: 20,
  });
  assert.deepEqual(d, { allowed: false, reason: "spend_ceiling" });
});

test("planLimits per tier", () => {
  assert.deepEqual(planLimits("free"), { maxDaysPerWeek: 3, canRegenerate: false });
  assert.deepEqual(planLimits("premium"), { maxDaysPerWeek: 6, canRegenerate: true });
});

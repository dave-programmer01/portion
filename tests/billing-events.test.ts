import { test } from "node:test";
import assert from "node:assert/strict";

import { tierForRcEvent } from "../src/lib/billing-events.ts";

test("tierForRcEvent — purchase & renewal grant premium", () => {
  for (const type of [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "SUBSCRIPTION_EXTENDED",
  ]) {
    assert.deepEqual(tierForRcEvent(type), { changes: true, tier: "premium" });
  }
});

test("tierForRcEvent — expiration revokes to free", () => {
  assert.deepEqual(tierForRcEvent("EXPIRATION"), {
    changes: true,
    tier: "free",
  });
});

test("tierForRcEvent — cancellation/billing issues do NOT change tier", () => {
  // Access must last until EXPIRATION, so these are acknowledged but inert.
  for (const type of [
    "CANCELLATION",
    "BILLING_ISSUE",
    "SUBSCRIPTION_PAUSED",
    "TRANSFER",
    "TEST",
    "",
    "SOMETHING_NEW_FROM_RC",
  ]) {
    assert.deepEqual(tierForRcEvent(type), { changes: false });
  }
});

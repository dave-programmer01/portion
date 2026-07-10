import { test } from "node:test";
import assert from "node:assert/strict";

import { rateLimit, clientIp } from "../src/lib/rate-limit.ts";

test("rateLimit — allows up to the limit, then blocks", () => {
  const key = `t:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit(key, 3, 60_000).ok, true);
  }
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("rateLimit — keys are independent", () => {
  const a = `a:${Math.random()}`;
  const b = `b:${Math.random()}`;
  assert.equal(rateLimit(a, 1, 60_000).ok, true);
  assert.equal(rateLimit(a, 1, 60_000).ok, false);
  // A different key still has its own fresh window.
  assert.equal(rateLimit(b, 1, 60_000).ok, true);
});

test("rateLimit — window resets after it elapses", async () => {
  const key = `t:${Math.random()}`;
  assert.equal(rateLimit(key, 1, 20).ok, true);
  assert.equal(rateLimit(key, 1, 20).ok, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(rateLimit(key, 1, 20).ok, true);
});

test("clientIp — prefers the first x-forwarded-for entry", () => {
  const req = new Request("https://x.test", {
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
  });
  assert.equal(clientIp(req), "203.0.113.7");
});

test("clientIp — falls back to other proxy headers, then unknown", () => {
  const cf = new Request("https://x.test", {
    headers: { "cf-connecting-ip": "198.51.100.2" },
  });
  assert.equal(clientIp(cf), "198.51.100.2");
  assert.equal(clientIp(new Request("https://x.test")), "unknown");
});

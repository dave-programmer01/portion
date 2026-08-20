import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMotivationCards,
  quoteOfTheDay,
  winbackPush,
  MOTIVATION_QUOTES,
  type MotivationContext,
} from "../src/lib/motivation.ts";

const base: MotivationContext = {
  today: "2026-08-19",
  streakDays: 0,
  loggedToday: false,
  daysSinceLastLog: null,
  remainingCalories: null,
  hasBudget: false,
  notificationsEnabled: true,
  daySeed: 3,
};

test("buildMotivationCards — always returns at least the daily quote", () => {
  const cards = buildMotivationCards({ ...base, loggedToday: true });
  assert.ok(cards.length >= 1);
  assert.ok(cards.some((c) => c.kind === "quote"));
});

test("buildMotivationCards — welcome_back appears after a gap and sorts first", () => {
  const cards = buildMotivationCards({ ...base, daysSinceLastLog: 4 });
  assert.equal(cards[0].kind, "welcome_back");
  assert.match(cards[0].body, /4 days/);
});

test("buildMotivationCards — log reminder only when not logged today", () => {
  const notLogged = buildMotivationCards({ ...base, loggedToday: false });
  assert.ok(notLogged.some((c) => c.kind === "log_reminder"));
  const logged = buildMotivationCards({ ...base, loggedToday: true });
  assert.ok(!logged.some((c) => c.kind === "log_reminder"));
});

test("buildMotivationCards — streak card once a streak exists", () => {
  const cards = buildMotivationCards({ ...base, streakDays: 5, loggedToday: true });
  const streak = cards.find((c) => c.kind === "streak");
  assert.ok(streak, "expected a streak card");
  assert.match(streak!.title, /5/);
});

test("buildMotivationCards — enable_notifs only when notifications are off", () => {
  const off = buildMotivationCards({ ...base, notificationsEnabled: false });
  assert.ok(off.some((c) => c.kind === "enable_notifs"));
  const on = buildMotivationCards({ ...base, notificationsEnabled: true });
  assert.ok(!on.some((c) => c.kind === "enable_notifs"));
});

test("buildMotivationCards — budget card only when a budget is set", () => {
  const cards = buildMotivationCards({ ...base, hasBudget: true });
  assert.ok(cards.some((c) => c.kind === "budget"));
});

test("quoteOfTheDay — deterministic and in range", () => {
  assert.equal(quoteOfTheDay(3), quoteOfTheDay(3));
  assert.ok(MOTIVATION_QUOTES.includes(quoteOfTheDay(0)));
  assert.ok(MOTIVATION_QUOTES.includes(quoteOfTheDay(999)));
});

test("winbackPush — deterministic, non-empty copy", () => {
  const a = winbackPush(2);
  assert.equal(a.title, winbackPush(2).title);
  assert.ok(a.title.length > 0 && a.body.length > 0);
});

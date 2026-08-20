import { inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { pushTokens, foodEntry } from "@/db/schema";
import { config } from "@/config";
import { winbackPush } from "@/lib/motivation";
import { sendExpoPush, type PushMessage } from "@/server/push";

import { inngest } from "../client";

/**
 * Daily engagement push. Finds users who went quiet — last activity inside a
 * dormancy window (not too recent, not long-churned) — and sends a win-back
 * push to their registered devices. This is the piece local notifications can't
 * do: it reaches users even if the app was never reopened. Throttled per user
 * via `lastPushedAt`, capped per run, and prunes dead tokens as it goes.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const engagementPush = inngest.createFunction(
  {
    id: "engagement-push",
    name: "Daily win-back push for dormant users",
    triggers: [{ cron: config.push.engagementCron }],
  },
  async ({ step }) => {
    const now = Date.now();
    const throttleCutoff = new Date(
      now - config.push.minDaysBetweenPushes * DAY_MS,
    );
    const windowNewest = now - config.push.dormancyMinDays * DAY_MS;
    const windowOldest = now - config.push.dormancyMaxDays * DAY_MS;

    // 1. Throttle-eligible device tokens (never pushed, or not pushed recently).
    const tokens = await step.run("load-tokens", async () =>
      db
        .select()
        .from(pushTokens)
        .where(
          or(
            isNull(pushTokens.lastPushedAt),
            lt(pushTokens.lastPushedAt, throttleCutoff),
          ),
        )
        .limit(config.push.maxPerRun * 4),
    );
    if (tokens.length === 0) return { pushed: 0 };

    const userIds = [...new Set(tokens.map((t) => t.userId))];

    // 2. Each candidate's last real activity (most recent food log).
    const activity = await step.run("load-activity", async () =>
      db
        .select({
          userId: foodEntry.userId,
          last: sql<string>`max(${foodEntry.createdAt})`,
        })
        .from(foodEntry)
        .where(inArray(foodEntry.userId, userIds))
        .groupBy(foodEntry.userId),
    );
    const lastLogByUser = new Map(
      activity.map((a) => [a.userId, a.last ? new Date(a.last).getTime() : 0]),
    );
    // Fallback reference for users who've never logged: when they enabled push.
    const tokenCreatedByUser = new Map<string, number>();
    for (const t of tokens) {
      const ms = new Date(t.createdAt).getTime();
      tokenCreatedByUser.set(
        t.userId,
        Math.max(tokenCreatedByUser.get(t.userId) ?? 0, ms),
      );
    }

    // 3. Users whose reference activity falls inside the dormancy window.
    const dormant = new Set<string>();
    for (const uid of userIds) {
      const ref = lastLogByUser.get(uid) || tokenCreatedByUser.get(uid) || 0;
      if (ref >= windowOldest && ref <= windowNewest) dormant.add(uid);
      if (dormant.size >= config.push.maxPerRun) break;
    }
    if (dormant.size === 0) return { candidates: userIds.length, pushed: 0 };

    // 4. Build one win-back message per dormant device (rotate copy).
    const daySeed = Math.floor(now / DAY_MS);
    const messages: PushMessage[] = [];
    const targetTokenIds: string[] = [];
    let seed = 0;
    for (const t of tokens) {
      if (!dormant.has(t.userId)) continue;
      const copy = winbackPush(daySeed + seed++);
      messages.push({
        to: t.token,
        title: copy.title,
        body: copy.body,
        data: { url: "/log" },
      });
      targetTokenIds.push(t.id);
    }

    // 5. Send, prune dead tokens, and stamp the ones we reached.
    const result = await step.run("send", async () => sendExpoPush(messages));

    if (result.invalidTokens.length > 0) {
      await step.run("prune-dead-tokens", async () =>
        db
          .delete(pushTokens)
          .where(inArray(pushTokens.token, result.invalidTokens)),
      );
    }

    const invalid = new Set(result.invalidTokens);
    const reachedIds = tokens
      .filter((t) => targetTokenIds.includes(t.id) && !invalid.has(t.token))
      .map((t) => t.id);
    if (reachedIds.length > 0) {
      await step.run("mark-pushed", async () =>
        db
          .update(pushTokens)
          .set({ lastPushedAt: new Date() })
          .where(inArray(pushTokens.id, reachedIds)),
      );
    }

    return {
      candidates: userIds.length,
      dormant: dormant.size,
      sent: result.sent,
      pruned: result.invalidTokens.length,
    };
  },
);

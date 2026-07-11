import { and, count, eq, gte } from "drizzle-orm";

import { type Db } from "@/db";
import { users, referralCodes, referralRedemptions } from "@/db/schema";
import { config } from "@/config";

/**
 * Referral loop. Each user has one shareable code; a friend redeems it once and
 * both sides get comp Premium days (via the tier columns — no RevenueCat). Kept
 * db-parameterized so the whole flow is integration-tested against real Postgres,
 * which is where the anti-abuse rules (self-referral, one-per-user, new-user
 * window, monthly cap) actually need to hold.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// Unambiguous alphabet (no 0/O/1/I) for codes that get typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(len = 7): string {
  let s = "";
  for (let i = 0; i < len; i += 1) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/** The user's invite code, created on first use. */
export async function getOrCreateCode(db: Db, userId: string): Promise<string> {
  const [existing] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await db.insert(referralCodes).values({ userId, code: genCode() });
      break;
    } catch {
      // Unique collision (this user got a code concurrently, or code clash) —
      // re-read; if the user now has one, use it, else retry with a new code.
      const [row] = await db
        .select({ code: referralCodes.code })
        .from(referralCodes)
        .where(eq(referralCodes.userId, userId))
        .limit(1);
      if (row) return row.code;
    }
  }
  const [row] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  if (!row) throw new Error("could not allocate referral code");
  return row.code;
}

/** Add `days` of Premium, stacking on any unexpired remaining time. */
async function grantPremiumDays(
  db: Db,
  userId: string,
  days: number,
): Promise<void> {
  const [u] = await db
    .select({ expiresAt: users.tierExpiresAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const now = Date.now();
  const base =
    u?.expiresAt && u.expiresAt.getTime() > now ? u.expiresAt.getTime() : now;
  await db
    .update(users)
    .set({
      tier: "premium",
      tierExpiresAt: new Date(base + days * DAY_MS),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export type RedeemResult =
  | { ok: true; rewardDays: number }
  | {
      ok: false;
      reason: "invalid_code" | "self_referral" | "already_redeemed" | "not_new_user";
    };

/** Redeem a code for the current user, applying all anti-abuse rules. */
export async function redeemCode(
  db: Db,
  redeemerId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "invalid_code" };

  const [owner] = await db
    .select({ userId: referralCodes.userId })
    .from(referralCodes)
    .where(eq(referralCodes.code, code))
    .limit(1);
  if (!owner) return { ok: false, reason: "invalid_code" };
  if (owner.userId === redeemerId) return { ok: false, reason: "self_referral" };

  const [prior] = await db
    .select({ id: referralRedemptions.id })
    .from(referralRedemptions)
    .where(eq(referralRedemptions.redeemedByUserId, redeemerId))
    .limit(1);
  if (prior) return { ok: false, reason: "already_redeemed" };

  // Only genuinely new accounts can redeem (stops existing users self-farming).
  const [ru] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, redeemerId))
    .limit(1);
  if (!ru) return { ok: false, reason: "invalid_code" };
  if (Date.now() - ru.createdAt.getTime() > config.referral.newUserWindowDays * DAY_MS) {
    return { ok: false, reason: "not_new_user" };
  }

  // Record the redemption first; the unique redeemer column is the race guard.
  try {
    await db.insert(referralRedemptions).values({
      referrerUserId: owner.userId,
      redeemedByUserId: redeemerId,
    });
  } catch {
    return { ok: false, reason: "already_redeemed" };
  }

  // New user always gets the reward.
  await grantPremiumDays(db, redeemerId, config.referral.rewardDays);

  // Referrer gets it too, up to the monthly cap (counted after this insert).
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [{ c } = { c: 0 }] = await db
    .select({ c: count() })
    .from(referralRedemptions)
    .where(
      and(
        eq(referralRedemptions.referrerUserId, owner.userId),
        gte(referralRedemptions.createdAt, monthStart),
      ),
    );
  if (Number(c) <= config.referral.monthlyCap) {
    await grantPremiumDays(db, owner.userId, config.referral.rewardDays);
  }

  return { ok: true, rewardDays: config.referral.rewardDays };
}

/** Code + how many friends have redeemed it, for the invite screen. */
export async function referralStats(
  db: Db,
  userId: string,
): Promise<{ code: string; invited: number }> {
  const code = await getOrCreateCode(db, userId);
  const [{ c } = { c: 0 }] = await db
    .select({ c: count() })
    .from(referralRedemptions)
    .where(eq(referralRedemptions.referrerUserId, userId));
  return { code, invited: Number(c) };
}

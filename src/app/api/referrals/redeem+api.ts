import { db } from "@/db";
import { requireUser, route } from "@/server/auth";
import { redeemCode } from "@/server/referrals";

/**
 * Redeem a referral code for the signed-in user. On success both the new user
 * and the referrer are granted comp Premium days. All anti-abuse rules live in
 * `redeemCode`. Distinct failure reasons map to 404 (bad code) / 409 (conflict).
 */
export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const body = (await request.json().catch(() => null)) as { code?: unknown };
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) return Response.json({ error: "code required" }, { status: 400 });

  const result = await redeemCode(db, userId, code);
  if (!result.ok) {
    const status = result.reason === "invalid_code" ? 404 : 409;
    return Response.json({ error: result.reason, code: result.reason }, { status });
  }
  return Response.json({ ok: true, rewardDays: result.rewardDays });
});

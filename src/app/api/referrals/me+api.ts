import { db } from "@/db";
import { requireUser, route } from "@/server/auth";
import { referralStats } from "@/server/referrals";
import { config } from "@/config";

/**
 * The caller's invite code, share URL, and how many friends have joined via it.
 * Powers the "Invite friends" screen. The code is created lazily on first call.
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const { code, invited } = await referralStats(db, userId);
  return Response.json({
    code,
    invited,
    url: `${config.referral.shareBaseUrl}?ref=${code}`,
    rewardDays: config.referral.rewardDays,
  });
});

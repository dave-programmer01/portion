# Measurement: funnel, retention, and per-creator attribution

The events already fire (`src/lib/analytics.ts`): `onboarding_started`,
`onboarding_completed`, `first_win`, `food_logged`, `paywall_viewed`,
`subscription_started`, `referral_shared`, `referral_redeemed`. Users are
identified by opaque Clerk id.

## 1. Activation funnel (PostHog → Insights → Funnel)
Steps, in order (conversion window 24h for the first run, then 7d):
1. `onboarding_started`
2. `onboarding_completed`
3. `first_win`            ← the <90s welcome hand-off worked
4. `food_logged`          ← first real value
5. `paywall_viewed`
6. `subscription_started` ← trial started

Watch the biggest drop. Expected weak points: `onboarding_completed → first_win`
(hand-off friction) and `paywall_viewed → subscription_started` (price/timing).

## 2. Retention (PostHog → Retention)
- Returning event: **`food_logged`**. Period: **daily**.
- Targets from category research: **D1 > 20–25%**, and **D3 is the cliff** to beat
  (77% of the category is gone by day 3). This is the single number that decides
  whether to scale a channel.

## 3. Per-creator SIGNUPS — works today (DB query)
Every creator shares their in-app code, and redemptions are recorded server-side.
Run this against the Neon DB for a live leaderboard:
```sql
SELECT rc.code,
       u.email                       AS creator,
       count(rr.id)                  AS signups,
       min(rr.created_at)            AS first_signup,
       max(rr.created_at)            AS last_signup
FROM referral_codes rc
JOIN users u              ON u.id = rc.user_id
LEFT JOIN referral_redemptions rr ON rr.referrer_user_id = rc.user_id
GROUP BY rc.code, u.email
ORDER BY signups DESC;
```
(Tag which code = which creator in the tracking sheet in `creator-kit.md`.)

## 4. Per-creator RETENTION / funnel — IMPLEMENTED ✅
On redemption, the redeemer is now tagged with a person property
`acquired_via = <code>` (`setAcquisitionSource` in `src/lib/analytics.ts`, called
from `src/app/(tabs)/home.tsx`), and the `referral_redeemed` event carries the
`code`. So in PostHog you can break everything down by creator:
- **Funnel → Breakdown by** person property `acquired_via` → conversion per creator.
- **Retention → filtered by** `acquired_via = <code>` → D1/D3 per creator.

This is the view the Week-4 decision depends on: *which creator drove retaining
installs*, not just installs.

## 5. The Week-4 decision, in numbers
For each creator/style, compare **installs** vs **D1-retained signups** (not vanity
installs). Keep whatever produced retaining users cheaply; only after one style wins
do you put money behind that exact style. If nothing retains, the fix is the hook or
the first-run — not spend.

# RevenueCat go-live runbook (iOS)

The RevenueCat **code is already written** and activates purely on config. This is
the dashboard + env + build work to flip it on. Do it top-to-bottom.

## 0. Prerequisite
- [ ] Apple Developer Program enrolled (can take 1–2 days — start first).

## 1. App Store Connect — create the products
1. Create the app (bundle id **`app.portion`**).
2. Create an **auto-renewable subscription group** (e.g. "Portion Premium").
3. Add two subscriptions in that group — prices **must match `config.prices`**:
   - **Monthly** — product id `portion_premium_monthly` — **$9.99**
   - **Annual** — product id `portion_premium_annual` — **$59.99**
4. On each, add an **Introductory Offer → Free → 7 days**.
5. Fill in localization + review screenshot per product (Apple requires it).

## 2. RevenueCat dashboard
1. New project → add an **App Store** app; paste the **App Store Connect shared secret**
   (App Store Connect → App → App Information → App-Specific Shared Secret).
2. **Entitlements** → create **`premium`** (this exact id — it's `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT`'s default).
3. **Products** → import the two App Store products → attach both to the `premium` entitlement.
4. **Offerings** → create `default` → add two packages: **Monthly** and **Annual**,
   each pointing at the matching product. (`src/lib/purchases.ts` reads
   `offerings.current.availablePackages`.)
5. **Integrations → Webhooks** → add:
   - URL: `https://portion.expo.app/api/webhooks/revenuecat`
   - Authorization header value: a strong secret you generate now (save it — it's
     `REVENUECAT_WEBHOOK_AUTH` below). The route rejects anything else with 401.
6. Copy the **Apple/iOS Public SDK key** (Project → API keys) → that's `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.

## 3. Set env vars

Generate the webhook secret:
```bash
openssl rand -hex 24        # copy the output → use as REVENUECAT_WEBHOOK_AUTH
```

Set them on EAS (public keys are plaintext; the webhook secret is `secret`):
```bash
# Client-baked public keys (needed at BUILD time)
eas env:create production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY   --value "appl_XXXXXXXX" --visibility plaintext
eas env:create production --name EXPO_PUBLIC_REVENUECAT_ENTITLEMENT --value "premium"     --visibility plaintext

# Server secret for the webhook (used by the deployed backend)
eas env:create production --name REVENUECAT_WEBHOOK_AUTH --value "<the openssl hex>" --visibility secret
```
Also mirror them into your local `.env` so dev builds/tests match:
```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_XXXXXXXX
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT=premium
REVENUECAT_WEBHOOK_AUTH=<the openssl hex>
```

## 4. Redeploy the backend so the webhook authenticates
```bash
npx expo export --platform web
npx eas deploy --prod --environment production --non-interactive
```
Verify (should now be **401 without** the header, **not 500** "secret not set"):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://portion.expo.app/api/webhooks/revenuecat
```

## 5. Build the app with the native module
`react-native-purchases` is native — the current dev client can't do real purchases.
```bash
eas build --profile production --platform ios     # → upload to TestFlight
# (or --profile preview for a quick simulator/device smoke test first)
```
When the build has the RC keys baked in, `config.revenuecat.enabled` is `true`, so
`src/app/paywall.tsx` runs real purchases and the dev-tier bypass self-disables.

## 6. Verify the full chain (once)
- Create a **Sandbox Apple tester** (App Store Connect → Users and Access → Sandbox).
- On the TestFlight build: open paywall → real prices show (`revenueCatEnabled` true) →
  start the 7-day trial → purchase completes → app shows Premium.
- RevenueCat → Customer history shows the event; the **webhook fires** →
  Inngest `update-tier` runs → the user's `users.tier` flips to `premium` with a
  `tier_expires_at`. (Spot-check the row.)
- Test **Restore Purchases** on a second device with the same sandbox account.

## Gotchas
- Prices in App Store Connect must equal `config.prices` (9.99 / 59.99) or the
  paywall copy and the charge disagree.
- The entitlement id must be exactly **`premium`** unless you also change the env var.
- `EXPO_PUBLIC_*` vars are baked at build time — changing them needs a **new build**,
  not just a redeploy.
- Keep `REVENUECAT_WEBHOOK_AUTH` identical in RevenueCat's header field and EAS.

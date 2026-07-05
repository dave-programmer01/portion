# Portion — AI calorie tracker + workout planner

Native iOS + Android app (no web). Beginner-focused: tell users what to eat and
train *today* rather than handing them an empty diary. Keep that wedge in mind.

## ⚠️ Never run the app yourself
The dev server is ALREADY running in the user's terminal. Do NOT run
`expo start`, `npm run ios/android/web`, `expo run:*`, or otherwise launch,
rebuild, or restart the app. Make the code change and let the user's running
instance pick it up. (Type-checking / linting is fine.)

## ⚠️ Expo SDK 57 has CHANGED
Read the versioned docs before writing ANY Expo code:
https://docs.expo.dev/versions/v57.0.0/
APIs from older SDKs (or from memory) are frequently wrong. Verify import paths
against v57 specifically.

## Stack (LOCKED — do not swap without asking)
- Expo SDK 57, expo-router, TypeScript
- NativeWind v4 for styling (Tailwind classes) — not StyleSheet
- Clerk auth — Google + Apple sign-in ONLY
- Neon Postgres + Drizzle ORM
- Inngest for all background jobs
- ImageKit for image resize/storage
- Anthropic `claude-haiku-4-5` for vision + workout gen
- RevenueCat for IAP (App Store rules: IAP only, no external payment)
- Open Food Facts for barcodes + a global FoodMaster cache
- Sentry (errors), PostHog (analytics)

## UI conventions
- Use expo-router NATIVE tabs for the tab bar (not the JS tab bar). Verify the
  exact API in the v57 docs before using.
- Prefer @expo/ui native components and expo-glass-effect (Liquid Glass) for
  platform-native feel.
- Style with NativeWind className, not inline StyleSheet objects.

## Architecture boundaries (do not cross)
- AI calls happen ONLY inside Inngest jobs. Never call Anthropic from the client
  or synchronously from a request. Secrets stay server-side.
- Server logic lives in Expo Router API routes.
- Photo logging is OPTIMISTIC: entry appears instantly as "analyzing", Inngest
  fills it in. A failed scan burns NO quota (retry / manual fallback).
- Calorie & macro targets = Mifflin-St Jeor formula, NOT AI.
- All limits, model IDs, prices, and the monthly spend ceiling are CONFIG
  values, never hardcoded.

## Out of scope for v1
Social, human coaching, Health/Google Fit sync, web app, recipes,
water/sleep/steps, wearables, offline logging. Don't build these.

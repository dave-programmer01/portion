# Portion — Implementation Plan

AI calorie tracker & workout planner. Native iOS + Android (Expo SDK 57).
Target user: beginners who want to build muscle / lose fat but don't know where to start.
Wedge: **zero-knowledge onboarding** — tell them what to eat and what to train today.

> **Working agreement:** We tick these boxes as features land. `[ ]` = todo, `[x]` = done.
> Before writing any native code, read the exact Expo SDK 57 docs (https://docs.expo.dev/versions/v57.0.0/) — SDK 57 changed APIs.

---

## Locked decisions (reference)

- **App:** Expo SDK 57, expo-router (file-based), TypeScript, React 19.2 / RN 0.86.
- **Auth:** Clerk (`@clerk/clerk-expo`) — Google + Apple only.
- **Backend:** Expo Router API routes, deployed to **Vercel**. All secrets server-side.
- **DB:** Neon (Postgres) + Drizzle ORM.
- **Background jobs:** Inngest.
- **AI:** Anthropic `claude-haiku-4-5` (vision + workout gen). Sonnet 5 = future "premium accuracy" upgrade.
- **Images:** ImageKit — resize to ~1024px before AI call, then store.
- **Billing:** RevenueCat — monthly + annual, 7-day trial on annual.
- **Nutrition data:** Open Food Facts (barcodes) + cached global `FoodMaster`.
- **Errors:** Sentry. **Analytics:** PostHog.
- **Targets:** Mifflin-St Jeor formula (NOT AI).
- **Config-driven:** model, `FREE_SCANS_PER_DAY=3`, `MONTHLY_AI_SPEND_CEILING_USD=20`, image px, prices.

### Out of scope for v1
Social/feed · human coaching · Apple Health / Google Fit sync · web app · recipes · water/sleep/steps · wearables · offline logging · adaptive programming · admin app.

---

## Phase 0 — Foundations

- [x] Expo SDK 57 app scaffold (expo-router, TS) — *already present in repo*
- [x] Remove/replace starter demo code (demo `explore` route, tutorial assets gone; `src/app/` = `index`, `home`, `_layout`)
- [ ] Decide app directory structure (route groups: `(auth)`, `(onboarding)`, `(app)`)
- [ ] Config module — all caps/model/prices/spend-ceiling as env/remote-config values
- [x] `.env` handling — values populated in `.env` (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` etc.)
- [x] Clerk wired (`@clerk/expo`), `ClerkProvider` + SecureStore token cache in root layout, Google + Apple providers
- [ ] Neon project + Drizzle ORM + migration tooling; connection health check
- [ ] Expo Router API routes building & deploying to Vercel (confirm v57 hosting story)
- [ ] Inngest client + endpoint route; local dev harness
- [ ] Sentry (client + server) init + test event
- [ ] PostHog init + test event
- [ ] ImageKit SDK + signed-upload endpoint; test upload + resize transform
- [ ] RevenueCat (`react-native-purchases`) init; sandbox connectivity check
- [ ] Anthropic SDK server-side; test Haiku call from an Inngest function

## Phase 1 — Auth + onboarding + targets

- [x] Google/Apple sign-in — single combined auth landing screen (Clerk `useSSO`, one page for both providers)
- [ ] Auth routing: new user → onboarding gate, returning → dashboard
- [ ] Health disclaimer + screening question (pregnancy/conditions → "consult a doctor")
- [ ] Onboarding form: goal, sex, age, height, weight, target weight, activity, experience, equipment, training days/wk, injuries
- [ ] Unit preference (metric canonical storage, user-selectable display)
- [ ] Compute + store `NutritionTargets` via Mifflin-St Jeor (+ activity + goal adjustment)
- [ ] Recompute targets when profile changes

## Phase 2 — Food logging

**Barcode + search first (cheap, no AI risk):**
- [ ] Barcode scan (expo-camera) → Open Food Facts lookup
- [ ] `FoodMaster` global cache (Open Food Facts + confirmed AI results, with confidence gate)
- [ ] Serving-size picker + log to `FoodEntry`/`FoodItem`
- [ ] Manual search + manual entry
- [ ] `SavedMeal` (favorites) one-tap re-log

**Photo AI (optimistic flow):**
- [ ] Capture photo → ImageKit upload + resize to ~1024px
- [ ] `FoodEntry` created `pending`, shown instantly as "analyzing…"
- [ ] Inngest job: Haiku vision call w/ structured output (food items + macros)
- [ ] Fill `FoodItem`s, flip entry to `complete`, recompute daily total
- [ ] Failure → `failed` state ("retry / log manually"), **no quota burned, no total change**
- [ ] Editable result: add/edit/delete items + AI-guessed portions before confirm
- [ ] Prompt-cache the system prompt + food schema

**Dashboard:**
- [ ] Daily dashboard: calories/macros vs targets, grouped by meal type

## Phase 3 — Workouts

- [ ] Curated/seeded `Exercise` library (safety-reviewed)
- [ ] Haiku generates split from onboarding answers → `WorkoutPlan` / `WorkoutDay`
- [ ] Free = 3-day full-body; premium = 4–6 day + regenerate (gated in Phase 4)
- [ ] Workout session UI: exercises w/ target sets/reps
- [ ] Log reps/weight, check off completed sets
- [ ] Rest timer between sets

## Phase 4 — Monetization & gating

- [ ] RevenueCat paywall UI (monthly + annual, 7-day trial on annual)
- [ ] RevenueCat → Inngest webhook → update `tier` in Neon
- [ ] `UsageCounter` server-enforced (3 photo scans/day free; burns on success only)
- [ ] Paywall on cap hit (barcode/search stay free)
- [ ] History gating (7-day free / unlimited premium)
- [ ] Workout plan regeneration gating

## Phase 5 — Progress, safety, account

- [ ] `WeightLog` + weight trend chart
- [ ] Macro/calorie history charts
- [ ] In-app account deletion (wipe Neon data + Clerk user)

## Phase 6 — Observability & cost guardrails

- [ ] Structured logging on every AI call (latency, tokens, cost, success/fail)
- [ ] Daily scan + spend metric
- [ ] Spend-ceiling enforcement: at cap, disable free scans (keep barcode/search + premium)
- [ ] Empty / error / offline / slow-network states
- [ ] Abuse/spam guards

## Definition of done (v1)

- [ ] Unit tests: Mifflin-St Jeor targets, macro math, quota accounting, tier gating
- [ ] Integration tests: optimistic photo flow (incl. failure/reconciliation), RevenueCat webhook → tier, account deletion
- [ ] Manual E2E on iOS + Android: onboarding → log → workout → paywall
- [ ] App Store readiness: Apple sign-in, in-app account deletion, IAP-only billing, health disclaimer

---

## Open risks (track, don't forget)

- [ ] Photo portion accuracy (mitigate: always-editable + "estimate" framing)
- [ ] Optimistic-flow reconciliation complexity (pending/failed/total recompute)
- [ ] App Store review gates (Apple sign-in, in-app deletion, IAP-only, health claims)
- [ ] `FoodMaster` cache quality (needs confidence/verification rule before caching AI results)
- [ ] Expo SDK 57 API changes (mitigate: read v57 docs per module before coding)
- [ ] AI budget ($20/mo beta ceiling) — keep caps/model config-driven; revisit as revenue grows

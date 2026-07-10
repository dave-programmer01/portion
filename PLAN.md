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
- [x] Decide app directory structure (`(tabs)`, `onboarding`, `log/*` modal, `session/[dayId]`, `api/*`)
- [x] Config module — all caps/model/prices/spend-ceiling as env/remote-config values (`src/config.ts`)
- [x] `.env` handling — values populated in `.env` (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` etc.)
- [x] Clerk wired (`@clerk/expo`), `ClerkProvider` + SecureStore token cache in root layout, Google + Apple providers
- [x] Neon project + Drizzle ORM + migration tooling; connection health check
- [ ] Expo Router API routes building & deploying to Vercel (confirm v57 hosting story)
- [x] Inngest client + endpoint route; local dev harness
- [ ] Sentry (client + server) init + test event
- [x] PostHog init + funnel events — privacy-scoped singleton (`src/lib/analytics.ts`), no autocapture/replay, closed event set (onboarding, food_logged, paywall, subscription); inert without `EXPO_PUBLIC_POSTHOG_KEY`
- [x] ImageKit signed-upload endpoint (`/api/imagekit/auth`) + client resize→upload (`src/lib/upload.ts`)
- [ ] RevenueCat (`react-native-purchases`) init; sandbox connectivity check
- [x] AI SDK server-side + call from Inngest — **using OpenAI (`gpt-4o-mini`), not Anthropic**, since only `OPENAI_API_KEY` is provisioned. Provider isolated in `src/server/ai.ts`, model in config; swap back to Haiku by changing config + that one file.

## Phase 1 — Auth + onboarding + targets

- [x] Google/Apple sign-in — single combined auth landing screen (Clerk `useSSO`, one page for both providers)
- [x] Auth routing: new user → onboarding gate, returning → dashboard (`ProfileProvider` + gates in `index`/`(tabs)`)
- [x] Health disclaimer + screening question (pregnancy/conditions → "consult a doctor")
- [x] Onboarding form: goal, sex, age, height, weight, target weight, activity, experience, equipment, training days/wk, injuries
- [x] Unit preference (metric canonical storage, user-selectable display)
- [x] Compute + store `NutritionTargets` via Mifflin-St Jeor (+ activity + goal adjustment) (`src/lib/nutrition.ts`)
- [x] Recompute targets when profile changes (server recomputes on every `PUT /api/profile`)

## Phase 2 — Food logging

**Barcode + search first (cheap, no AI risk):**
- [x] Barcode scan (expo-camera) → Open Food Facts lookup (`log/barcode`, `/api/food/barcode`)
- [x] `FoodMaster` global cache (barcode hits cached; AI-result caching w/ confidence gate still TODO)
- [x] Serving-size picker + log to `FoodEntry`/`FoodItem` (`serving-picker.tsx`)
- [x] Manual search + manual entry (`log/search`)
- [x] `SavedMeal` (favorites) one-tap re-log (API + re-log UI done; "save current entry as favorite" UI still TODO)

**Photo AI (optimistic flow):**
- [x] Capture photo → ImageKit upload + resize to ~1024px (client resize in `src/lib/upload.ts`)
- [x] `FoodEntry` created `pending`, shown instantly as "analyzing…" (home + food diary, with polling)
- [x] Inngest job: vision call w/ structured output (food items + macros) — OpenAI, see Phase 0 note
- [x] Fill `FoodItem`s, flip entry to `complete`, recompute daily total
- [x] Failure → `failed` state ("log manually"), **no quota burned, no total change**
- [x] Editable result: delete items from an entry; barcode/search/manual portions editable before confirm
- [x] Prompt-cache the system prompt + food schema (static system prompt → provider auto prompt-caching)

**Dashboard:**
- [x] Daily dashboard: calories/macros vs targets, grouped by meal type (`(tabs)/home`, `(tabs)/food`)

## Phase 3 — Workouts

- [x] Curated/seeded `Exercise` library (safety-reviewed) — 32 movements, lazily seeded (`exercises-data.ts`)
- [x] AI generates split from onboarding answers → `WorkoutPlan` / `WorkoutDay` (OpenAI; ids validated against library)
- [x] Free = 3-day full-body split default (4–6 day mapping present; premium regenerate gate is Phase 4)
- [x] Workout session UI: exercises w/ target sets/reps (`session/[dayId]`)
- [x] Log reps/weight, check off completed sets (auto-persisted via `PATCH /api/workouts/sessions/[id]`)
- [x] Rest timer between sets (starts on set completion, +15s / skip)

## Phase 4 — Monetization & gating

- [x] RevenueCat paywall UI (monthly + annual, 7-day trial on annual) — `app/paywall.tsx`; purchase behind `config.revenuecat.enabled` (dev mock-upgrade when unset)
- [x] RevenueCat → Inngest webhook → update `tier` in Neon (`api/webhooks/revenuecat`, `inngest/functions/update-tier`)
- [x] Server-enforced quota (3 photo scans/day free; failed scans drop out of the count → burn nothing) — `server/billing.photoScansToday` + `lib/gating.photoScanAllowed`
- [x] Paywall on cap hit — photo POST returns 402; client routes to `/paywall`. Barcode/search/manual stay free
- [x] History gating (7-day free / unlimited premium) — `lib/gating` enforced in `food/day` + `food/history` + `weight`
- [x] Workout plan regeneration gating — free = one 3-day full body, no regen; premium = up to 6-day + regenerate (`workouts/plan` POST)

## Phase 5 — Progress, safety, account

- [x] `WeightLog` + weight trend chart (`api/weight`, `components/charts.LineChart`, progress tab). Logging today updates current weight + recomputes targets
- [x] Macro/calorie history charts (`api/food/history`, `components/charts.BarChart` vs target)
- [x] In-app account deletion (wipe Neon data + Clerk user) — `api/account` DELETE + progress-tab action → sign out

## Phase 6 — Observability & cost guardrails

- [x] Structured logging on every AI call (latency, tokens, cost, success/fail) — `aiCallLog` table, written in `server/ai.ts`
- [x] Daily scan + spend metric — `api/metrics` (admin-guarded) via `scansTodayGlobal` + `monthToDateSpendUsd`
- [x] Spend-ceiling enforcement: at cap, free photo scans blocked (barcode/search + premium stay) — `photoScanAllowed` spend-ceiling branch
- [x] Empty / error / offline states — `CenterState` + `ErrorState` wired into food/workout (+ existing empty states); slow-network shows loading/pending
- [~] Abuse/spam guards — daily scan cap + global spend ceiling bound AI cost; per-IP/minute rate limiting on OFF lookups still TODO

## Definition of done (v1)

- [x] Unit tests: Mifflin-St Jeor targets, macro math, quota accounting, tier gating (`tests/`, `npm test` — 12 passing)
- [ ] Integration tests: optimistic photo flow (incl. failure/reconciliation), RevenueCat webhook → tier, account deletion — *needs a DB-backed test harness (not set up)*
- [ ] Manual E2E on iOS + Android: onboarding → log → workout → paywall
- [x] App Store readiness: Apple sign-in ✓, in-app account deletion ✓, IAP-only billing (RevenueCat) ✓, health disclaimer ✓ — *still needs real IAP products + dev-client rebuild to ship*

---

## Open risks (track, don't forget)

- [ ] Photo portion accuracy (mitigate: always-editable + "estimate" framing)
- [ ] Optimistic-flow reconciliation complexity (pending/failed/total recompute)
- [ ] App Store review gates (Apple sign-in, in-app deletion, IAP-only, health claims)
- [ ] `FoodMaster` cache quality (needs confidence/verification rule before caching AI results)
- [ ] Expo SDK 57 API changes (mitigate: read v57 docs per module before coding)
- [ ] AI budget ($20/mo beta ceiling) — keep caps/model config-driven; revisit as revenue grows

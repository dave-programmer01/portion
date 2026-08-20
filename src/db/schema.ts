import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Users synced from Clerk. `id` is the Clerk user id (e.g. `user_2abc…`),
 * so we never generate our own — Clerk is the source of truth for identity.
 * Profile / onboarding data lives in separate tables below.
 */
export type Tier = "free" | "premium";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  // Billing tier, synced from RevenueCat via webhook (Phase 4). `free` default.
  tier: text("tier").$type<Tier>().default("free").notNull(),
  tierExpiresAt: timestamp("tier_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// --- Enumerated string unions (stored as plain text to keep migrations simple) ---

export type Goal = "lose" | "maintain" | "gain";
export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "bodyweight" | "dumbbells" | "full_gym";
export type UnitPreference = "metric" | "imperial";
export type BudgetPeriod = "day" | "week";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type EntryStatus = "pending" | "complete" | "failed";
export type EntrySource = "photo" | "barcode" | "search" | "manual" | "saved";
export type FoodSource = "off" | "ai" | "manual";
export type PlanStatus = "generating" | "active" | "failed";

/**
 * Onboarding answers. Canonical storage is METRIC (cm / kg); the user's chosen
 * display units live in `unitPreference` and conversion happens in the UI.
 * `healthFlag` = the screening surfaced a "consult a doctor" condition.
 */
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  goal: text("goal").$type<Goal>().notNull(),
  sex: text("sex").$type<Sex>().notNull(),
  age: integer("age").notNull(),
  heightCm: real("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  targetWeightKg: real("target_weight_kg"),
  activityLevel: text("activity_level").$type<ActivityLevel>().notNull(),
  experience: text("experience").$type<Experience>().notNull(),
  // Legacy coarse tier (kept for backward compat); `equipmentItems` is the
  // source of truth for what the user actually owns. See lib/equipment.
  equipment: text("equipment").$type<Equipment>().notNull(),
  // The user's equipment inventory (e.g. ["dumbbells","pullup_bar"]). Empty =
  // bodyweight. Drives which exercises the planner may use.
  equipmentItems: jsonb("equipment_items")
    .$type<string[]>()
    .default([])
    .notNull(),
  trainingDaysPerWeek: integer("training_days_per_week").notNull(),
  // Muscle groups the user wants their plan to focus on (see lib/workout-focus).
  // `["full_body"]` (the default) = balanced whole-body training.
  focusAreas: jsonb("focus_areas")
    .$type<string[]>()
    .default(["full_body"])
    .notNull(),
  injuries: text("injuries"),
  unitPreference: text("unit_preference")
    .$type<UnitPreference>()
    .default("metric")
    .notNull(),
  healthAck: boolean("health_ack").default(false).notNull(),
  healthFlag: boolean("health_flag").default(false).notNull(),
  // Daily step goal (device pedometer). Editable in the Goals screen.
  stepGoal: integer("step_goal").default(10000).notNull(),
  // Opt-in grocery budget for the "eat well on your budget" planner. All three
  // are null until the user opts in. Does NOT affect Mifflin-St Jeor targets —
  // it only steers which foods the (offline, non-AI) budget optimizer suggests.
  budgetAmount: real("budget_amount"),
  budgetPeriod: text("budget_period").$type<BudgetPeriod>(),
  budgetCurrency: text("budget_currency"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

/**
 * Daily nutrition targets — derived from the profile via Mifflin-St Jeor
 * (NOT AI). Recomputed whenever the profile changes. One row per user.
 */
export const nutritionTargets = pgTable("nutrition_targets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bmr: integer("bmr").notNull(),
  tdee: integer("tdee").notNull(),
  calories: integer("calories").notNull(),
  proteinG: integer("protein_g").notNull(),
  carbsG: integer("carbs_g").notNull(),
  fatG: integer("fat_g").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type NutritionTargets = typeof nutritionTargets.$inferSelect;

/**
 * Global food cache. Populated from Open Food Facts (barcodes/search) and from
 * confirmed AI results (behind a confidence gate). Macros stored per 100 g so
 * any serving size can be derived. `barcode` is the OFF lookup key.
 */
export const foodMaster = pgTable(
  "food_master",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").$type<FoodSource>().notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    brand: text("brand"),
    caloriesPer100: real("calories_per_100").notNull(),
    proteinPer100: real("protein_per_100").notNull(),
    carbsPer100: real("carbs_per_100").notNull(),
    fatPer100: real("fat_per_100").notNull(),
    defaultServingG: real("default_serving_g"),
    servingLabel: text("serving_label"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("food_master_barcode_idx").on(t.barcode)],
);

export type FoodMaster = typeof foodMaster.$inferSelect;

/**
 * A logged eating occasion. Photo entries are created OPTIMISTICALLY as
 * `pending` and filled in by the Inngest vision job; barcode/search/manual
 * entries land `complete`. `loggedDate` is the local day the entry counts for.
 * `total*` are denormalised sums of the child items for cheap dashboard reads.
 */
export const foodEntry = pgTable(
  "food_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    loggedDate: date("logged_date").notNull(),
    mealType: text("meal_type").$type<MealType>().notNull(),
    status: text("status").$type<EntryStatus>().default("complete").notNull(),
    source: text("source").$type<EntrySource>().notNull(),
    imageUrl: text("image_url"),
    // ImageKit fileId for the uploaded photo (photo entries only). Stored so we
    // can delete the asset from ImageKit when the entry or account is removed —
    // the public URL alone isn't a delete key.
    imageFileId: text("image_file_id"),
    note: text("note"),
    // AI vision's overall confidence (0..1) for a photo entry; null for
    // barcode/search/manual entries and user-edited items. Drives a "double-
    // check this estimate" nudge in the UI when the model wasn't sure.
    confidence: real("confidence"),
    totalCalories: integer("total_calories").default(0).notNull(),
    totalProteinG: integer("total_protein_g").default(0).notNull(),
    totalCarbsG: integer("total_carbs_g").default(0).notNull(),
    totalFatG: integer("total_fat_g").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("food_entry_user_date_idx").on(t.userId, t.loggedDate)],
);

export type FoodEntry = typeof foodEntry.$inferSelect;
export type NewFoodEntry = typeof foodEntry.$inferInsert;

/**
 * Individual foods inside an entry (e.g. "grilled chicken", "rice"). AI vision
 * writes one row per detected item; barcode/manual entries usually have one.
 */
export const foodItem = pgTable(
  "food_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .references(() => foodEntry.id, { onDelete: "cascade" })
      .notNull(),
    foodMasterId: uuid("food_master_id").references(() => foodMaster.id),
    name: text("name").notNull(),
    brand: text("brand"),
    quantity: real("quantity").default(1).notNull(),
    unit: text("unit").default("serving").notNull(),
    servingLabel: text("serving_label"),
    calories: integer("calories").notNull(),
    proteinG: real("protein_g").default(0).notNull(),
    carbsG: real("carbs_g").default(0).notNull(),
    fatG: real("fat_g").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("food_item_entry_idx").on(t.entryId)],
);

export type FoodItem = typeof foodItem.$inferSelect;
export type NewFoodItem = typeof foodItem.$inferInsert;

/** Item shape stored on a saved meal (favorite) for one-tap re-log. */
export type SavedMealItem = {
  name: string;
  brand?: string | null;
  quantity: number;
  unit: string;
  servingLabel?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const savedMeal = pgTable("saved_meal", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  mealType: text("meal_type").$type<MealType>(),
  items: jsonb("items").$type<SavedMealItem[]>().notNull(),
  totalCalories: integer("total_calories").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SavedMeal = typeof savedMeal.$inferSelect;

// --- Workouts (Phase 3) ---

/**
 * Curated, safety-reviewed exercise library. `id` is a stable slug so the AI
 * can reference exercises by name → we resolve to these rows (never let the AI
 * invent unsafe movements).
 */
export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(), // slug, e.g. "goblet-squat"
  name: text("name").notNull(),
  muscleGroup: text("muscle_group").notNull(),
  category: text("category").notNull(), // compound | isolation
  equipment: text("equipment").notNull(),
  instructions: text("instructions").notNull(),
  defaultSets: integer("default_sets").default(3).notNull(),
  defaultReps: text("default_reps").default("8-12").notNull(),
});

export type Exercise = typeof exercises.$inferSelect;

/** One exercise slot inside a workout day. */
export type WorkoutDayExercise = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  notes?: string;
};

/**
 * A generated training plan. Created `generating` when the user requests one;
 * the Inngest job fills the days and flips it to `active` (or `failed`).
 * `isActive` marks the single plan the app currently trains against.
 */
export const workoutPlan = pgTable(
  "workout_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    goal: text("goal").$type<Goal>().notNull(),
    daysPerWeek: integer("days_per_week").notNull(),
    split: text("split").notNull(),
    status: text("status").$type<PlanStatus>().default("generating").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("workout_plan_user_idx").on(t.userId)],
);

export type WorkoutPlan = typeof workoutPlan.$inferSelect;

export const workoutDay = pgTable(
  "workout_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .references(() => workoutPlan.id, { onDelete: "cascade" })
      .notNull(),
    dayIndex: integer("day_index").notNull(),
    name: text("name").notNull(), // e.g. "Full Body A"
    focus: text("focus"),
    exercises: jsonb("exercises").$type<WorkoutDayExercise[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("workout_day_plan_idx").on(t.planId)],
);

export type WorkoutDay = typeof workoutDay.$inferSelect;

/** A single time the user trains a workout day. */
export const workoutSession = pgTable(
  "workout_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    dayId: uuid("day_id")
      .references(() => workoutDay.id, { onDelete: "cascade" })
      .notNull(),
    loggedDate: date("logged_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("workout_session_user_idx").on(t.userId)],
);

export type WorkoutSession = typeof workoutSession.$inferSelect;

/**
 * Body-weight history (Phase 5). One row per weigh-in; canonical kg. Powers the
 * weight-trend chart and progress toward `profiles.targetWeightKg`.
 */
export const weightLog = pgTable(
  "weight_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    loggedDate: date("logged_date").notNull(),
    weightKg: real("weight_kg").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("weight_log_user_date_idx").on(t.userId, t.loggedDate)],
);

export type WeightLog = typeof weightLog.$inferSelect;

/**
 * Daily step totals from the device pedometer (expo-sensors). One row per user
 * per day, upserted as the count updates. Powers the steps card + 7-day trend.
 */
export const stepLog = pgTable(
  "step_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    loggedDate: date("logged_date").notNull(),
    steps: integer("steps").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("step_log_user_date_uq").on(t.userId, t.loggedDate)],
);

export type StepLog = typeof stepLog.$inferSelect;

/**
 * Structured log of every AI call (Phase 6). Powers cost dashboards and the
 * monthly spend-ceiling guardrail. `costUsd` is computed from token usage +
 * per-model pricing in config.
 */
export const aiCallLog = pgTable(
  "ai_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    kind: text("kind").notNull(), // "vision" | "workout"
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    completionTokens: integer("completion_tokens").default(0).notNull(),
    costUsd: real("cost_usd").default(0).notNull(),
    latencyMs: integer("latency_ms").default(0).notNull(),
    success: boolean("success").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("ai_call_log_created_idx").on(t.createdAt)],
);

export type AiCallLog = typeof aiCallLog.$inferSelect;

/** One logged set within a session. */
export const setLog = pgTable(
  "set_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => workoutSession.id, { onDelete: "cascade" })
      .notNull(),
    exerciseId: text("exercise_id").notNull(),
    exerciseName: text("exercise_name").notNull(),
    setIndex: integer("set_index").notNull(),
    targetReps: text("target_reps"),
    reps: integer("reps"),
    weightKg: real("weight_kg"),
    completed: boolean("completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("set_log_session_idx").on(t.sessionId)],
);

export type SetLog = typeof setLog.$inferSelect;

/**
 * Referral program. Each user has one shareable `code`; each redemption is one
 * row keyed uniquely by the redeemer, so a user can only ever redeem once. Both
 * sides are rewarded with comp Premium days via the `users.tier*` columns (no
 * RevenueCat needed for a comp reward). This is the near-zero-CAC growth loop.
 */
export const referralCodes = pgTable("referral_codes", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ReferralCode = typeof referralCodes.$inferSelect;

export const referralRedemptions = pgTable(
  "referral_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerUserId: text("referrer_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Unique → a user can only redeem a referral once, enforced at the DB level.
    redeemedByUserId: text("redeemed_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("referral_redemptions_referrer_idx").on(t.referrerUserId)],
);

export type ReferralRedemption = typeof referralRedemptions.$inferSelect;

/**
 * Registered Expo push tokens — one row per device (a user can have several).
 * Presence of a row means the user granted push permission and wants
 * server-driven nudges; it's deleted when they turn notifications off, so the
 * engagement cron treats "has a token" as "is reachable + opted in".
 * `lastPushedAt` throttles how often the cron may contact a user.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").notNull().unique(),
    platform: text("platform"), // "ios" | "android"
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("push_tokens_user_idx").on(t.userId)],
);

export type PushToken = typeof pushTokens.$inferSelect;

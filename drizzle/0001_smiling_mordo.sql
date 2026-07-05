CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"muscle_group" text NOT NULL,
	"category" text NOT NULL,
	"equipment" text NOT NULL,
	"instructions" text NOT NULL,
	"default_sets" integer DEFAULT 3 NOT NULL,
	"default_reps" text DEFAULT '8-12' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"logged_date" date NOT NULL,
	"meal_type" text NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"source" text NOT NULL,
	"image_url" text,
	"note" text,
	"total_calories" integer DEFAULT 0 NOT NULL,
	"total_protein_g" integer DEFAULT 0 NOT NULL,
	"total_carbs_g" integer DEFAULT 0 NOT NULL,
	"total_fat_g" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"food_master_id" uuid,
	"name" text NOT NULL,
	"brand" text,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'serving' NOT NULL,
	"serving_label" text,
	"calories" integer NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real DEFAULT 0 NOT NULL,
	"fat_g" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"calories_per_100" real NOT NULL,
	"protein_per_100" real NOT NULL,
	"carbs_per_100" real NOT NULL,
	"fat_per_100" real NOT NULL,
	"default_serving_g" real,
	"serving_label" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bmr" integer NOT NULL,
	"tdee" integer NOT NULL,
	"calories" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carbs_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"goal" text NOT NULL,
	"sex" text NOT NULL,
	"age" integer NOT NULL,
	"height_cm" real NOT NULL,
	"weight_kg" real NOT NULL,
	"target_weight_kg" real,
	"activity_level" text NOT NULL,
	"experience" text NOT NULL,
	"equipment" text NOT NULL,
	"training_days_per_week" integer NOT NULL,
	"injuries" text,
	"unit_preference" text DEFAULT 'metric' NOT NULL,
	"health_ack" boolean DEFAULT false NOT NULL,
	"health_flag" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"meal_type" text,
	"items" jsonb NOT NULL,
	"total_calories" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"exercise_name" text NOT NULL,
	"set_index" integer NOT NULL,
	"target_reps" text,
	"reps" integer,
	"weight_kg" real,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"name" text NOT NULL,
	"focus" text,
	"exercises" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"days_per_week" integer NOT NULL,
	"split" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day_id" uuid NOT NULL,
	"logged_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "food_entry" ADD CONSTRAINT "food_entry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_item" ADD CONSTRAINT "food_item_entry_id_food_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."food_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_item" ADD CONSTRAINT "food_item_food_master_id_food_master_id_fk" FOREIGN KEY ("food_master_id") REFERENCES "public"."food_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal" ADD CONSTRAINT "saved_meal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_day" ADD CONSTRAINT "workout_day_plan_id_workout_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan" ADD CONSTRAINT "workout_plan_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_day_id_workout_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."workout_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_entry_user_date_idx" ON "food_entry" USING btree ("user_id","logged_date");--> statement-breakpoint
CREATE INDEX "food_item_entry_idx" ON "food_item" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "food_master_barcode_idx" ON "food_master" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "set_log_session_idx" ON "set_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workout_day_plan_idx" ON "workout_day" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workout_plan_user_idx" ON "workout_plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workout_session_user_idx" ON "workout_session" USING btree ("user_id");
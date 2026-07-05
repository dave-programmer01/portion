import OpenAI from "openai";

import { config } from "@/config";
import type { Equipment, Experience, Goal } from "@/db/schema";

/**
 * AI provider module. The locked stack targets Anthropic `claude-haiku-4-5`,
 * but the beta only has an OpenAI key — so this runs on OpenAI, isolated here so
 * swapping the provider is a one-file change. Model ids come from `config`,
 * never hardcoded. Both calls use structured outputs (json_schema) so the jobs
 * never have to parse free text. The system prompts are static → OpenAI's
 * automatic prompt caching covers the "prompt-cache the schema" requirement.
 */

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

// --- Food photo vision ---

export type AnalyzedFoodItem = {
  name: string;
  quantity: number;
  unit: string;
  servingLabel: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type FoodAnalysis = {
  items: AnalyzedFoodItem[];
  confidence: number;
};

const FOOD_SYSTEM = `You are a nutrition estimator for a calorie-tracking app.
Given a photo of a meal, identify each distinct food and estimate its portion
and macros. Rules:
- Estimate realistic portions from visual cues (plate size, utensils).
- Always frame numbers as best-effort estimates; never refuse.
- calories/protein/carbs/fat are TOTALS for the estimated portion shown.
- unit is one of: "serving", "g", "ml", "piece", "cup".
- confidence is 0..1 for the overall estimate.
- If the image has no food, return an empty items array with confidence 0.`;

const FOOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    confidence: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          servingLabel: { type: ["string", "null"] },
          calories: { type: "number" },
          proteinG: { type: "number" },
          carbsG: { type: "number" },
          fatG: { type: "number" },
        },
        required: [
          "name",
          "quantity",
          "unit",
          "servingLabel",
          "calories",
          "proteinG",
          "carbsG",
          "fatG",
        ],
      },
    },
  },
  required: ["confidence", "items"],
} as const;

/** Vision call: estimate foods + macros from a (already resized) image URL. */
export async function analyzeFoodPhoto(imageUrl: string): Promise<FoodAnalysis> {
  const res = await openai().chat.completions.create({
    model: config.ai.visionModel,
    messages: [
      { role: "system", content: FOOD_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Estimate the foods and macros in this meal." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "food_analysis", strict: true, schema: FOOD_SCHEMA },
    },
  });

  const raw = res.choices[0]?.message.content;
  if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw) as FoodAnalysis;

  // Defensive rounding/coercion so bad numbers never reach the DB.
  return {
    confidence: clamp01(parsed.confidence),
    items: (parsed.items ?? []).map((i) => ({
      name: String(i.name).slice(0, 120),
      quantity: pos(i.quantity, 1),
      unit: i.unit || "serving",
      servingLabel: i.servingLabel ?? null,
      calories: Math.round(pos(i.calories, 0)),
      proteinG: round1(pos(i.proteinG, 0)),
      carbsG: round1(pos(i.carbsG, 0)),
      fatG: round1(pos(i.fatG, 0)),
    })),
  };
}

// --- Workout generation ---

export type WorkoutGenInput = {
  goal: Goal;
  experience: Experience;
  equipment: Equipment;
  daysPerWeek: number;
  injuries: string | null;
  allowed: { id: string; name: string; muscleGroup: string }[];
};

export type GeneratedDay = {
  name: string;
  focus: string;
  exercises: {
    exerciseId: string;
    sets: number;
    reps: string;
    restSec: number;
    notes?: string;
  }[];
};

export type WorkoutGen = { split: string; days: GeneratedDay[] };

const WORKOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    split: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          focus: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                exerciseId: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "string" },
                restSec: { type: "integer" },
                notes: { type: "string" },
              },
              required: ["exerciseId", "sets", "reps", "restSec", "notes"],
            },
          },
        },
        required: ["name", "focus", "exercises"],
      },
    },
  },
  required: ["split", "days"],
} as const;

/**
 * Build a split from onboarding answers. The model may ONLY reference exercise
 * ids from `allowed` (curated, safety-reviewed library) — callers must still
 * validate ids against that set before persisting.
 */
export async function generateWorkout(
  input: WorkoutGenInput,
): Promise<WorkoutGen> {
  const system = `You are a strength coach building a beginner-friendly plan.
Design exactly ${input.daysPerWeek} training days. Rules:
- Use ONLY exercises from the provided list, referenced by their exact id.
- Prefer compound movements; keep beginners to 4-6 exercises per day.
- sets 2-4, reps like "8-12", restSec 60-180.
- Balance push/pull/legs across the week; for 3 days use full-body.
- Respect the user's injuries by avoiding aggravating movements.
- "notes" is a short cue (may be empty string).`;

  const user = {
    goal: input.goal,
    experience: input.experience,
    equipment: input.equipment,
    daysPerWeek: input.daysPerWeek,
    injuries: input.injuries ?? "none",
    allowedExercises: input.allowed,
  };

  const res = await openai().chat.completions.create({
    model: config.ai.textModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "workout_plan", strict: true, schema: WORKOUT_SCHEMA },
    },
  });

  const raw = res.choices[0]?.message.content;
  if (!raw) throw new Error("Empty AI response");
  return JSON.parse(raw) as WorkoutGen;
}

// --- helpers ---
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
const pos = (n: number, fallback: number) =>
  Number.isFinite(n) && n >= 0 ? n : fallback;
const round1 = (n: number) => Math.round(n * 10) / 10;

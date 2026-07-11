import OpenAI from "openai";

import { config, aiCostUsd } from "@/config";
import { db } from "@/db";
import { aiCallLog } from "@/db/schema";
import { withGenAI, captureServerError } from "./monitoring";
import type { Experience, Goal } from "@/db/schema";

type Usage = { prompt_tokens?: number; completion_tokens?: number } | undefined;

/**
 * Structured log of one AI call for the cost dashboard + spend-ceiling guardrail
 * (Phase 6). Best-effort — a logging failure must never break the user flow.
 */
async function logAiCall(row: {
  kind: "vision" | "workout";
  model: string;
  usage: Usage;
  latencyMs: number;
  success: boolean;
  userId?: string | null;
}): Promise<void> {
  const promptTokens = row.usage?.prompt_tokens ?? 0;
  const completionTokens = row.usage?.completion_tokens ?? 0;
  try {
    await db.insert(aiCallLog).values({
      userId: row.userId ?? null,
      kind: row.kind,
      model: row.model,
      promptTokens,
      completionTokens,
      costUsd: aiCostUsd(row.model, promptTokens, completionTokens),
      latencyMs: row.latencyMs,
      success: row.success,
    });
  } catch (err) {
    console.error("[ai] logAiCall failed", err);
  }
}

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
- Food may be from ANY global cuisine — West African (e.g. jollof rice, egusi,
  puff puff, chin chin, suya), Indian, East/Southeast Asian, Latin American,
  Middle Eastern, Caribbean, and so on. Do NOT default to Western/American
  dishes; identify the actual dish shown, including local and packaged snacks.
- If the user provides a description of the food, treat it as a strong hint for
  identification and estimate that dish.
- Estimate realistic portions from visual cues (plate size, utensils, packaging).
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

/**
 * Vision call: estimate foods + macros from a (already resized) image URL.
 * An optional user-supplied `caption` ("what is this?") is passed as a strong
 * identification hint — this is where the model gains the most accuracy on
 * unfamiliar / regional dishes, since naming the dish is far easier than
 * recognising it from pixels alone.
 */
export async function analyzeFoodPhoto(
  imageUrl: string,
  userId?: string,
  caption?: string | null,
): Promise<FoodAnalysis> {
  const model = config.ai.visionModel;
  const started = Date.now();
  const hint = caption?.trim();
  const userText = hint
    ? `Estimate the foods and macros in this meal. The user says this is: "${hint}". Use that as a strong hint for identification.`
    : "Estimate the foods and macros in this meal.";
  let res;
  try {
    res = await withGenAI({ agent: "food-vision", model }, () =>
      openai().chat.completions.create({
        model,
        messages: [
          { role: "system", content: FOOD_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "food_analysis", strict: true, schema: FOOD_SCHEMA },
        },
      }),
    );
  } catch (err) {
    captureServerError(err, { kind: "vision", model, userId });
    await logAiCall({
      kind: "vision",
      model,
      usage: undefined,
      latencyMs: Date.now() - started,
      success: false,
      userId,
    });
    throw err;
  }
  await logAiCall({
    kind: "vision",
    model,
    usage: res.usage,
    latencyMs: Date.now() - started,
    success: true,
    userId,
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
  /** Human-readable summary of the user's available equipment. */
  equipment: string;
  daysPerWeek: number;
  injuries: string | null;
  /** Library muscle groups to prioritize; empty = balanced full body. */
  focus: string[];
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

/**
 * Structured-output schema for the plan. `exerciseId` is constrained to an enum
 * of the actual library ids, so the model can ONLY emit valid exercises — no
 * hallucinated ids that would get dropped (which previously left days empty →
 * plan marked `failed` → the user had to retry). Built per-request because the
 * allowed set depends on the user's equipment.
 */
function buildWorkoutSchema(allowedIds: string[]) {
  const exerciseId =
    allowedIds.length > 0
      ? { type: "string", enum: allowedIds }
      : { type: "string" };
  return {
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
                  exerciseId,
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
  };
}

/**
 * Build a split from onboarding answers. The model may ONLY reference exercise
 * ids from `allowed` (curated, safety-reviewed library) — callers must still
 * validate ids against that set before persisting.
 */
export async function generateWorkout(
  input: WorkoutGenInput,
  userId?: string,
): Promise<WorkoutGen> {
  // Focus overrides the default balance rule: prioritize the chosen muscle groups.
  const focusRule =
    input.focus.length > 0
      ? `- The user wants to focus on these muscle groups: ${input.focus.join(
          ", ",
        )}. Prioritize exercises for these across every training day; the majority of each day should target them, though you may add a few supporting compound movements. Still spread the focus work sensibly across the ${input.daysPerWeek} days so muscles get some recovery.`
      : `- Balance push/pull/legs across the week; for 3 days use full-body.`;

  const system = `You are a strength coach building a beginner-friendly plan.
Design exactly ${input.daysPerWeek} training days. Rules:
- Use ONLY exercises from the provided list, referenced by their exact id.
- Prefer compound movements; keep beginners to 4-6 exercises per day.
- sets 2-4, reps like "8-12", restSec 60-180.
${focusRule}
- Respect the user's injuries by avoiding aggravating movements.
- "notes" is a short cue (may be empty string).`;

  const user = {
    goal: input.goal,
    experience: input.experience,
    equipment: input.equipment,
    daysPerWeek: input.daysPerWeek,
    focus: input.focus.length > 0 ? input.focus : "full body (balanced)",
    injuries: input.injuries ?? "none",
    allowedExercises: input.allowed,
  };

  const model = config.ai.textModel;
  const started = Date.now();
  let res;
  try {
    res = await withGenAI({ agent: "workout-generation", model }, () =>
      openai().chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "workout_plan",
            strict: true,
            schema: buildWorkoutSchema(input.allowed.map((e) => e.id)),
          },
        },
      }),
    );
  } catch (err) {
    captureServerError(err, { kind: "workout", model, userId });
    await logAiCall({
      kind: "workout",
      model,
      usage: undefined,
      latencyMs: Date.now() - started,
      success: false,
      userId,
    });
    throw err;
  }
  await logAiCall({
    kind: "workout",
    model,
    usage: res.usage,
    latencyMs: Date.now() - started,
    success: true,
    userId,
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

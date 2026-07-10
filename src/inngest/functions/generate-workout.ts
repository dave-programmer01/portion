import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  profiles,
  workoutDay,
  workoutPlan,
  type WorkoutDayExercise,
} from "@/db/schema";
import { generateWorkout } from "@/server/ai";
import { getAllowedExercises } from "@/server/exercises";
import { normalizeFocus, focusMuscleGroups } from "@/lib/workout-focus";
import { resolveOwnedEquipment, equipmentSummary } from "@/lib/equipment";
import { WORKOUT_GENERATE_EVENT } from "@/config";

import { inngest } from "../client";

type GenEvent = { planId: string; userId: string };

/**
 * Turns onboarding answers into a training split. The AI may only reference
 * exercises from the user's allowed library; we validate every returned id
 * against that set (dropping anything invented) before persisting, then flip the
 * plan `generating → active`. Any error flips it to `failed` for a retry in UI.
 */
export const generateWorkoutJob = inngest.createFunction(
  {
    id: "generate-workout-plan",
    name: "Generate workout plan (AI)",
    triggers: [{ event: WORKOUT_GENERATE_EVENT }],
  },
  async ({ event, step }) => {
    const { planId, userId } = event.data as GenEvent;

    const built = await step
      .run("generate", async () => {
        const [plan] = await db
          .select()
          .from(workoutPlan)
          .where(eq(workoutPlan.id, planId));
        const [profile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId));
        if (!plan || !profile) throw new Error("Plan or profile missing");

        const owned = resolveOwnedEquipment(
          profile.equipmentItems,
          profile.equipment,
        );
        const allowed = await getAllowedExercises(owned);
        const byId = new Map(allowed.map((e) => [e.id, e]));

        const focus = focusMuscleGroups(normalizeFocus(profile.focusAreas));

        const gen = await generateWorkout(
          {
            goal: profile.goal,
            experience: profile.experience,
            equipment: equipmentSummary(owned),
            daysPerWeek: plan.daysPerWeek,
            injuries: profile.injuries,
            focus,
            allowed: allowed.map((e) => ({
              id: e.id,
              name: e.name,
              muscleGroup: e.muscleGroup,
            })),
          },
          userId,
        );

        // Validate ids against the curated library; drop anything invented.
        const days = gen.days.map((d, idx) => {
          const exercises: WorkoutDayExercise[] = d.exercises
            .map((ex): WorkoutDayExercise | null => {
              const lib = byId.get(ex.exerciseId);
              if (!lib) return null;
              return {
                exerciseId: lib.id,
                name: lib.name,
                sets: clampInt(ex.sets, 2, 5, lib.defaultSets),
                reps: ex.reps || lib.defaultReps,
                restSec: clampInt(ex.restSec, 45, 240, 90),
                notes: ex.notes || undefined,
              };
            })
            .filter((e): e is WorkoutDayExercise => e !== null);

          return {
            dayIndex: idx,
            name: d.name || `Day ${idx + 1}`,
            focus: d.focus || null,
            exercises,
          };
        });

        return { split: gen.split, days: days.filter((d) => d.exercises.length) };
      })
      .catch((err) => {
        console.error("[generate-workout] failed", err);
        return null;
      });

    if (!built || built.days.length === 0) {
      await step.run("mark-failed", async () => {
        await db
          .update(workoutPlan)
          .set({ status: "failed" })
          .where(eq(workoutPlan.id, planId));
      });
      return { planId, status: "failed" as const };
    }

    await step.run("persist", async () => {
      await db.delete(workoutDay).where(eq(workoutDay.planId, planId));
      await db.insert(workoutDay).values(
        built.days.map((d) => ({
          planId,
          dayIndex: d.dayIndex,
          name: d.name,
          focus: d.focus,
          exercises: d.exercises,
        })),
      );
      await db
        .update(workoutPlan)
        .set({ status: "active", split: built.split })
        .where(eq(workoutPlan.id, planId));
    });

    return { planId, status: "active" as const, days: built.days.length };
  },
);

function clampInt(v: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

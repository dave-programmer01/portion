import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import { useProfile } from "../../lib/profile-context";
import { goBack } from "../../lib/nav";
import { useThemeColors } from "../../lib/theme";
import { kgToLb, lbToKg } from "../../lib/nutrition";
import { resolveOwnedEquipment } from "../../lib/equipment";
import type {
  Exercise,
  SetLog,
  WorkoutDay,
  WorkoutDayExercise,
  WorkoutPlan,
  WorkoutSession,
} from "@/db/schema";

/** One step of the guided flow: a single set of one exercise. */
type Step = { set: SetLog; exercise: WorkoutDayExercise };

/** Exercises that use external load → show a weight field (kg/lb). */
const WEIGHTED = new Set(["dumbbells", "barbell", "machine", "cable"]);

function buildSteps(day: WorkoutDay, sets: SetLog[]): Step[] {
  const byKey = new Map(sets.map((s) => [`${s.exerciseId}:${s.setIndex}`, s]));
  const steps: Step[] = [];
  for (const ex of day.exercises) {
    for (let i = 0; i < ex.sets; i++) {
      const set = byKey.get(`${ex.exerciseId}:${i}`);
      if (set) steps.push({ set, exercise: ex });
    }
  }
  return steps;
}

function firstIntFrom(text: string | null): number | null {
  const m = String(text ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Guided workout player. Walks the user through one set at a time: shows the
 * exercise, its target reps (and a weight field for weighted moves), then a Done
 * button that logs the set and starts a rest countdown before advancing to the
 * next set / exercise — looping until every set is complete.
 */
export default function Session() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const { request } = useApi();
  const { profile } = useProfile();
  const colors = useThemeColors();
  const imperial = profile?.unitPreference === "imperial";
  const weightUnit = imperial ? "lb" : "kg";

  // Only offer a weight field when the user actually owns equipment. A
  // bodyweight-only user never sees kg.
  const owned = resolveOwnedEquipment(
    profile?.equipmentItems,
    profile?.equipment ?? "bodyweight",
  );
  const hasEquipment = owned.length > 0;

  const [day, setDay] = useState<WorkoutDay | null>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"work" | "rest">("work");
  const [rest, setRest] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [weightText, setWeightText] = useState("");

  // Load the day + library + start/resume the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [planRes, sessionRes] = await Promise.all([
          request<{ plan: WorkoutPlan | null; days: WorkoutDay[]; library: Exercise[] }>(
            "/api/workouts/plan",
          ),
          request<{ session: WorkoutSession; sets: SetLog[] }>(
            "/api/workouts/sessions",
            {
              method: "POST",
              body: JSON.stringify({ dayId, loggedDate: todayLocal() }),
            },
          ),
        ]);
        if (cancelled) return;
        const d = planRes.days.find((x) => x.id === dayId) ?? null;
        setDay(d);
        setLibrary(planRes.library ?? []);
        setSession(sessionRes.session);
        setSets(sessionRes.sets);
        // Resume at the first set that isn't done yet.
        if (d) {
          const steps = buildSteps(d, sessionRes.sets);
          const fi = steps.findIndex((s) => !s.set.completed);
          setIndex(fi < 0 ? 0 : fi);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, request]);

  // Elapsed session timer (counts up while working out).
  useEffect(() => {
    if (loading || finishing) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [loading, finishing]);

  const libById = useMemo(
    () => new Map(library.map((e) => [e.id, e])),
    [library],
  );
  const steps = useMemo(() => (day ? buildSteps(day, sets) : []), [day, sets]);
  const step = steps[index];
  const lib = step ? libById.get(step.exercise.exerciseId) : undefined;

  const target = step?.set.targetReps ?? step?.exercise.reps ?? "";
  const isHold = /s$/i.test(target);
  const showWeight = hasEquipment && !!lib && WEIGHTED.has(lib.equipment);

  // Seed the weight field from the current set (or carry nothing over).
  useEffect(() => {
    const kg = step?.set.weightKg ?? null;
    setWeightText(
      kg === null ? "" : String(imperial ? Math.round(kgToLb(kg)) : kg),
    );
  }, [index, step?.set.id, imperial, step?.set.weightKg]);

  const patchSet = useCallback(
    async (id: string, patch: Partial<SetLog>) => {
      if (!session) return;
      await request(`/api/workouts/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sets: [{ id, ...patch }] }),
      }).catch(() => {});
    },
    [request, session],
  );

  const finishAll = useCallback(async () => {
    if (!session) return;
    setFinishing(true);
    await request(`/api/workouts/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: true }),
    }).catch(() => {});
    goBack("/workout");
  }, [request, session]);

  // Rest countdown → advance to the next set when it hits zero.
  useEffect(() => {
    if (phase !== "rest") return;
    if (rest <= 0) {
      setPhase("work");
      setIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }
    const t = setTimeout(() => setRest((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, rest, steps.length]);

  function toKg(text: string): number | null {
    const n = Number(text);
    if (!text || !Number.isFinite(n)) return null;
    return imperial ? Math.round(lbToKg(n) * 10) / 10 : n;
  }

  function done() {
    if (!step) return;
    const kg = showWeight ? toKg(weightText) : null;
    const reps = firstIntFrom(target);
    // Optimistic local update.
    setSets((prev) =>
      prev.map((s) =>
        s.id === step.set.id
          ? { ...s, completed: true, reps, weightKg: kg ?? s.weightKg }
          : s,
      ),
    );
    void patchSet(step.set.id, {
      completed: true,
      reps,
      ...(kg !== null ? { weightKg: kg } : {}),
    });

    if (index >= steps.length - 1) {
      void finishAll();
      return;
    }
    setRest(step.exercise.restSec || 60);
    setPhase("rest");
  }

  const goPrev = () => {
    setPhase("work");
    setIndex((i) => Math.max(i - 1, 0));
  };
  const goNext = () => {
    if (index >= steps.length - 1) {
      void finishAll();
      return;
    }
    setPhase("work");
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  if (!step) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-semibold text-[16px] text-ink">
          This workout has no sets yet.
        </Text>
        <Pressable
          onPress={() => goBack("/workout")}
          className="mt-5 rounded-[14px] bg-green px-6 py-3"
        >
          <Text className="font-semibold text-[15px] text-white">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const nextStep = steps[index + 1];
  const doneCount = steps.filter((s) => s.set.completed).length;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      {/* Header: exit · position + timer */}
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Pressable
          onPress={() => goBack("/workout")}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
        <View className="items-center">
          <Text className="font-bold text-[15px] text-ink">
            Set {index + 1} / {steps.length}
          </Text>
          <Text className="mt-[1px] font-regular text-[12px] text-muted">
            {fmtTime(elapsed)}
          </Text>
        </View>
        <View className="h-10 w-10" />
      </View>

      {/* Progress segments — one per set */}
      <View className="mt-3 flex-row gap-[3px] px-5">
        {steps.map((s, i) => (
          <View
            key={s.set.id}
            className={`h-[4px] flex-1 rounded-full ${
              s.set.completed || i < index
                ? "bg-green"
                : i === index
                  ? "bg-green/50"
                  : "bg-line"
            }`}
          />
        ))}
      </View>

      {/* Exercise info (no media — name, description & tips) */}
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 300 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-2 self-start rounded-full bg-green-surface px-3 py-1">
          <Text className="font-semibold text-[12px] text-green-dark">
            {lib?.muscleGroup ?? "Exercise"}
          </Text>
        </View>
        <Text className="mt-3 font-bold text-[28px] leading-[34px] text-ink">
          {step.exercise.name}
        </Text>
        <Text className="mt-1 font-regular text-[13px] text-muted">
          {step.exercise.sets} sets · target {target}
          {doneCount > 0 ? ` · ${doneCount} done` : ""}
        </Text>

        {lib?.instructions ? (
          <View className="mt-5 rounded-2xl border border-line bg-card p-4">
            <Text className="mb-1 font-semibold text-[13px] text-ink">
              How to do it
            </Text>
            <Text className="font-regular text-[14px] leading-[21px] text-muted">
              {lib.instructions}
            </Text>
          </View>
        ) : null}

        {step.exercise.notes ? (
          <View className="mt-3 flex-row rounded-2xl border border-green-light bg-green-surface p-4">
            <SymbolView
              name="lightbulb.fill"
              size={16}
              tintColor="#16A34A"
              style={{ marginRight: 10, marginTop: 1 }}
            />
            <Text className="flex-1 font-regular text-[13px] leading-[19px] text-green-dark">
              {step.exercise.notes}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Action panel (dark) — reps, optional weight, controls */}
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-[28px] px-5 pb-8 pt-6"
        style={{ backgroundColor: "#0B0F0E" }}
      >
        <Text className="text-center font-bold text-[17px] text-white">
          {step.exercise.name}
        </Text>
        <Text className="mt-1 text-center font-bold text-[48px] leading-[52px] text-white">
          {isHold ? target : `×${target}`}
        </Text>

        {showWeight ? (
          <View className="mt-4 flex-row items-center justify-center">
            <Text className="mr-3 font-medium text-[14px] text-white/60">
              Weight
            </Text>
            <TextInput
              value={weightText}
              onChangeText={(t) => setWeightText(t.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor="#FFFFFF4D"
              className="h-11 w-24 rounded-xl bg-white/10 text-center font-semibold text-[16px] text-white"
            />
            <Text className="ml-2 font-medium text-[14px] text-white/60">
              {weightUnit}
            </Text>
          </View>
        ) : null}

        <View className="mt-6 flex-row items-center justify-center">
          <Pressable
            onPress={goPrev}
            disabled={index === 0}
            className="h-14 w-14 items-center justify-center rounded-full bg-white/10 active:opacity-70"
            style={{ opacity: index === 0 ? 0.4 : 1 }}
          >
            <SymbolView name="backward.end.fill" size={18} tintColor="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={done}
            disabled={finishing}
            className="mx-5 h-16 flex-1 flex-row items-center justify-center rounded-full bg-green active:opacity-90"
          >
            {finishing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <SymbolView name="checkmark" size={26} tintColor="#FFFFFF" weight="bold" />
            )}
          </Pressable>

          <Pressable
            onPress={goNext}
            className="h-14 w-14 items-center justify-center rounded-full bg-white/10 active:opacity-70"
          >
            <SymbolView name="forward.end.fill" size={18} tintColor="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Rest overlay */}
      {phase === "rest" ? (
        <View className="absolute inset-0 bg-green px-6" style={{ backgroundColor: "#16A34A" }}>
          <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
            <View className="flex-1 items-center justify-center">
              <Text className="font-bold text-[20px] tracking-widest text-white">
                REST
              </Text>
              <Text className="mt-2 font-bold text-[76px] leading-[84px] text-white">
                {fmtTime(rest)}
              </Text>
              <View className="mt-8 flex-row gap-4">
                <Pressable
                  onPress={() => setRest((r) => r + 20)}
                  className="rounded-full bg-white/20 px-8 py-4 active:opacity-80"
                >
                  <Text className="font-bold text-[16px] text-white">+20s</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPhase("work");
                    setIndex((i) => Math.min(i + 1, steps.length - 1));
                  }}
                  className="rounded-full bg-white px-10 py-4 active:opacity-90"
                >
                  <Text className="font-bold text-[16px] text-green-dark">SKIP</Text>
                </Pressable>
              </View>
            </View>

            {nextStep ? (
              <View className="pb-6">
                <Text className="font-bold text-[14px] tracking-wide text-white/70">
                  NEXT {index + 2} / {steps.length}
                </Text>
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="flex-1 pr-3 font-bold text-[22px] text-white">
                    {nextStep.exercise.name}
                  </Text>
                  <Text className="font-bold text-[22px] text-white">
                    {/s$/i.test(nextStep.set.targetReps ?? nextStep.exercise.reps)
                      ? (nextStep.set.targetReps ?? nextStep.exercise.reps)
                      : `×${nextStep.set.targetReps ?? nextStep.exercise.reps}`}
                  </Text>
                </View>
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

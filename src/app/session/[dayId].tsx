import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import { useProfile } from "../../lib/profile-context";
import { useThemeColors } from "../../lib/theme";
import { kgToLb, lbToKg } from "../../lib/nutrition";
import type {
  SetLog,
  WorkoutDay,
  WorkoutDayExercise,
  WorkoutPlan,
  WorkoutSession,
} from "@/db/schema";

/**
 * Live workout session. Starts (or resumes) a session for the day, lets the
 * user log reps/weight and tick sets, and runs a rest timer after each set is
 * completed. Weight is stored in kg; imperial users see/enter lb.
 */
export default function Session() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const { request } = useApi();
  const { profile } = useProfile();
  const colors = useThemeColors();
  const imperial = profile?.unitPreference === "imperial";
  const weightUnit = imperial ? "lb" : "kg";

  const [day, setDay] = useState<WorkoutDay | null>(null);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  // Rest timer (seconds remaining, null = idle).
  const [rest, setRest] = useState<number | null>(null);
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      setRest(null);
      return;
    }
    const id = setTimeout(() => setRest((r) => (r ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [rest]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [planRes, sessionRes] = await Promise.all([
          request<{ plan: WorkoutPlan | null; days: WorkoutDay[] }>(
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
        setDay(planRes.days.find((d) => d.id === dayId) ?? null);
        setSession(sessionRes.session);
        setSets(sessionRes.sets);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, request]);

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

  function toggleComplete(set: SetLog, exercise: WorkoutDayExercise) {
    const completed = !set.completed;
    setSets((prev) =>
      prev.map((s) => (s.id === set.id ? { ...s, completed } : s)),
    );
    void patchSet(set.id, { completed });
    if (completed) setRest(exercise.restSec); // start resting
  }

  function setLocal(id: string, patch: Partial<SetLog>) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function finish() {
    if (!session) return;
    setFinishing(true);
    await request(`/api/workouts/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: true }),
    }).catch(() => {});
    router.back();
  }

  const totalSets = sets.length;
  const doneSets = useMemo(
    () => sets.filter((s) => s.completed).length,
    [sets],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center px-5 pt-1">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="chevron.left" size={16} tintColor={colors.ink} />
        </Pressable>
        <View className="ml-3 flex-1">
          <Text className="font-bold text-[18px] text-ink">
            {day?.name ?? "Workout"}
          </Text>
          <Text className="font-regular text-[12px] text-muted">
            {doneSets}/{totalSets} sets done
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {day?.exercises.map((exercise, exIdx) => {
          const exSets = sets
            .filter((s) => s.exerciseId === exercise.exerciseId)
            .sort((a, b) => a.setIndex - b.setIndex);
          const doneCount = exSets.filter((s) => s.completed).length;
          return (
            <View
              key={exercise.exerciseId}
              className="mb-4 overflow-hidden rounded-2xl border border-line bg-card"
            >
              {/* Exercise header */}
              <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
                <View className="flex-1">
                  <Text className="font-bold text-[15px] text-ink">
                    {exercise.name}
                  </Text>
                  <Text className="mt-[2px] font-regular text-[12px] text-muted">
                    {exercise.sets} sets · {exercise.reps}
                    {exercise.notes ? ` · ${exercise.notes}` : ""}
                  </Text>
                </View>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-green-surface">
                  <Text className="font-bold text-[13px] text-green-dark">
                    {doneCount}/{exercise.sets}
                  </Text>
                </View>
              </View>

              {/* Set rows */}
              <View className="border-t border-line">
                {/* Column labels */}
                <View className="flex-row items-center px-4 py-[7px]">
                  <Text className="w-8 font-medium text-[11px] text-muted">Set</Text>
                  <Text className="flex-1 text-center font-medium text-[11px] text-muted">
                    {weightUnit}
                  </Text>
                  <Text className="flex-1 text-center font-medium text-[11px] text-muted">
                    Reps
                  </Text>
                  <View className="w-9" />
                </View>
                {exSets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    imperial={imperial}
                    onChangeWeight={(kg) => setLocal(set.id, { weightKg: kg })}
                    onCommitWeight={(kg) => patchSet(set.id, { weightKg: kg })}
                    onChangeReps={(reps) => setLocal(set.id, { reps })}
                    onCommitReps={(reps) => patchSet(set.id, { reps })}
                    onToggle={() => toggleComplete(set, exercise)}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Rest timer — full overlay card */}
      {rest !== null ? (
        <View
          className="absolute bottom-24 left-5 right-5 overflow-hidden rounded-3xl shadow-lg"
          style={{ backgroundColor: "#0F172A" }}
        >
          <View className="items-center py-6">
            <Text className="font-regular text-[13px] text-white/50">Rest Timer</Text>
            <Text className="mt-1 font-bold text-[52px] leading-[60px] text-white">
              {String(Math.floor(rest / 60)).padStart(2, "0")}:
              {String(rest % 60).padStart(2, "0")}
            </Text>
          </View>
          <View className="flex-row border-t border-white/10">
            <Pressable
              onPress={() => setRest(null)}
              className="flex-1 items-center py-4"
            >
              <Text className="font-semibold text-[14px] text-white/60">Skip Rest</Text>
            </Pressable>
            <View className="w-[1px] bg-white/10" />
            <Pressable
              onPress={() => setRest((r) => (r ?? 0) + 15)}
              className="flex-1 items-center py-4"
            >
              <Text className="font-semibold text-[14px] text-green">+15s</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Finish */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-bg px-5 pb-8 pt-3">
        <Pressable
          onPress={finish}
          disabled={finishing}
          className="h-13 flex-row items-center justify-center rounded-[14px] bg-green py-4 active:opacity-90"
        >
          {finishing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="font-semibold text-[16px] text-white">
              Finish workout
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SetRow({
  set,
  imperial,
  onChangeWeight,
  onCommitWeight,
  onChangeReps,
  onCommitReps,
  onToggle,
}: {
  set: SetLog;
  imperial: boolean;
  onChangeWeight: (kg: number | null) => void;
  onCommitWeight: (kg: number | null) => void;
  onChangeReps: (reps: number | null) => void;
  onCommitReps: (reps: number | null) => void;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  // Local text buffers so typing feels native; convert to kg on the way out.
  const displayWeight =
    set.weightKg === null
      ? ""
      : String(imperial ? Math.round(kgToLb(set.weightKg)) : set.weightKg);
  const [weightText, setWeightText] = useState(displayWeight);
  const [repsText, setRepsText] = useState(
    set.reps === null ? "" : String(set.reps),
  );
  const lastWeight = useRef(displayWeight);
  if (lastWeight.current !== displayWeight) {
    lastWeight.current = displayWeight;
    setWeightText(displayWeight);
  }

  const toKg = (text: string): number | null => {
    const n = Number(text);
    if (!text || !Number.isFinite(n)) return null;
    return imperial ? Math.round(lbToKg(n) * 10) / 10 : n;
  };

  return (
    <View
      className={`flex-row items-center px-4 py-[9px] ${
        set.completed ? "bg-green-dark" : ""
      }`}
    >
      <Text
        className={`w-8 font-semibold text-[14px] ${
          set.completed ? "text-white/70" : "text-muted"
        }`}
      >
        {set.setIndex + 1}
      </Text>
      <View className="mx-1 flex-1">
        <TextInput
          value={weightText}
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9.]/g, "");
            setWeightText(clean);
            onChangeWeight(toKg(clean));
          }}
          onEndEditing={() => onCommitWeight(toKg(weightText))}
          keyboardType="numeric"
          placeholder="—"
          placeholderTextColor={set.completed ? "rgba(255,255,255,0.4)" : colors.faint}
          className={`h-10 rounded-xl text-center font-semibold text-[14px] ${
            set.completed
              ? "bg-white/10 text-white"
              : "bg-surface text-ink"
          }`}
        />
      </View>
      <View className="mx-1 flex-1">
        <TextInput
          value={repsText}
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9]/g, "");
            setRepsText(clean);
            onChangeReps(clean ? Number(clean) : null);
          }}
          onEndEditing={() => onCommitReps(repsText ? Number(repsText) : null)}
          keyboardType="numeric"
          placeholder={set.targetReps ?? "—"}
          placeholderTextColor={set.completed ? "rgba(255,255,255,0.4)" : colors.faint}
          className={`h-10 rounded-xl text-center font-semibold text-[14px] ${
            set.completed
              ? "bg-white/10 text-white"
              : "bg-surface text-ink"
          }`}
        />
      </View>
      <Pressable
        onPress={onToggle}
        className="ml-2 h-9 w-9 items-center justify-center"
      >
        <SymbolView
          name={set.completed ? "checkmark.circle.fill" : "circle"}
          size={24}
          tintColor={set.completed ? "#22C55E" : colors.faint}
        />
      </Pressable>
    </View>
  );
}

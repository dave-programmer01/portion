import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, useFetch } from "../../lib/api";
import { useThemeColors } from "../../lib/theme";
import { PrimaryButton, CenterState, ErrorState } from "../../components/ui";
import type { WorkoutDay, WorkoutPlan } from "@/db/schema";

type PlanResponse = {
  plan: WorkoutPlan | null;
  days: WorkoutDay[];
  completedDayIds?: string[];
};

export default function Workout() {
  const { request } = useApi();
  const colors = useThemeColors();
  const { data, loading, error, refetch } = useFetch(
    () => request<PlanResponse>("/api/workouts/plan"),
    [],
  );

  const plan = data?.plan ?? null;
  const generating = plan?.status === "generating";

  // Poll while the AI is building the plan.
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => void refetch(), 3000);
    return () => clearInterval(id);
  }, [generating, refetch]);

  // Returning from the focus picker (which kicks off generation) should refresh
  // so the "building your plan…" state and polling pick up immediately.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Choose focus, then (re)generate. The picker POSTs and comes back here.
  const chooseFocus = () => router.push("/workout-focus");

  // Retry a failed plan with the user's existing focus (no picker needed).
  async function retry() {
    try {
      await request("/api/workouts/plan", { method: "POST" });
      await refetch();
    } catch (err) {
      if ((err as { status?: number }).status === 402) {
        router.push("/paywall");
        return;
      }
      Alert.alert("Couldn't start", "Please try again.");
    }
  }

  // Derived plan progress (this week).
  const days = data?.days ?? [];
  const completedSet = new Set(data?.completedDayIds ?? []);
  const completedCount = days.filter((d) => completedSet.has(d.id)).length;
  const remaining = Math.max(0, days.length - completedCount);
  const pct = days.length
    ? Math.round((completedCount / days.length) * 100)
    : 0;
  // First not-completed day is "up next".
  const currentDayId = days.find((d) => !completedSet.has(d.id))?.id ?? null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[26px] text-ink">Workout</Text>
        {plan?.status === "active" ? (
          <Pressable
            onPress={chooseFocus}
            className="h-9 flex-row items-center rounded-full bg-surface px-3 active:opacity-80"
          >
            <SymbolView
              name="arrow.triangle.2.circlepath"
              size={13}
              tintColor={colors.muted}
            />
            <Text className="ml-1 font-semibold text-[13px] text-muted">
              Regenerate
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor="#22C55E"
          />
        }
      >
        {/* Network / load error */}
        {error && !data ? <ErrorState onRetry={refetch} /> : null}

        {/* No plan yet */}
        {!plan && !loading && !error ? (
          <CenterState
            icon="figure.strengthtraining.traditional"
            title="No plan yet"
            subtitle="We'll build a beginner-friendly split from your onboarding answers — matched to your equipment and days per week."
          >
            <PrimaryButton
              label="Generate my plan"
              icon="sparkles"
              onPress={chooseFocus}
            />
          </CenterState>
        ) : null}

        {/* Generating */}
        {generating ? (
          <View className="flex-1 items-center justify-center px-10">
            <ActivityIndicator color="#22C55E" size="large" />
            <Text className="mt-4 text-center font-semibold text-[16px] text-ink">
              Building your plan…
            </Text>
            <Text className="mt-1 text-center font-regular text-[14px] text-muted">
              This usually takes a few seconds.
            </Text>
          </View>
        ) : null}

        {/* Failed */}
        {plan?.status === "failed" ? (
          <CenterState
            icon="exclamationmark.triangle"
            title="Generation failed"
            subtitle="Something went wrong building your plan. Give it another try."
          >
            <PrimaryButton
              label="Try again"
              icon="arrow.clockwise"
              onPress={retry}
            />
          </CenterState>
        ) : null}

        {/* Active plan — Plan Overview */}
        {plan?.status === "active" ? (
          <>
            {/* Progress card */}
            <View className="mb-4 rounded-2xl border border-line bg-card p-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="font-bold text-[19px] text-ink">
                    {plan.name}
                  </Text>
                  <Text className="mt-[2px] font-regular text-[13px] text-muted">
                    This week · {plan.daysPerWeek} training days
                  </Text>
                </View>
                <Text className="font-bold text-[18px] text-green-dark">
                  {pct}%
                </Text>
              </View>
              <View className="mt-4 h-[8px] overflow-hidden rounded-full bg-line">
                <View
                  className="h-full rounded-full bg-green"
                  style={{ width: `${pct}%` }}
                />
              </View>
            </View>

            {/* Stat trio */}
            <View className="mb-6 flex-row gap-3">
              <StatCard value={completedCount} label="Completed" />
              <StatCard value={remaining} label="Remaining" />
              <StatCard value={days.length} label="Workouts" />
            </View>

            <Text className="mb-3 font-bold text-[16px] text-ink">Workouts</Text>

            {days.map((day) => {
              const done = completedSet.has(day.id);
              const current = !done && day.id === currentDayId;
              return (
                <Pressable
                  key={day.id}
                  onPress={() =>
                    router.push({
                      pathname: "/workout-day/[dayId]",
                      params: { dayId: day.id },
                    })
                  }
                  className={`mb-[10px] flex-row items-center rounded-2xl border px-4 py-[14px] active:opacity-90 ${
                    current ? "border-green bg-green-surface" : "border-line bg-card"
                  }`}
                >
                  <View className="flex-1">
                    <Text className="font-medium text-[11px] uppercase tracking-wide text-muted">
                      Day {day.dayIndex + 1}
                    </Text>
                    <Text className="mt-[2px] font-semibold text-[16px] text-ink">
                      {day.name}
                    </Text>
                    <Text className="mt-[2px] font-regular text-[12px] text-muted">
                      {day.exercises.length} exercises
                    </Text>
                  </View>
                  <DayStatus done={done} current={current} colors={colors} />
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-line bg-surface py-4">
      <Text className="font-bold text-[22px] text-ink">{value}</Text>
      <Text className="mt-[2px] font-regular text-[12px] text-muted">{label}</Text>
    </View>
  );
}

function DayStatus({
  done,
  current,
  colors,
}: {
  done: boolean;
  current: boolean;
  colors: { faint: string };
}) {
  if (done) {
    return (
      <SymbolView name="checkmark.circle.fill" size={26} tintColor="#22C55E" />
    );
  }
  if (current) {
    return <SymbolView name="play.circle.fill" size={28} tintColor="#22C55E" />;
  }
  return <SymbolView name="circle" size={24} tintColor={colors.faint} />;
}

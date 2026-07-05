import { useEffect } from "react";
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
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, useFetch } from "../../lib/api";
import { useThemeColors } from "../../lib/theme";
import { PrimaryButton, CenterState } from "../../components/ui";
import type { WorkoutDay, WorkoutPlan } from "@/db/schema";

type PlanResponse = { plan: WorkoutPlan | null; days: WorkoutDay[] };

export default function Workout() {
  const { request } = useApi();
  const colors = useThemeColors();
  const { data, loading, refetch } = useFetch(
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

  async function generate() {
    try {
      await request("/api/workouts/plan", { method: "POST" });
      await refetch();
    } catch {
      Alert.alert("Couldn't start", "Please try again.");
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      "Regenerate plan?",
      "This replaces your current plan with a fresh one.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Regenerate", onPress: generate },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="px-5 pt-1">
        <Text className="font-bold text-[26px] text-ink">Workout</Text>
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
        {/* No plan yet */}
        {!plan && !loading ? (
          <CenterState
            icon="figure.strengthtraining.traditional"
            title="No plan yet"
            subtitle="We'll build a beginner-friendly split from your onboarding answers — matched to your equipment and days per week."
          >
            <PrimaryButton
              label="Generate my plan"
              icon="sparkles"
              onPress={generate}
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
              onPress={generate}
            />
          </CenterState>
        ) : null}

        {/* Active plan */}
        {plan?.status === "active" ? (
          <>
            <View
              className="mb-5 rounded-2xl bg-green-dark px-5 py-4"
              style={{
                shadowColor: "#16A34A",
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text className="font-regular text-[12px] text-green-light opacity-80">
                Your plan
              </Text>
              <Text className="mt-[2px] font-bold text-[20px] text-white">
                {plan.name}
              </Text>
              <Text className="mt-[3px] font-regular text-[13px] text-green-light opacity-80">
                {plan.daysPerWeek} training days / week
              </Text>
            </View>

            {data?.days.map((day) => (
              <Pressable
                key={day.id}
                onPress={() =>
                  router.push({
                    pathname: "/session/[dayId]",
                    params: { dayId: day.id },
                  })
                }
                className="mb-3 flex-row items-center rounded-2xl border border-line bg-card px-4 py-4 active:opacity-90"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-green-surface">
                  <Text className="font-bold text-[17px] text-green-dark">
                    {day.dayIndex + 1}
                  </Text>
                </View>
                <View className="ml-4 flex-1">
                  <Text className="font-semibold text-[16px] text-ink">
                    {day.name}
                  </Text>
                  <Text className="mt-[2px] font-regular text-[13px] text-muted">
                    {day.focus ? `${day.focus} · ` : ""}
                    {day.exercises.length} exercises
                  </Text>
                </View>
                <SymbolView name="chevron.right" size={15} tintColor={colors.faint} />
              </Pressable>
            ))}

            <Pressable onPress={confirmRegenerate} className="mt-3 py-3">
              <Text className="text-center font-semibold text-[14px] text-muted">
                Regenerate plan
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

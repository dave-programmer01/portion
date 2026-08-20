import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/icon";

import { useApi, useFetch } from "../../lib/api";
import { useProfile } from "../../lib/profile-context";
import { goBack } from "../../lib/nav";
import { useThemeColors } from "../../lib/theme";
import { WorkoutDaySkeleton } from "../../components/skeletons";
import { PrimaryButton, ErrorState } from "../../components/ui";
import type { WorkoutDay, WorkoutPlan, Experience } from "@/db/schema";

type PlanResponse = {
  plan: WorkoutPlan | null;
  days: WorkoutDay[];
  completedDayIds?: string[];
};

const DIFFICULTY: Record<Experience, string> = {
  beginner: "Beginner",
  intermediate: "Medium",
  advanced: "Advanced",
};

/**
 * Workout Details — the exercise list for one day before you start it.
 * Duration / difficulty / calorie estimates are heuristics (we don't track
 * per-exercise timing), framed loosely to match the "~45 min" feel.
 */
export default function WorkoutDayDetails() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const { request } = useApi();
  const { profile } = useProfile();
  const colors = useThemeColors();

  const { data, loading, error, refetch } = useFetch(
    () => request<PlanResponse>("/api/workouts/plan"),
    [],
  );

  const day = data?.days.find((d) => d.id === dayId) ?? null;
  const done = !!data?.completedDayIds?.includes(dayId);

  if (loading) return <WorkoutDaySkeleton />;

  const totalSets = day?.exercises.reduce((s, e) => s + e.sets, 0) ?? 0;
  const durationMin = Math.max(15, Math.round((totalSets * 2.5) / 5) * 5);
  const kcalLo = Math.round((durationMin * 5) / 10) * 10;
  const kcalHi = Math.round((durationMin * 8) / 10) * 10;
  const difficulty = profile ? DIFFICULTY[profile.experience] : "Medium";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center px-5 pt-1">
        <Pressable
          onPress={() => goBack("/workout")}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Icon name="chevron.left" size={16} tintColor={colors.ink} />
        </Pressable>
        <Text className="flex-1 text-center font-bold text-[17px] text-ink">
          Workout Details
        </Text>
        <View className="w-9" />
      </View>

      {error && !day ? (
        <ErrorState onRetry={refetch} />
      ) : !day ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center font-regular text-[15px] text-muted">
            This workout isn't available.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text className="font-medium text-[13px] text-muted">
              Day {day.dayIndex + 1}
            </Text>
            <Text className="mt-[2px] font-bold text-[26px] leading-[32px] text-ink">
              {day.name}
            </Text>
            {done ? (
              <View className="mt-2 flex-row items-center">
                <Icon
                  name="checkmark.circle.fill"
                  size={15}
                  tintColor="#22C55E"
                />
                <Text className="ml-1 font-semibold text-[13px] text-green-dark">
                  Completed this week
                </Text>
              </View>
            ) : null}

            {/* Stat row */}
            <View className="mt-4 flex-row items-center">
              <Stat icon="clock" text={`${durationMin} min`} colors={colors} />
              <Dot />
              <Stat
                icon="chart.bar.fill"
                text={difficulty}
                colors={colors}
              />
              <Dot />
              <Stat
                icon="flame.fill"
                text={`${kcalLo}-${kcalHi} kcal`}
                colors={colors}
              />
            </View>

            {/* Exercises */}
            <Text className="mb-3 mt-7 font-bold text-[17px] text-ink">
              Exercises
            </Text>
            {day.exercises.map((ex, i) => (
              <View
                key={`${ex.exerciseId}-${i}`}
                className="mb-[10px] flex-row items-center rounded-2xl border border-line bg-card p-3"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-surface">
                  <Text className="font-bold text-[14px] text-muted">
                    {i + 1}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-[15px] text-ink">
                    {ex.name}
                  </Text>
                  <Text className="mt-[2px] font-regular text-[13px] text-muted">
                    {ex.sets} sets · {formatReps(ex.reps)}
                  </Text>
                  {ex.notes ? (
                    <Text
                      numberOfLines={1}
                      className="mt-[1px] font-regular text-[12px] text-faint"
                    >
                      {ex.notes}
                    </Text>
                  ) : null}
                </View>
                {/* Thumbnail placeholder (no exercise imagery yet). */}
                <View className="h-14 w-14 items-center justify-center rounded-xl bg-green-surface">
                  <Icon
                    name="figure.strengthtraining.traditional"
                    size={26}
                    tintColor="#16A34A"
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Start */}
          <View className="px-5 pb-2 pt-2">
            <PrimaryButton
              label={done ? "Do it again" : "Start Workout"}
              icon="play.fill"
              onPress={() =>
                router.push({
                  pathname: "/session/[dayId]",
                  params: { dayId: day.id },
                })
              }
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Stat({
  icon,
  text,
  colors,
}: {
  icon: string;
  text: string;
  colors: { muted: string };
}) {
  return (
    <View className="flex-row items-center">
      <Icon name={icon} size={14} tintColor="#16A34A" />
      <Text className="ml-[5px] font-medium text-[13px] text-muted">{text}</Text>
    </View>
  );
}

function Dot() {
  return <View className="mx-3 h-[3px] w-[3px] rounded-full bg-line" />;
}

/** "8-12" → "8-12 reps"; "45 sec"/"30s" left as-is (timed holds). */
function formatReps(reps: string): string {
  return /[a-z]/i.test(reps) ? reps : `${reps} reps`;
}

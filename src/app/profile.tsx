import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useUser } from "@clerk/expo";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useApi, useFetch } from "../lib/api";
import { kgToLb } from "../lib/nutrition";
import { useThemeColors } from "../lib/theme";
import { useProfile } from "../lib/profile-context";
import { equipmentLabels } from "../lib/equipment";
import { goBack } from "../lib/nav";
import { Avatar } from "./settings";

type Summary = {
  totalWorkouts: number;
  workoutsThisWeek: number;
  streakDays: number;
  planDaysPerWeek: number;
  goal: "lose" | "maintain" | "gain" | null;
  caloriesTarget: number | null;
  caloriesEatenToday: number;
  currentWeightKg: number | null;
  unitPreference: "metric" | "imperial";
  recent: { id: string; name: string; completedAt: string | null; exercises: number }[];
};

export default function Profile() {
  const { user } = useUser();
  const { request } = useApi();
  const { profile } = useProfile();
  const colors = useThemeColors();
  const { data, loading, refetch } = useFetch(
    () => request<Summary>("/api/me/summary"),
    [],
  );

  const name = user?.fullName ?? user?.firstName ?? "Athlete";
  const s = data;
  const imperial = s?.unitPreference === "imperial";
  const weight =
    s?.currentWeightKg != null
      ? `${Math.round((imperial ? kgToLb(s.currentWeightKg) : s.currentWeightKg) * 10) / 10} ${imperial ? "lb" : "kg"}`
      : "—";

  const workoutGoalPct =
    s && s.planDaysPerWeek > 0
      ? Math.min(100, Math.round((s.workoutsThisWeek / s.planDaysPerWeek) * 100))
      : 0;
  const calGoalPct =
    s?.caloriesTarget
      ? Math.min(100, Math.round((s.caloriesEatenToday / s.caloriesTarget) * 100))
      : 0;

  const badge =
    (s?.streakDays ?? 0) >= 7
      ? "On a Streak"
      : (s?.totalWorkouts ?? 0) > 0
        ? "Consistent Achiever"
        : "Getting Started";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => goBack("/home")}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface"
          >
            <SymbolView name="chevron.left" size={16} tintColor={colors.ink} />
          </Pressable>
          <Text className="ml-2 font-bold text-[26px] text-ink">Profile</Text>
        </View>
        <Pressable
          onPress={() => router.push("/settings")}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="gearshape.fill" size={17} tintColor={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#22C55E" />
        }
      >
        {/* Identity */}
        <View className="flex-row items-center">
          <Avatar uri={user?.imageUrl} size={72} />
          <View className="ml-4 flex-1">
            <Text className="font-bold text-[22px] text-ink">{name}</Text>
            <View className="mt-1 flex-row">
              <View className="flex-row items-center rounded-full border border-green-light bg-green-surface px-2 py-[3px]">
                <SymbolView name="star.fill" size={11} tintColor="#16A34A" />
                <Text className="ml-1 font-semibold text-[12px] text-green-dark">
                  {badge}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Headline stats */}
        <View className="mt-5 flex-row">
          <HeadStat icon="flame.fill" tint="#F97316" value={`${s?.streakDays ?? 0}`} label="Day Streak" />
          <HeadStat icon="dumbbell.fill" tint="#22C55E" value={`${s?.totalWorkouts ?? 0}`} label="Workouts" />
          <HeadStat icon="calendar" tint="#3882F6" value={`${s?.workoutsThisWeek ?? 0}`} label="This Week" />
        </View>

        {/* This week overview */}
        <View className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-bold text-[16px] text-ink">This Week</Text>
            <Pressable onPress={() => router.push("/progress")} className="flex-row items-center">
              <Text className="font-semibold text-[13px] text-green-dark">View Progress</Text>
              <SymbolView name="chevron.right" size={12} tintColor="#16A34A" style={{ marginLeft: 2 }} />
            </Pressable>
          </View>
          <View className="flex-row flex-wrap">
            <OverviewStat icon="dumbbell" value={`${s?.workoutsThisWeek ?? 0}`} label="Workouts" />
            <OverviewStat icon="flame" value={s?.caloriesEatenToday?.toLocaleString() ?? "0"} label="Calories today" />
            <OverviewStat icon="calendar" value={`${s?.planDaysPerWeek ?? 0}/wk`} label="Plan days" />
            <OverviewStat icon="scalemass" value={weight} label="Weight" />
          </View>
        </View>

        {/* Equipment */}
        <View className="mb-3 mt-7 flex-row items-center justify-between">
          <Text className="font-bold text-[18px] text-ink">Training Setup</Text>
        </View>
        <Pressable
          onPress={() => router.push("/equipment")}
          className="flex-row items-center rounded-2xl border border-line bg-card px-4 py-4 active:opacity-90"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-green-surface">
            <SymbolView name="dumbbell.fill" size={18} tintColor="#16A34A" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-semibold text-[15px] text-ink">Equipment</Text>
            <Text className="mt-[1px] font-regular text-[12px] text-muted">
              {equipmentLabels(profile?.equipmentItems ?? [])}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={15} tintColor={colors.faint} />
        </Pressable>

        {/* Goals */}
        <View className="mb-3 mt-7 flex-row items-center justify-between">
          <Text className="font-bold text-[18px] text-ink">Goals</Text>
          <Pressable onPress={() => router.push("/goals")}>
            <Text className="font-semibold text-[13px] text-green-dark">Edit Goals</Text>
          </Pressable>
        </View>
        <GoalCard
          icon="dumbbell.fill"
          title={`Work out ${s?.planDaysPerWeek ?? 0}× a week`}
          subtitle={`${s?.workoutsThisWeek ?? 0} / ${s?.planDaysPerWeek ?? 0} workouts`}
          pct={workoutGoalPct}
        />
        <GoalCard
          icon="flame.fill"
          title="Hit your calorie target"
          subtitle={
            s?.caloriesTarget
              ? `${s.caloriesEatenToday.toLocaleString()} / ${s.caloriesTarget.toLocaleString()} kcal`
              : "Set up your targets"
          }
          pct={calGoalPct}
        />

        {/* Activity */}
        <View className="mb-3 mt-7 flex-row items-center justify-between">
          <Text className="font-bold text-[18px] text-ink">Recent Activity</Text>
          <Pressable onPress={() => router.push("/workout")}>
            <Text className="font-semibold text-[13px] text-green-dark">View All</Text>
          </Pressable>
        </View>
        {s && s.recent.length > 0 ? (
          s.recent.map((a) => (
            <View
              key={a.id}
              className="mb-[10px] flex-row items-center rounded-2xl border border-line bg-card px-4 py-3"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-green-surface">
                <SymbolView name="dumbbell.fill" size={17} tintColor="#16A34A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-semibold text-[15px] text-ink">{a.name}</Text>
                <Text className="mt-[1px] font-regular text-[12px] text-muted">
                  {relativeDate(a.completedAt)} · {a.exercises} exercises
                </Text>
              </View>
              <SymbolView name="checkmark.circle.fill" size={20} tintColor="#22C55E" />
            </View>
          ))
        ) : (
          <View className="rounded-2xl border border-line bg-card px-4 py-6">
            <Text className="text-center font-regular text-[14px] text-muted">
              No completed workouts yet. Finish one to see it here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeadStat({
  icon,
  tint,
  value,
  label,
}: {
  icon: SymbolViewProps["name"];
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <View className="flex-1 flex-row items-center">
      <SymbolView name={icon} size={20} tintColor={tint} />
      <View className="ml-2">
        <Text className="font-bold text-[17px] text-ink">{value}</Text>
        <Text className="font-regular text-[11px] text-muted">{label}</Text>
      </View>
    </View>
  );
}

function OverviewStat({
  icon,
  value,
  label,
}: {
  icon: SymbolViewProps["name"];
  value: string;
  label: string;
}) {
  return (
    <View className="w-1/2 flex-row items-center py-2">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-surface">
        <SymbolView name={icon} size={16} tintColor="#16A34A" />
      </View>
      <View className="ml-2 flex-1">
        <Text className="font-bold text-[16px] text-ink">{value}</Text>
        <Text className="font-regular text-[11px] text-muted">{label}</Text>
      </View>
    </View>
  );
}

function GoalCard({
  icon,
  title,
  subtitle,
  pct,
}: {
  icon: SymbolViewProps["name"];
  title: string;
  subtitle: string;
  pct: number;
}) {
  return (
    <View className="mb-3 flex-row items-center rounded-2xl border border-line bg-card px-4 py-4">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-green-surface">
        <SymbolView name={icon} size={18} tintColor="#16A34A" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="font-semibold text-[15px] text-ink">{title}</Text>
        <Text className="mt-[1px] font-regular text-[12px] text-muted">{subtitle}</Text>
        <View className="mt-2 h-[6px] overflow-hidden rounded-full bg-line">
          <View className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
        </View>
      </View>
      <Text className="ml-3 font-bold text-[14px] text-green-dark">{pct}%</Text>
    </View>
  );
}

function relativeDate(iso: string | null): string {
  if (!iso) return "Completed";
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86400000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";

import { ProgressRing } from "../../components/progress-ring";
import { useApi, useFetch, todayLocal } from "../../lib/api";
import { useDay, dayTotals, groupByMeal } from "../../lib/use-day";
import { MEAL_TYPES } from "../../lib/food";
import { useThemeColors } from "../../lib/theme";
import type { WorkoutDay, WorkoutPlan } from "@/db/schema";

const MACRO_META = [
  { key: "proteinG", label: "Protein", color: "#22C55E" },
  { key: "carbsG", label: "Carbs", color: "#3882F6" },
  { key: "fatG", label: "Fat", color: "#F59E0B" },
] as const satisfies readonly {
  key: "proteinG" | "carbsG" | "fatG";
  label: string;
  color: string;
}[];

function MacroBar({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const pct = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
  return (
    <View className="mb-3">
      <View className="mb-[5px] flex-row items-center justify-between">
        <Text className="font-medium text-[12px] text-muted">{label}</Text>
        <Text className="font-medium text-[12px] text-muted">
          <Text className="font-semibold text-[12px] text-ink">{Math.round(value)}</Text>
          {" / "}{goal}g
        </Text>
      </View>
      <View className="h-[5px] overflow-hidden rounded-full bg-line">
        <View
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { request } = useApi();
  const colors = useThemeColors();
  const today = todayLocal();
  const { data, loading, refetch } = useDay(today);

  const { data: workout } = useFetch(
    () =>
      request<{ plan: WorkoutPlan | null; days: WorkoutDay[] }>(
        "/api/workouts/plan",
      ),
    [],
  );

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/" />;

  const entries = data?.entries ?? [];
  const totals = dayTotals(entries);
  const groups = groupByMeal(entries);
  const target = data?.targets?.calories ?? 0;
  const consumed = totals.calories;
  const remaining = Math.max(0, target - consumed);
  const firstDay = workout?.days?.[0];

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor="#22C55E"
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-1">
          <View className="h-9 w-9 overflow-hidden rounded-full bg-green-light">
            {user?.imageUrl ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={{ width: 36, height: 36 }}
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <SymbolView name="person.fill" size={18} tintColor="#16A34A" />
              </View>
            )}
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="font-bold text-[17px] text-ink">Today</Text>
            <SymbolView name="chevron.down" size={11} tintColor={colors.muted} weight="semibold" />
          </View>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
            <SymbolView name="flame.fill" size={17} tintColor="#F59E0B" />
          </View>
        </View>

        {/* Calorie ring + macros */}
        <View className="mt-4 flex-row items-center px-5">
          <View className="items-center">
            <ProgressRing
              size={140}
              strokeWidth={11}
              progress={target > 0 ? consumed / target : 0}
              color="#22C55E"
              trackColor={colors.ringTrack}
            >
              <Text className="font-bold text-[32px] leading-9 text-ink">
                {consumed.toLocaleString()}
              </Text>
              <Text className="mt-[2px] font-regular text-[11px] text-muted">
                of {target.toLocaleString()} kcal
              </Text>
            </ProgressRing>
            <View className="mt-2 items-center">
              <Text className="font-bold text-[17px] text-ink">
                {remaining.toLocaleString()}
              </Text>
              <Text className="font-regular text-[12px] text-muted">
                remaining
              </Text>
            </View>
          </View>

          <View className="ml-5 flex-1">
            {MACRO_META.map((m) => (
              <MacroBar
                key={m.key}
                label={m.label}
                value={totals[m.key]}
                goal={data?.targets?.[m.key] ?? 0}
                color={m.color}
              />
            ))}
          </View>
        </View>

        {/* Meals */}
        <View className="mt-5 px-5">
          <Text className="mb-3 font-bold text-[16px] text-ink">Meals</Text>
          {entries.length === 0 && !loading ? (
            <View className="items-center rounded-2xl border border-line bg-surface px-5 py-8">
              <Text className="mb-1 font-semibold text-[15px] text-ink">No food logged yet</Text>
              <Text className="mb-5 text-center font-regular text-[13px] text-muted">
                Let's change that.{"\n"}Snap a photo or search to get started.
              </Text>
              <Pressable
                onPress={() => router.push("/log")}
                className="h-11 w-full items-center justify-center rounded-2xl bg-green"
                style={{
                  shadowColor: "#16A34A",
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <Text className="font-semibold text-[15px] text-white">Log your first meal</Text>
              </Pressable>
            </View>
          ) : (
            MEAL_TYPES.map((meal) => {
              const mealEntries = groups[meal.value];
              const kcal = mealEntries.reduce((s, e) => s + e.totalCalories, 0);
              const analyzing = mealEntries.some((e) => e.status === "pending");
              return (
                <Pressable
                  key={meal.value}
                  onPress={() => router.push("/food")}
                  className="mb-[10px] flex-row items-center rounded-2xl border border-line bg-surface px-3 py-[11px] active:opacity-80"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-surface">
                    <Text className="text-[17px]">{meal.emoji}</Text>
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-[14px] text-ink">
                      {meal.label}
                    </Text>
                    {analyzing ? (
                      <Text className="font-regular text-[12px] text-green-dark">
                        Analyzing photo…
                      </Text>
                    ) : mealEntries.length ? (
                      <Text
                        numberOfLines={1}
                        className="font-regular text-[12px] text-muted"
                      >
                        {mealEntries
                          .flatMap((e) => e.items.map((i) => i.name))
                          .slice(0, 3)
                          .join(", ") || `${mealEntries.length} item(s)`}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="font-semibold text-[14px] text-ink">
                    {kcal > 0 ? `${kcal} kcal` : "—"}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Today's workout */}
        {firstDay ? (
          <View className="mt-2 px-5">
            <View className="rounded-2xl border border-line bg-surface px-4 pt-4 pb-3">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="font-regular text-[12px] text-muted">
                    Today's workout
                  </Text>
                  <Text className="mt-[2px] font-bold text-[18px] text-ink">
                    {firstDay.name}
                  </Text>
                  <Text className="mt-[2px] font-regular text-[12px] text-muted">
                    {firstDay.exercises.length} exercises · ~{Math.round(firstDay.exercises.length * 4 + 10)} min
                  </Text>
                </View>
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-green-surface">
                  <SymbolView
                    name="figure.strengthtraining.traditional"
                    size={20}
                    tintColor="#16A34A"
                  />
                </View>
              </View>
              <Pressable
                onPress={() => router.push("/workout")}
                className="mt-3 h-10 items-center justify-center rounded-xl bg-green active:opacity-90"
              >
                <Text className="font-semibold text-[14px] text-white">Start workout</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Quick actions */}
        <View className="mt-5 px-5">
          <Text className="mb-3 font-bold text-[16px] text-ink">Quick actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <QuickAction
              icon="camera.fill"
              label="Scan food (AI)"
              onPress={() => router.push("/log")}
            />
            <QuickAction
              icon="barcode.viewfinder"
              label="Barcode scan"
              onPress={() => router.push("/log/barcode")}
            />
            <QuickAction
              icon="magnifyingglass"
              label="Search foods"
              onPress={() => router.push("/log/search")}
            />
            <QuickAction
              icon="star.fill"
              label="Saved meals"
              onPress={() => router.push("/log/search")}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: Parameters<typeof SymbolView>[0]["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 min-w-[44%] flex-row items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-3 active:opacity-80"
    >
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-green-light">
        <SymbolView name={icon} size={15} tintColor="#16A34A" />
      </View>
      <Text className="flex-1 font-medium text-[13px] text-ink">{label}</Text>
    </Pressable>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { Icon } from "@/components/icon";
import { Image } from "expo-image";
import * as Localization from "expo-localization";

import { ProgressRing } from "../../components/progress-ring";
import { useApi, useFetch, todayLocal } from "../../lib/api";
import { useDay, dayTotals, groupByMeal } from "../../lib/use-day";
import { useSteps } from "../../lib/steps";
import { MEAL_TYPES, defaultMeal } from "../../lib/food";
import { useThemeColors } from "../../lib/theme";
import { useProfile } from "../../lib/profile-context";
import { suggestNextMeal, CATALOG } from "../../lib/suggest";
import { estimatedPriceSource } from "../../lib/pricing";
import { planBudgetDay } from "../../lib/budget-optimizer";
import { resolveBudgetContext, formatMoney } from "../../lib/region";
import { track, setAcquisitionSource } from "../../lib/analytics";
import { noteFoodLogged } from "../../lib/notifications";
import { redeemPendingRef } from "../../lib/referral";
import type { SavedMealItem, WorkoutDay, WorkoutPlan } from "@/db/schema";

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
  const { profile } = useProfile();
  const { request } = useApi();
  const colors = useThemeColors();
  const today = todayLocal();
  const { data, loading, refetch } = useDay(today);

  // Arriving from the post-onboarding welcome screen with ?log=1 → open the log
  // sheet once so the user's very first action is logging a meal (home renders
  // underneath the modal, so closing it lands here cleanly).
  const { log: logParam } = useLocalSearchParams<{ log?: string }>();
  const [openedFirstLog, setOpenedFirstLog] = useState(false);
  useEffect(() => {
    if (logParam === "1" && !openedFirstLog) {
      setOpenedFirstLog(true);
      router.push("/log");
    }
  }, [logParam, openedFirstLog]);

  // Redeem a captured referral code once, after the user is authenticated here.
  const [redeemChecked, setRedeemChecked] = useState(false);
  useEffect(() => {
    if (redeemChecked) return;
    setRedeemChecked(true);
    void redeemPendingRef(request).then((result) => {
      if (result) {
        // Tag which creator/code acquired this user so retention can be broken
        // down per creator in analytics.
        setAcquisitionSource(result.code);
        track("referral_redeemed", {
          rewardDays: result.rewardDays,
          code: result.code,
        });
        Alert.alert(
          "🎉 You've got Premium!",
          `Your invite unlocked ${result.rewardDays} days of Premium — free. Enjoy!`,
        );
      }
    });
  }, [redeemChecked, request]);

  const { data: workout } = useFetch(
    () =>
      request<{ plan: WorkoutPlan | null; days: WorkoutDay[] }>(
        "/api/workouts/plan",
      ),
    [],
  );

  // Streak (retention: progress visibility is the strongest long-term driver).
  const { data: summary, refetch: refetchSummary } = useFetch(
    () => request<{ streakDays: number }>("/api/me/summary"),
    [],
  );

  // Recently-logged foods for one-tap re-logging (kills logging fatigue).
  const { data: recentsData, refetch: refetchRecents } = useFetch(
    () => request<{ recents: SavedMealItem[] }>("/api/food/recents"),
    [],
  );
  const [logging, setLogging] = useState<string | null>(null);

  const steps = useSteps();

  // Poll while a photo entry is still analyzing so it fills in on its own (the
  // Inngest vision job updates it server-side). Kept above the early returns
  // below so the hook order stays constant.
  const analyzing = (data?.entries ?? []).some((e) => e.status === "pending");
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(() => void refetch(), 3000);
    return () => clearInterval(id);
  }, [analyzing, refetch]);

  // Refetch when Home regains focus (e.g. after logging a photo) so a new
  // pending entry appears and the poll above tracks it. Above the early returns
  // to keep hook order constant.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // One-tap re-log of a recent food. Optimistic-feeling: refetch the day (ring
  // updates) + streak/recents so the reward is immediate.
  async function relogRecent(item: SavedMealItem) {
    if (logging) return;
    setLogging(item.name);
    try {
      await request("/api/food/entries", {
        method: "POST",
        body: JSON.stringify({
          loggedDate: today,
          mealType: defaultMeal(),
          source: "manual",
          items: [item],
        }),
      });
      track("food_logged", { source: "recent" });
      void noteFoodLogged();
      await Promise.all([refetch(), refetchRecents(), refetchSummary()]);
    } catch {
      Alert.alert("Couldn't log", "Please try again.");
    } finally {
      setLogging(null);
    }
  }

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/" />;

  const streak = summary?.streakDays ?? 0;
  const recents = recentsData?.recents ?? [];
  const entries = data?.entries ?? [];
  const totals = dayTotals(entries);
  const groups = groupByMeal(entries);
  const target = data?.targets?.calories ?? 0;
  const consumed = totals.calories;
  const remaining = Math.max(0, target - consumed);
  const firstDay = workout?.days?.[0];

  // The wedge: tell beginners what to eat next, not just show an empty budget.
  // Rules-based (no AI cost) — only when there's a real budget left to fill.
  const remainingProtein = Math.max(
    0,
    (data?.targets?.proteinG ?? 0) - totals.proteinG,
  );
  const suggestion =
    target > 0
      ? suggestNextMeal({
          remainingCalories: remaining,
          remainingProteinG: remainingProtein,
          daySeed: new Date().getDate(),
        })
      : null;

  // Budget-aware "eat well on what you can afford" — offline, non-AI optimizer
  // over cheap high-protein foods. Only when the user opted into a budget.
  const proteinTarget = data?.targets?.proteinG ?? 0;
  const budgetDay =
    profile?.budgetAmount != null && target > 0
      ? planBudgetDay({
          targets: { calories: target, proteinG: proteinTarget },
          budget:
            profile.budgetPeriod === "week"
              ? profile.budgetAmount / 7
              : profile.budgetAmount,
          foods: estimatedPriceSource.price(
            CATALOG,
            resolveBudgetContext(Localization.getLocales()[0]),
          ),
          currencySymbol:
            Localization.getLocales()[0]?.currencySymbol ?? "$",
        })
      : null;

  const stepsToday = Math.max(
    steps.days.find((d) => d.date === today)?.steps ?? 0,
    steps.today,
  );
  const stepPct =
    steps.goal > 0 ? Math.min(100, Math.round((stepsToday / steps.goal) * 100)) : 0;

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
          <Pressable
            onPress={() => router.push("/profile")}
            className="h-9 w-9 overflow-hidden rounded-full bg-green-light active:opacity-80"
          >
            {user?.imageUrl ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={{ width: 36, height: 36 }}
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Icon name="person.fill" size={18} tintColor="#16A34A" />
              </View>
            )}
          </Pressable>
          <View className="flex-row items-center gap-1">
            <Text className="font-bold text-[17px] text-ink">Today</Text>
          </View>
          {/* Real streak — progress visibility drives retention */}
          <View className="h-9 min-w-9 flex-row items-center justify-center gap-1 rounded-full bg-surface px-2">
            <Icon name="flame.fill" size={16} tintColor="#F59E0B" />
            {streak > 0 ? (
              <Text className="font-bold text-[14px] text-ink">{streak}</Text>
            ) : null}
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

        {/* What to eat next — the "tell me what to do today" wedge */}
        {suggestion ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/log/search",
                params: { meal: "snack", q: suggestion.name },
              })
            }
            className="mx-5 mt-5 flex-row items-center rounded-2xl border border-green-light bg-green-surface px-4 py-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-card">
              <Text className="text-[20px]">{suggestion.emoji}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-regular text-[12px] text-green-dark">
                Suggested next
              </Text>
              <Text className="mt-[1px] font-bold text-[15px] text-ink">
                {suggestion.name}
              </Text>
              <Text className="mt-[1px] font-regular text-[12px] text-muted">
                {suggestion.reason}
              </Text>
            </View>
            <Icon name="plus.circle.fill" size={24} tintColor="#16A34A" />
          </Pressable>
        ) : null}

        {/* Eat well on your budget — offline optimizer over cheap, high-protein
            foods. Only shown when the user opted into a food budget. */}
        {budgetDay && !budgetDay.empty ? (
          <View className="mx-5 mt-5 rounded-2xl border border-line bg-card p-4">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="font-bold text-[15px] text-ink">
                Eat well on your budget
              </Text>
              <Text className="font-semibold text-[13px] text-green-dark">
                {formatMoney(budgetDay.totalCost, budgetDay.currencySymbol)}
                {" / "}
                {formatMoney(budgetDay.budget, budgetDay.currencySymbol)}
              </Text>
            </View>
            <Text className="mb-3 font-regular text-[12px] text-muted">
              ~{Math.round(budgetDay.totalProteinG)}g protein ·{" "}
              {Math.round(budgetDay.totalCalories).toLocaleString()} kcal today
            </Text>
            {budgetDay.items.map((it) => (
              <Pressable
                key={it.food.name}
                onPress={() =>
                  router.push({
                    pathname: "/log/search",
                    params: { meal: defaultMeal(), q: it.food.name },
                  })
                }
                className="flex-row items-center py-[6px] active:opacity-70"
              >
                <Text className="text-[18px]">{it.food.emoji}</Text>
                <Text className="ml-2 flex-1 font-medium text-[14px] text-ink">
                  {it.food.name}
                  {it.servings > 1 ? ` ×${it.servings}` : ""}
                </Text>
                <Text className="font-regular text-[12px] text-muted">
                  {formatMoney(it.cost, budgetDay.currencySymbol)} ·{" "}
                  {Math.round(it.proteinG)}g
                </Text>
              </Pressable>
            ))}
            {!budgetDay.meetsProtein ? (
              <Text className="mt-2 font-regular text-[11px] text-muted">
                This is the most protein your budget covers today — raising it a
                little closes the gap.
              </Text>
            ) : null}
          </View>
        ) : budgetDay && budgetDay.empty ? (
          <View className="mx-5 mt-5 rounded-2xl border border-line bg-card p-4">
            <Text className="font-bold text-[15px] text-ink">
              Eat well on your budget
            </Text>
            <Text className="mt-1 font-regular text-[12px] text-muted">
              Your daily budget is below the cheapest option we know — try raising
              it in Goals.
            </Text>
          </View>
        ) : null}

        {/* Log again — one-tap re-log of recent foods (kills logging fatigue) */}
        {recents.length ? (
          <View className="mt-5">
            <Text className="mb-2 px-5 font-bold text-[16px] text-ink">
              Log again
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {recents.map((r, i) => {
                const busy = logging === r.name;
                return (
                  <Pressable
                    key={`${r.name}-${i}`}
                    disabled={logging !== null}
                    onPress={() => relogRecent(r)}
                    className="flex-row items-center rounded-2xl border border-line bg-surface py-[10px] pl-3 pr-[10px] active:opacity-80"
                    style={{ opacity: logging && !busy ? 0.5 : 1 }}
                  >
                    <View className="mr-2 max-w-[150px]">
                      <Text
                        numberOfLines={1}
                        className="font-semibold text-[13px] text-ink"
                      >
                        {r.name}
                      </Text>
                      <Text className="font-regular text-[11px] text-muted">
                        {r.calories} kcal
                      </Text>
                    </View>
                    <Icon
                      name={busy ? "arrow.clockwise" : "plus.circle.fill"}
                      size={20}
                      tintColor="#16A34A"
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Invite friends — referral growth loop */}
        <Pressable
          onPress={() => router.push("/invite" as Href)}
          className="mx-5 mt-5 flex-row items-center rounded-2xl border border-green-light bg-green-surface px-4 py-3 active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-card">
            <Icon name="gift.fill" size={20} tintColor="#16A34A" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-bold text-[15px] text-ink">Invite friends</Text>
            <Text className="mt-[1px] font-regular text-[12px] text-muted">
              You both get a free week of Premium
            </Text>
          </View>
          <Icon name="chevron.right" size={14} tintColor={colors.faint} />
        </Pressable>

        {/* Steps */}
        {steps.available !== false ? (
          <Pressable
            onPress={() => router.push("/progress")}
            className="mx-5 mt-5 flex-row items-center rounded-2xl border border-line bg-surface px-4 py-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-green-surface">
              <Icon name="figure.walk" size={20} tintColor="#16A34A" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-regular text-[12px] text-muted">
                Steps today
              </Text>
              <Text className="mt-[1px] font-bold text-[16px] text-ink">
                {stepsToday.toLocaleString()}
                <Text className="font-regular text-[12px] text-muted">
                  {" "}
                  / {steps.goal.toLocaleString()}
                </Text>
              </Text>
              <View className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
                <View
                  className="h-full rounded-full bg-green"
                  style={{ width: `${stepPct}%` }}
                />
              </View>
            </View>
            <Text className="ml-3 font-bold text-[15px] text-green-dark">
              {stepPct}%
            </Text>
          </Pressable>
        ) : null}

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
                  <Icon
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
              onPress={() => router.push("/log")}
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
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 min-w-[44%] flex-row items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-3 active:opacity-80"
    >
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-green-light">
        <Icon name={icon} size={15} tintColor="#16A34A" />
      </View>
      <Text className="flex-1 font-medium text-[13px] text-ink">{label}</Text>
    </Pressable>
  );
}

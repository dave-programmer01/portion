import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { Icon } from "@/components/icon";

import { useApi, useFetch, todayLocal } from "../lib/api";
import { useProfile } from "../lib/profile-context";
import { useThemeColors } from "../lib/theme";
import { useNotifPrefs } from "../lib/notifications";
import { buildMotivationCards, type MotivationCard } from "../lib/motivation";
import { markMotivationSeen } from "../lib/motivation-seen";

type Summary = {
  streakDays: number;
  lastLoggedDate: string | null;
  caloriesTarget: number | null;
  caloriesEatenToday: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(lastIso: string | null, todayIso: string): number | null {
  if (!lastIso) return null;
  const diff = Date.parse(todayIso) - Date.parse(lastIso);
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.round(diff / DAY_MS));
}

/**
 * Motivation Center — the in-app companion to push notifications. Always
 * reachable from the home bell, it shows contextual nudges built from the user's
 * real activity plus a daily quote. Opening it clears the bell's unread dot.
 */
export default function Motivation() {
  const { request } = useApi();
  const { profile } = useProfile();
  const { prefs } = useNotifPrefs();
  const colors = useThemeColors();
  const today = todayLocal();

  const { data: summary } = useFetch(
    () => request<Summary>("/api/me/summary"),
    [],
  );

  // Opening the Center marks everything seen.
  useEffect(() => {
    void markMotivationSeen();
  }, []);

  const target = summary?.caloriesTarget ?? null;
  const eaten = summary?.caloriesEatenToday ?? 0;
  const cards: MotivationCard[] = buildMotivationCards({
    today,
    streakDays: summary?.streakDays ?? 0,
    loggedToday: eaten > 0,
    daysSinceLastLog: daysSince(summary?.lastLoggedDate ?? null, today),
    remainingCalories: target != null ? Math.max(0, target - eaten) : null,
    hasBudget: profile?.budgetAmount != null,
    notificationsEnabled: prefs?.enabled ?? false,
    daySeed: new Date().getDate(),
  });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[22px] text-ink">Motivation</Text>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Icon name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {cards.map((card) => (
          <View
            key={card.id}
            className="rounded-2xl bg-surface p-4"
          >
            <View className="flex-row items-start">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-green-surface">
                <Text className="text-[20px]">{card.emoji}</Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-bold text-[15px] text-ink">
                  {card.title}
                </Text>
                <Text className="mt-1 font-regular text-[13px] leading-[19px] text-muted">
                  {card.body}
                </Text>
                {card.cta ? (
                  <Pressable
                    onPress={() => router.push(card.cta!.href as Href)}
                    className="mt-3 self-start rounded-full bg-green px-4 py-2 active:opacity-80"
                  >
                    <Text className="font-semibold text-[13px] text-white">
                      {card.cta.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

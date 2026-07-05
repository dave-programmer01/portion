import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useApi, useFetch, todayLocal } from "../../lib/api";
import { defaultMeal, MEAL_TYPES } from "../../lib/food";
import { useThemeColors } from "../../lib/theme";
import type { MealType, SavedMeal } from "@/db/schema";

/**
 * Log-food chooser. Pick a meal, then a method: photo (AI), barcode, search, or
 * manual. Saved meals re-log in one tap. Everything logs against "today".
 */
export default function LogChooser() {
  const { request } = useApi();
  const colors = useThemeColors();
  const [meal, setMeal] = useState<MealType>(defaultMeal());
  const [saving, setSaving] = useState<string | null>(null);

  const { data } = useFetch(
    () => request<{ meals: SavedMeal[] }>("/api/food/saved-meals"),
    [],
  );

  async function relog(sm: SavedMeal) {
    setSaving(sm.id);
    try {
      await request("/api/food/entries", {
        method: "POST",
        body: JSON.stringify({
          loggedDate: todayLocal(),
          mealType: meal,
          source: "saved",
          items: sm.items,
        }),
      });
      router.back();
    } catch {
      Alert.alert("Couldn't log", "Please try again.");
      setSaving(null);
    }
  }

  const go = (path: "photo" | "barcode" | "search") =>
    router.push({ pathname: `/log/${path}`, params: { meal } });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[22px] text-ink">Log food</Text>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Meal selector */}
        <View className="mb-6 flex-row gap-2">
          {MEAL_TYPES.map((m) => {
            const active = meal === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setMeal(m.value)}
                className={`flex-1 items-center rounded-2xl border py-3 ${
                  active ? "border-green bg-green-surface" : "border-line bg-card"
                }`}
              >
                <Text className="text-[18px]">{m.emoji}</Text>
                <Text
                  className={`mt-1 font-medium text-[12px] ${active ? "text-green-dark" : "text-muted"}`}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Methods */}
        <Method
          icon="camera.fill"
          title="Take a photo"
          subtitle="AI estimates the calories & macros"
          tint="#22C55E"
          onPress={() => go("photo")}
        />
        <Method
          icon="barcode.viewfinder"
          title="Scan barcode"
          subtitle="Look up a packaged food"
          tint="#3882F6"
          onPress={() => go("barcode")}
        />
        <Method
          icon="magnifyingglass"
          title="Search foods"
          subtitle="Find by name, or add manually"
          tint="#F59E0B"
          onPress={() => go("search")}
        />

        {/* Saved meals */}
        {data?.meals.length ? (
          <View className="mt-6">
            <Text className="mb-3 font-bold text-[16px] text-ink">
              Saved meals
            </Text>
            {data.meals.map((sm) => (
              <Pressable
                key={sm.id}
                disabled={saving !== null}
                onPress={() => relog(sm)}
                className="mb-[10px] flex-row items-center rounded-2xl border border-line bg-surface px-4 py-[13px] active:opacity-90"
                style={{ opacity: saving && saving !== sm.id ? 0.5 : 1 }}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-surface">
                  <SymbolView name="star.fill" size={16} tintColor="#16A34A" />
                </View>
                <Text className="ml-3 flex-1 font-medium text-[15px] text-ink">
                  {sm.name}
                </Text>
                <Text className="font-regular text-[14px] text-muted">
                  {sm.totalCalories} kcal
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Method({
  icon,
  title,
  subtitle,
  tint,
  onPress,
}: {
  icon: SymbolViewProps["name"];
  title: string;
  subtitle: string;
  tint: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-center rounded-2xl border border-line bg-card px-4 py-4 active:opacity-90"
    >
      <View
        className="h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${tint}1A` }}
      >
        <SymbolView name={icon} size={22} tintColor={tint} />
      </View>
      <View className="ml-4 flex-1">
        <Text className="font-semibold text-[16px] text-ink">{title}</Text>
        <Text className="mt-[2px] font-regular text-[13px] text-muted">
          {subtitle}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={14} tintColor={colors.faint} />
    </Pressable>
  );
}

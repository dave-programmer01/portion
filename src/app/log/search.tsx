import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import { useThemeColors } from "../../lib/theme";
import { track } from "../../lib/analytics";
import { NumberField, PrimaryButton, TextField } from "../../components/ui";
import { ServingPicker } from "../../components/serving-picker";
import type { FoodMasterLite, LogItem } from "../../lib/food";
import type { MealType } from "@/db/schema";

/**
 * Search Open Food Facts by name (debounced), or switch to a manual entry form
 * for foods that aren't in the database. Both paths log against "today".
 */
export default function FoodSearch() {
  const { meal } = useLocalSearchParams<{ meal?: MealType }>();
  const { request } = useApi();
  const colors = useThemeColors();

  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodMasterLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<FoodMasterLite | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Debounced search.
  useEffect(() => {
    if (manual || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await request<{ results: FoodMasterLite[] }>(
          `/api/food/search?q=${encodeURIComponent(query.trim())}`,
        );
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, manual, request]);

  async function logItem(item: LogItem, source: "search" | "manual") {
    setSubmitting(true);
    try {
      await request("/api/food/entries", {
        method: "POST",
        body: JSON.stringify({
          loggedDate: todayLocal(),
          mealType: meal ?? "snack",
          source,
          items: [item],
        }),
      });
      track("food_logged", { source });
      router.dismissAll();
    } catch {
      Alert.alert("Couldn't log", "Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[20px] text-ink">
          {manual ? "Manual entry" : "Search foods"}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <View className="flex-1 px-5 pt-4">
        {manual ? (
          <ManualForm submitting={submitting} onSubmit={(i) => logItem(i, "manual")} />
        ) : (
          <>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. greek yogurt"
              autoFocus
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator color="#22C55E" style={{ marginTop: 12 }} />
            ) : null}
            <FlatList
              data={results}
              keyExtractor={(item, i) => `${item.name}-${i}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setPicked(item)}
                  className="mb-[10px] flex-row items-center rounded-2xl border border-line bg-surface px-4 py-3 active:opacity-90"
                >
                  <View className="flex-1 pr-3">
                    <Text
                      numberOfLines={1}
                      className="font-medium text-[15px] text-ink"
                    >
                      {item.name}
                    </Text>
                    <Text className="mt-[2px] font-regular text-[12px] text-muted">
                      {item.brand ? `${item.brand} · ` : ""}
                      {Math.round(item.caloriesPer100)} kcal / 100g
                    </Text>
                  </View>
                  <SymbolView name="plus.circle.fill" size={22} tintColor="#22C55E" />
                </Pressable>
              )}
              ListEmptyComponent={
                query.trim().length >= 2 && !searching ? (
                  <Text className="mt-6 text-center font-regular text-[14px] text-muted">
                    No matches. Try manual entry below.
                  </Text>
                ) : null
              }
            />
          </>
        )}
      </View>

      <View className="px-5 pb-2 pt-2">
        <Pressable onPress={() => setManual((m) => !m)} className="py-2">
          <Text className="text-center font-semibold text-[14px] text-green-dark">
            {manual ? "← Back to search" : "Can't find it? Add manually"}
          </Text>
        </Pressable>
      </View>

      <ServingPicker
        food={picked}
        visible={picked !== null}
        submitting={submitting}
        onClose={() => setPicked(null)}
        onConfirm={(item) => logItem(item, "search")}
      />
    </SafeAreaView>
  );
}

function ManualForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (item: LogItem) => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");

  const valid = name.trim().length > 0 && Number(kcal) > 0;

  return (
    <View>
      <TextField
        label="Food name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Homemade pasta"
      />
      <NumberField
        label="Calories (this serving)"
        unit="kcal"
        value={kcal}
        onChangeText={(t) => setKcal(t.replace(/[^0-9]/g, ""))}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <NumberField
            label="Protein"
            unit="g"
            value={p}
            onChangeText={(t) => setP(t.replace(/[^0-9.]/g, ""))}
          />
        </View>
        <View className="flex-1">
          <NumberField
            label="Carbs"
            unit="g"
            value={c}
            onChangeText={(t) => setC(t.replace(/[^0-9.]/g, ""))}
          />
        </View>
        <View className="flex-1">
          <NumberField
            label="Fat"
            unit="g"
            value={f}
            onChangeText={(t) => setF(t.replace(/[^0-9.]/g, ""))}
          />
        </View>
      </View>
      <PrimaryButton
        label="Add to log"
        icon="plus"
        loading={submitting}
        disabled={!valid}
        onPress={() =>
          onSubmit({
            name: name.trim(),
            quantity: 1,
            unit: "serving",
            calories: Number(kcal),
            proteinG: Number(p) || 0,
            carbsG: Number(c) || 0,
            fatG: Number(f) || 0,
          })
        }
      />
    </View>
  );
}

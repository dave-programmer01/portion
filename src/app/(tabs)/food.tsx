import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import { useDay, dayTotals, groupByMeal, type DayEntry } from "../../lib/use-day";
import { MEAL_TYPES } from "../../lib/food";
import { useThemeColors } from "../../lib/theme";
import { PrimaryButton, CenterState, ErrorState } from "../../components/ui";
import type { EntrySource } from "@/db/schema";

const SOURCE_ICON: Record<EntrySource, SymbolViewProps["name"]> = {
  photo: "camera.fill",
  barcode: "barcode",
  search: "magnifyingglass",
  manual: "square.and.pencil",
  saved: "star.fill",
};

export default function Food() {
  const { request } = useApi();
  const today = todayLocal();
  const { data, loading, error, refetch } = useDay(today);
  const [busy, setBusy] = useState(false);

  const entries = data?.entries ?? [];
  const totals = dayTotals(entries);
  const target = data?.targets?.calories ?? 0;
  const groups = groupByMeal(entries);

  async function deleteEntry(id: string) {
    setBusy(true);
    try {
      await request(`/api/food/entries/${id}`, { method: "DELETE" });
      await refetch();
    } catch {
      Alert.alert("Couldn't delete", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(entry: DayEntry, itemId: string) {
    const remaining = entry.items.filter((i) => i.id !== itemId);
    setBusy(true);
    try {
      if (remaining.length === 0) {
        await request(`/api/food/entries/${entry.id}`, { method: "DELETE" });
      } else {
        await request(`/api/food/entries/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            items: remaining.map((i) => ({
              name: i.name,
              brand: i.brand,
              quantity: i.quantity,
              unit: i.unit,
              servingLabel: i.servingLabel,
              calories: i.calories,
              proteinG: i.proteinG,
              carbsG: i.carbsG,
              fatG: i.fatG,
            })),
          }),
        });
      }
      await refetch();
    } catch {
      Alert.alert("Couldn't update", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveFavorite(entry: DayEntry) {
    if (entry.items.length === 0) return;
    const name = await promptMealName(defaultMealName(entry));
    if (!name) return;
    setBusy(true);
    try {
      await request("/api/food/saved-meals", {
        method: "POST",
        body: JSON.stringify({
          name,
          mealType: entry.mealType,
          items: entry.items.map((i) => ({
            name: i.name,
            brand: i.brand,
            quantity: i.quantity,
            unit: i.unit,
            servingLabel: i.servingLabel,
            calories: i.calories,
            proteinG: i.proteinG,
            carbsG: i.carbsG,
            fatG: i.fatG,
          })),
        }),
      });
      Alert.alert("Saved to favorites", `"${name}" is ready for one-tap logging.`);
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[26px] text-ink">Food</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor="#22C55E"
          />
        }
      >
        {/* Day summary */}
        <View className="mb-5 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
          <View>
            <Text className="font-regular text-[12px] text-muted">
              Eaten today
            </Text>
            <Text className="mt-[2px] font-bold text-[24px] text-ink">
              {totals.calories.toLocaleString()}
              <Text className="font-regular text-[14px] text-muted">
                {" "}
                / {target.toLocaleString()} kcal
              </Text>
            </Text>
          </View>
          <View className="flex-row gap-4">
            <MiniMacro label="P" value={totals.proteinG} />
            <MiniMacro label="C" value={totals.carbsG} />
            <MiniMacro label="F" value={totals.fatG} />
          </View>
        </View>

        {error && !data ? (
          <ErrorState onRetry={refetch} />
        ) : entries.length === 0 && !loading ? (
          <CenterState
            icon="fork.knife"
            title="Nothing logged yet"
            subtitle="Snap a photo, scan a barcode, or search to add your first meal."
          >
            <PrimaryButton
              label="Log food"
              icon="plus"
              onPress={() => router.push("/log")}
            />
          </CenterState>
        ) : (
          MEAL_TYPES.map((meal) => {
            const mealEntries = groups[meal.value];
            if (mealEntries.length === 0) return null;
            return (
              <View key={meal.value} className="mb-5">
                <Text className="mb-2 font-bold text-[15px] text-ink">
                  {meal.emoji} {meal.label}
                </Text>
                {mealEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    disabled={busy}
                    onDelete={() => deleteEntry(entry.id)}
                    onRemoveItem={(itemId) => removeItem(entry, itemId)}
                    onSaveFavorite={() => saveFavorite(entry)}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EntryCard({
  entry,
  disabled,
  onDelete,
  onRemoveItem,
  onSaveFavorite,
}: {
  entry: DayEntry;
  disabled: boolean;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
  onSaveFavorite: () => void;
}) {
  const colors = useThemeColors();
  const confirmDelete = () =>
    Alert.alert("Delete entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  // Only complete entries with items can be saved as a reusable favorite.
  const canFavorite = entry.status === "complete" && entry.items.length > 0;

  return (
    <View className="mb-[10px] overflow-hidden rounded-2xl border border-line bg-card">
      {/* Entry header */}
      <View className="flex-row items-center px-3 pt-3 pb-2">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface">
          <SymbolView
            name={SOURCE_ICON[entry.source]}
            size={14}
            tintColor={colors.muted}
          />
        </View>
        <View className="ml-3 flex-1">
          {entry.status === "pending" ? (
            <Text className="font-semibold text-[14px] text-green-dark">
              Analyzing photo…
            </Text>
          ) : entry.status === "failed" ? (
            <Text className="font-semibold text-[14px] text-amber-600">
              Couldn't analyze — no calories counted
            </Text>
          ) : (
            <Text className="font-semibold text-[14px] text-ink">
              {entry.totalCalories} kcal
            </Text>
          )}
          <View className="mt-[3px] flex-row items-center gap-2">
            <MacroDot color="#22C55E" value={Math.round(entry.totalProteinG)} label="P" />
            <MacroDot color="#3882F6" value={Math.round(entry.totalCarbsG)} label="C" />
            <MacroDot color="#F59E0B" value={Math.round(entry.totalFatG)} label="F" />
          </View>
        </View>
        {canFavorite ? (
          <Pressable
            disabled={disabled}
            onPress={onSaveFavorite}
            className="h-8 w-8 items-center justify-center rounded-lg"
            hitSlop={4}
          >
            <SymbolView name="star" size={15} tintColor={colors.faint} />
          </Pressable>
        ) : null}
        <Pressable
          disabled={disabled}
          onPress={confirmDelete}
          className="h-8 w-8 items-center justify-center rounded-lg"
        >
          <SymbolView name="trash" size={15} tintColor={colors.faint} />
        </Pressable>
      </View>

      {entry.items.length > 0 ? (
        <View className="border-t border-line">
          {entry.items.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between px-3 py-[9px]"
            >
              <View className="flex-1 pr-2">
                <Text
                  numberOfLines={1}
                  className="font-medium text-[13px] text-ink"
                >
                  {item.name}
                </Text>
                <View className="mt-[2px] flex-row items-center gap-[10px]">
                  <MacroDot color="#22C55E" value={Math.round(item.proteinG)} label="P" />
                  <MacroDot color="#3882F6" value={Math.round(item.carbsG)} label="C" />
                  <MacroDot color="#F59E0B" value={Math.round(item.fatG)} label="F" />
                </View>
              </View>
              <Text className="mr-3 font-semibold text-[13px] text-ink">
                {item.calories} kcal
              </Text>
              <Pressable
                disabled={disabled}
                onPress={() => onRemoveItem(item.id)}
                hitSlop={8}
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={16}
                  tintColor={colors.faint}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {entry.status === "failed" ? (
        <Pressable
          onPress={() => router.replace("/log/search")}
          className="mx-3 mb-3 items-center rounded-xl bg-surface py-2"
        >
          <Text className="font-semibold text-[13px] text-green-dark">
            Log manually instead
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MacroDot({
  color,
  value,
  label,
}: {
  color: string;
  value: number;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <View
        className="h-[7px] w-[7px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="font-medium text-[11px] text-muted">
        {value}g
      </Text>
    </View>
  );
}

/** A sensible default favorite name from the entry's items. */
function defaultMealName(entry: DayEntry): string {
  const names = entry.items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return "Saved meal";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

/**
 * Ask the user to name the favorite. iOS gets an inline text prompt; Android's
 * Alert has no text input, so it confirms the default name instead. Resolves to
 * the chosen name, or null if cancelled.
 */
function promptMealName(defaultName: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Save as favorite",
        "Name this meal for one-tap logging later.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
          {
            text: "Save",
            onPress: (v?: string) => resolve((v ?? "").trim() || defaultName),
          },
        ],
        "plain-text",
        defaultName,
      );
    } else {
      Alert.alert(
        "Save as favorite",
        `Save "${defaultName}" for one-tap logging later?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
          { text: "Save", onPress: () => resolve(defaultName) },
        ],
      );
    }
  });
}

function MiniMacro({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center">
      <Text className="font-bold text-[15px] text-ink">
        {Math.round(value)}g
      </Text>
      <Text className="font-regular text-[11px] text-muted">{label}</Text>
    </View>
  );
}

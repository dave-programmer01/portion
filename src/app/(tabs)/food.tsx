import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Icon } from "@/components/icon";

import { config } from "../../config";
import { useApi, todayLocal } from "../../lib/api";
import { useDay, dayTotals, groupByMeal, type DayEntry } from "../../lib/use-day";
import { MEAL_TYPES } from "../../lib/food";
import { useThemeColors } from "../../lib/theme";
import { FoodSkeleton } from "../../components/skeletons";
import {
  PrimaryButton,
  CenterState,
  ErrorState,
  NumberField,
  TextField,
} from "../../components/ui";
import type { EntrySource, FoodItem } from "@/db/schema";

const SOURCE_ICON: Record<EntrySource, string> = {
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
  // Item sheet: `item` present → editing it; absent → adding a new item to the
  // entry (e.g. the scan missed a drink).
  const [sheet, setSheet] = useState<{
    entryId: string;
    item?: FoodItem;
  } | null>(null);

  const entries = data?.entries ?? [];
  const totals = dayTotals(entries);
  const target = data?.targets?.calories ?? 0;
  const groups = groupByMeal(entries);

  // A photo entry lands as `pending` and the Inngest vision job fills it in
  // server-side. Poll so it updates on its own instead of needing a manual
  // pull-to-refresh.
  const analyzing = entries.some((e) => e.status === "pending");
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(() => void refetch({ background: true }), 3000);
    return () => clearInterval(id);
  }, [analyzing, refetch]);

  // Refetch when the tab regains focus (e.g. after logging a photo in the modal)
  // so a newly-created pending entry appears and the poll above can track it to
  // completion — otherwise the dashboard keeps showing stale pre-log data.
  useFocusEffect(
    useCallback(() => {
      void refetch({ background: true });
    }, [refetch]),
  );

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

  // Save the item sheet: edit an existing item (when `sheet.item` is set) or add
  // a new one. Either way the PATCH route replaces the whole item list and
  // recomputes the entry's totals.
  async function saveSheet(next: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) {
    if (!sheet) return;
    const entry = entries.find((e) => e.id === sheet.entryId);
    if (!entry) return;
    const serialize = (i: FoodItem) => ({
      name: i.name,
      brand: i.brand,
      quantity: i.quantity,
      unit: i.unit,
      servingLabel: i.servingLabel,
      calories: i.calories,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
    });
    const editId = sheet.item?.id;
    const items = editId
      ? entry.items.map((i) =>
          i.id === editId ? { ...serialize(i), ...next } : serialize(i),
        )
      : [
          ...entry.items.map(serialize),
          { ...next, brand: null, quantity: 1, unit: "serving", servingLabel: null },
        ];
    setBusy(true);
    try {
      await request(`/api/food/entries/${sheet.entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ items }),
      });
      await refetch();
      setSheet(null);
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

  // First load: sketch the diary layout instead of a blank screen.
  if (loading && !data) return <FoodSkeleton />;

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
                    onEditItem={(item) => setSheet({ entryId: entry.id, item })}
                    onAddItem={() => setSheet({ entryId: entry.id })}
                    onSaveFavorite={() => saveFavorite(entry)}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {sheet ? (
        <ItemModal
          initial={sheet.item ?? null}
          title={sheet.item ? "Edit item" : "Add item"}
          submitting={busy}
          onClose={() => setSheet(null)}
          onSave={saveSheet}
        />
      ) : null}
    </SafeAreaView>
  );
}

function EntryCard({
  entry,
  disabled,
  onDelete,
  onRemoveItem,
  onEditItem,
  onAddItem,
  onSaveFavorite,
}: {
  entry: DayEntry;
  disabled: boolean;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
  onEditItem: (item: FoodItem) => void;
  onAddItem: () => void;
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
  // Flag shaky AI estimates so the user knows to double-check them.
  const lowConfidence =
    entry.confidence != null &&
    entry.confidence < config.lowConfidenceThreshold;

  return (
    <View className="mb-[10px] overflow-hidden rounded-2xl border border-line bg-card">
      {/* Entry header */}
      <View className="flex-row items-center px-3 pt-3 pb-2">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface">
          <Icon
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
              {entry.source === "photo" ? (
                lowConfidence ? (
                  <Text className="font-regular text-[12px] text-amber-600">
                    {"  "}· Low confidence — tap to check
                  </Text>
                ) : (
                  <Text className="font-regular text-[12px] text-muted">
                    {"  "}· AI estimate, tap to adjust
                  </Text>
                )
              ) : null}
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
            <Icon name="star" size={15} tintColor={colors.faint} />
          </Pressable>
        ) : null}
        <Pressable
          disabled={disabled}
          onPress={confirmDelete}
          className="h-8 w-8 items-center justify-center rounded-lg"
        >
          <Icon name="trash" size={15} tintColor={colors.faint} />
        </Pressable>
      </View>

      {entry.items.length > 0 ? (
        <View className="border-t border-line">
          {entry.items.map((item) => (
            <Pressable
              key={item.id}
              disabled={disabled}
              onPress={() => onEditItem(item)}
              className="flex-row items-center justify-between px-3 py-[9px] active:bg-surface"
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
              <Text className="mr-2 font-semibold text-[13px] text-ink">
                {item.calories} kcal
              </Text>
              {/* Edit hint — the whole row is tappable to correct the estimate. */}
              <Icon
                name="pencil"
                size={13}
                tintColor={colors.faint}
                style={{ marginRight: 10 }}
              />
              <Pressable
                disabled={disabled}
                onPress={() => onRemoveItem(item.id)}
                hitSlop={8}
              >
                <Icon
                  name="xmark.circle.fill"
                  size={16}
                  tintColor={colors.faint}
                />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {entry.status === "complete" ? (
        <Pressable
          disabled={disabled}
          onPress={onAddItem}
          className="mx-3 mb-3 mt-2 flex-row items-center justify-center rounded-xl bg-surface py-2 active:opacity-80"
        >
          <Icon name="plus" size={12} tintColor={colors.muted} />
          <Text className="ml-1.5 font-semibold text-[13px] text-muted">
            Add item
          </Text>
        </Pressable>
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

/** Bottom-sheet to add a new item or correct an existing one's name + calories
 *  + macros. `initial` null → add mode; set → edit mode. */
function ItemModal({
  initial,
  title,
  submitting,
  onClose,
  onSave,
}: {
  initial: FoodItem | null;
  title: string;
  submitting: boolean;
  onSave: (next: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kcal, setKcal] = useState(initial ? String(initial.calories) : "");
  const [p, setP] = useState(initial ? String(Math.round(initial.proteinG)) : "");
  const [c, setC] = useState(initial ? String(Math.round(initial.carbsG)) : "");
  const [f, setF] = useState(initial ? String(Math.round(initial.fatG)) : "");
  const valid = name.trim().length > 0 && Number(kcal) >= 0;

  // Portion quick-fix: scale the AI's estimate from its ORIGINAL values so
  // "I ate double" is one tap instead of editing four fields. Scaling off the
  // initial (not the current) values keeps repeated taps predictable.
  const applyPortion = (factor: number) => {
    if (!initial) return;
    setKcal(String(Math.round(initial.calories * factor)));
    setP(String(Math.round(initial.proteinG * factor)));
    setC(String(Math.round(initial.carbsG * factor)));
    setF(String(Math.round(initial.fatG * factor)));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="rounded-t-3xl border-t border-line bg-bg px-5 pb-9 pt-5">
            <Text className="font-bold text-[18px] text-ink">{title}</Text>
            <Text className="mb-4 mt-[2px] font-regular text-[13px] text-muted">
              {initial
                ? "Estimate off? Correct the numbers — your total updates instantly."
                : "Add anything the scan missed — your total updates instantly."}
            </Text>
            <TextField label="Food" value={name} onChangeText={setName} />
            {initial ? (
              <View className="mb-3 flex-row gap-2">
                {[0.5, 1, 1.5, 2].map((factor) => (
                  <Pressable
                    key={factor}
                    onPress={() => applyPortion(factor)}
                    className="flex-1 items-center rounded-xl border border-line bg-card py-2 active:opacity-80"
                  >
                    <Text className="font-semibold text-[13px] text-ink">
                      {factor === 1 ? "1×" : `${factor}×`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <NumberField
              label="Calories"
              unit="kcal"
              value={kcal}
              onChangeText={(t) => setKcal(t.replace(/[^0-9]/g, ""))}
              maxLength={5}
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
              label={initial ? "Save changes" : "Add item"}
              loading={submitting}
              disabled={!valid}
              onPress={() =>
                onSave({
                  name: name.trim(),
                  calories: Number(kcal),
                  proteinG: Number(p) || 0,
                  carbsG: Number(c) || 0,
                  fatG: Number(f) || 0,
                })
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

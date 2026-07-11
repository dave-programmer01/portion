import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";

import { itemFromMaster, type FoodMasterLite, type LogItem } from "../lib/food";
import { NumberField, PrimaryButton } from "./ui";

/**
 * Bottom-sheet serving picker. Given a per-100g food, the user picks an amount
 * (grams, or multiples of the product's serving) and sees live macros before
 * logging. Returns a fully-computed `LogItem` to the caller.
 */
export function ServingPicker({
  food,
  visible,
  onClose,
  onConfirm,
  submitting,
}: {
  food: FoodMasterLite | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (item: LogItem) => void;
  submitting?: boolean;
}) {
  const servingG = food?.defaultServingG ?? null;
  const [mode, setMode] = useState<"serving" | "grams">(
    servingG ? "serving" : "grams",
  );
  const [amount, setAmount] = useState("1");

  const grams = useMemo(() => {
    const n = Number(amount) || 0;
    return mode === "serving" && servingG ? n * servingG : n;
  }, [amount, mode, servingG]);

  const item = useMemo(
    () => (food ? itemFromMaster(food, grams) : null),
    [food, grams],
  );

  if (!food) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="rounded-t-3xl bg-card px-5 pb-10 pt-4">
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
        <Text className="font-bold text-[19px] text-ink">{food.name}</Text>
        {food.brand ? (
          <Text className="mt-[2px] font-regular text-[13px] text-muted">
            {food.brand}
          </Text>
        ) : null}

        {/* Amount mode */}
        <View className="mt-4 flex-row gap-2">
          {servingG ? (
            <ModeChip
              label={`Serving (${Math.round(servingG)} g)`}
              active={mode === "serving"}
              onPress={() => setMode("serving")}
            />
          ) : null}
          <ModeChip
            label="Grams"
            active={mode === "grams"}
            onPress={() => setMode("grams")}
          />
        </View>

        <View className="mt-4">
          <NumberField
            label={mode === "serving" ? "Servings" : "Amount"}
            unit={mode === "serving" ? "×" : "g"}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
          />
        </View>

        {/* Live macros */}
        {item ? (
          <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3">
            <MacroStat label="kcal" value={item.calories} />
            <MacroStat label="P" value={item.proteinG} suffix="g" />
            <MacroStat label="C" value={item.carbsG} suffix="g" />
            <MacroStat label="F" value={item.fatG} suffix="g" />
          </View>
        ) : null}

        <PrimaryButton
          label="Add to log"
          icon="plus"
          loading={submitting}
          disabled={grams <= 0}
          onPress={() => item && onConfirm(item)}
        />
      </View>
    </Modal>
  );
}

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center rounded-full border px-4 py-2 ${
        active ? "border-green bg-green-surface" : "border-line bg-card"
      }`}
    >
      {active ? (
        <Icon
          name="checkmark"
          size={12}
          tintColor="#16A34A"
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        className={`font-semibold text-[13px] ${active ? "text-green-dark" : "text-muted"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MacroStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <View className="items-center">
      <Text className="font-bold text-[16px] text-ink">
        {value}
        {suffix ?? ""}
      </Text>
      <Text className="mt-[1px] font-regular text-[11px] text-muted">{label}</Text>
    </View>
  );
}

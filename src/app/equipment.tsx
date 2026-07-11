import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/icon";

import { useApi } from "../lib/api";
import { useProfile } from "../lib/profile-context";
import { useThemeColors } from "../lib/theme";
import { PrimaryButton } from "../components/ui";
import {
  EQUIPMENT_OPTIONS,
  normalizeEquipment,
  equipmentLabels,
  type EquipmentItem,
} from "../lib/equipment";

/**
 * Post-onboarding equipment editor. Lets users update what they own (bought
 * dumbbells, moved to a gym, etc.). Saving updates the profile; regenerating the
 * workout plan then uses the new inventory.
 */
export default function EquipmentEditor() {
  const { request } = useApi();
  const { profile, refresh } = useProfile();
  const colors = useThemeColors();
  const [selected, setSelected] = useState<EquipmentItem[]>(() =>
    normalizeEquipment(profile?.equipmentItems),
  );
  const [busy, setBusy] = useState(false);

  function toggle(grants: EquipmentItem[]) {
    const on = grants.every((g) => selected.includes(g));
    setSelected((prev) =>
      on
        ? prev.filter((g) => !grants.includes(g))
        : [...new Set([...prev, ...grants])],
    );
  }

  async function save() {
    setBusy(true);
    try {
      await request("/api/me/equipment", {
        method: "PUT",
        body: JSON.stringify({ equipmentItems: selected }),
      });
      await refresh();
      router.back();
    } catch {
      setBusy(false);
      Alert.alert("Couldn't save", "Please try again.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[22px] text-ink">Your equipment</Text>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Icon name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-5 font-regular text-[15px] leading-[21px] text-muted">
          Pick everything you have. We only program exercises you can actually
          do — no equipment means a bodyweight plan.
        </Text>

        {EQUIPMENT_OPTIONS.map((opt) => {
          const on = opt.grants.every((g) => selected.includes(g));
          return (
            <Pressable
              key={opt.label}
              onPress={() => toggle(opt.grants)}
              className={`mb-3 flex-row items-center rounded-2xl border px-4 py-4 ${
                on ? "border-green bg-green-surface" : "border-line bg-card"
              }`}
            >
              <Icon
                name={opt.icon as never}
                size={20}
                tintColor={on ? "#16A34A" : colors.muted}
              />
              <View className="ml-3 flex-1">
                <Text
                  className={`font-semibold text-[15px] ${
                    on ? "text-green-dark" : "text-ink"
                  }`}
                >
                  {opt.label}
                </Text>
                <Text className="mt-[1px] font-regular text-[12px] text-muted">
                  {opt.sublabel}
                </Text>
              </View>
              {on ? (
                <Icon
                  name="checkmark.circle.fill"
                  size={20}
                  tintColor="#22C55E"
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="border-t border-line px-5 pb-2 pt-4">
        <Text className="mb-3 text-center font-regular text-[13px] text-muted">
          {equipmentLabels(selected)} · regenerate your plan to apply changes
        </Text>
        <PrimaryButton
          label="Save equipment"
          icon="checkmark"
          loading={busy}
          disabled={busy}
          onPress={save}
        />
      </View>
    </SafeAreaView>
  );
}

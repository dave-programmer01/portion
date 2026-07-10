import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi } from "../lib/api";
import { useProfile } from "../lib/profile-context";
import { useThemeColors } from "../lib/theme";
import { kgToLb, lbToKg } from "../lib/nutrition";
import { NumberField, PrimaryButton, Segmented } from "../components/ui";
import type { Goal } from "@/db/schema";

/**
 * Goals editor. Lets the user change their objective, target weight, and weekly
 * workout target after onboarding. Saving re-writes the profile (the server
 * recomputes Mifflin-St Jeor calorie targets) and refreshes the shared profile.
 */
export default function Goals() {
  const { request } = useApi();
  const { profile, refresh } = useProfile();
  const colors = useThemeColors();
  const imperial = profile?.unitPreference === "imperial";
  const wUnit = imperial ? "lb" : "kg";

  const [goal, setGoal] = useState<Goal>(profile?.goal ?? "maintain");
  const [days, setDays] = useState<number>(profile?.trainingDaysPerWeek ?? 3);
  const [stepGoal, setStepGoal] = useState<number>(profile?.stepGoal ?? 10000);
  const [targetW, setTargetW] = useState<string>(() => {
    const kg = profile?.targetWeightKg;
    if (kg == null) return "";
    return String(imperial ? Math.round(kgToLb(kg)) : kg);
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const n = targetW ? Number(targetW) : null;
    const targetWeightKg =
      n != null && Number.isFinite(n) && n > 0
        ? Math.round((imperial ? lbToKg(n) : n) * 10) / 10
        : null;
    try {
      await request("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          goal,
          sex: profile.sex,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          targetWeightKg,
          activityLevel: profile.activityLevel,
          experience: profile.experience,
          equipment: profile.equipment,
          trainingDaysPerWeek: days,
          stepGoal,
          injuries: profile.injuries,
          unitPreference: profile.unitPreference,
          healthAck: profile.healthAck,
          healthFlag: profile.healthFlag,
        }),
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
        <Text className="font-bold text-[22px] text-ink">Your goals</Text>
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-2 font-semibold text-[14px] text-ink">Main goal</Text>
        <View className="mb-6">
          <Segmented<Goal>
            options={[
              { label: "Lose fat", value: "lose" },
              { label: "Maintain", value: "maintain" },
              { label: "Build muscle", value: "gain" },
            ]}
            value={goal}
            onChange={setGoal}
          />
        </View>

        <NumberField
          label="Target weight"
          unit={wUnit}
          value={targetW}
          onChangeText={(t) => setTargetW(t.replace(/[^0-9.]/g, ""))}
          placeholder={imperial ? "150" : "68"}
          maxLength={5}
        />
        <Text className="mb-6 mt-1 font-regular text-[12px] text-muted">
          Optional — leave blank if you're not targeting a specific weight.
        </Text>

        <Text className="mb-2 font-semibold text-[14px] text-ink">
          Workouts per week
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-5 py-4">
          <Pressable
            onPress={() => setDays((d) => Math.max(1, d - 1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
          >
            <SymbolView name="minus" size={16} tintColor={colors.ink} />
          </Pressable>
          <View className="items-center">
            <Text className="font-bold text-[24px] text-ink">{days}</Text>
            <Text className="font-regular text-[12px] text-muted">
              day{days === 1 ? "" : "s"} / week
            </Text>
          </View>
          <Pressable
            onPress={() => setDays((d) => Math.min(7, d + 1))}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
          >
            <SymbolView name="plus" size={16} tintColor={colors.ink} />
          </Pressable>
        </View>

        <Text className="mb-2 mt-6 font-semibold text-[14px] text-ink">
          Daily step goal
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-5 py-4">
          <Pressable
            onPress={() => setStepGoal((s) => Math.max(1000, s - 500))}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
          >
            <SymbolView name="minus" size={16} tintColor={colors.ink} />
          </Pressable>
          <View className="items-center">
            <Text className="font-bold text-[24px] text-ink">
              {stepGoal.toLocaleString()}
            </Text>
            <Text className="font-regular text-[12px] text-muted">
              steps / day
            </Text>
          </View>
          <Pressable
            onPress={() => setStepGoal((s) => Math.min(100000, s + 500))}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
          >
            <SymbolView name="plus" size={16} tintColor={colors.ink} />
          </Pressable>
        </View>

        <Text className="mt-4 font-regular text-[12px] text-muted">
          Changing your goal recalculates your daily calorie and macro targets.
        </Text>
      </ScrollView>

      <View className="border-t border-line px-5 pb-2 pt-4">
        <PrimaryButton
          label="Save goals"
          icon="checkmark"
          loading={busy}
          disabled={busy}
          onPress={save}
        />
      </View>
    </SafeAreaView>
  );
}

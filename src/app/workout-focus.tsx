import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi } from "../lib/api";
import { useProfile } from "../lib/profile-context";
import { useThemeColors } from "../lib/theme";
import { PrimaryButton } from "../components/ui";
import {
  FOCUS_OPTIONS,
  normalizeFocus,
  isFullBody,
  focusLabel,
  type FocusArea,
} from "../lib/workout-focus";

/**
 * Focus picker shown before (re)generating a plan. The user chooses which
 * muscle groups to train — a real choice instead of a fixed split. "Full Body"
 * is exclusive; picking any specific area clears it, and clearing everything
 * falls back to Full Body. The selection is sent to POST /api/workouts/plan,
 * which remembers it on the profile and kicks off generation.
 */
export default function WorkoutFocus() {
  const { request } = useApi();
  const { profile } = useProfile();
  const colors = useThemeColors();
  const [selected, setSelected] = useState<FocusArea[]>(() =>
    normalizeFocus(profile?.focusAreas),
  );
  const [busy, setBusy] = useState(false);

  function toggle(key: FocusArea) {
    if (key === "full_body") {
      setSelected(["full_body"]);
      return;
    }
    setSelected((prev) => {
      const withoutFull = prev.filter((k) => k !== "full_body");
      const next = withoutFull.includes(key)
        ? withoutFull.filter((k) => k !== key)
        : [...withoutFull, key];
      return next.length === 0 ? ["full_body"] : next;
    });
  }

  async function generate() {
    setBusy(true);
    try {
      await request("/api/workouts/plan", {
        method: "POST",
        body: JSON.stringify({ focusAreas: selected }),
      });
      router.back();
    } catch (err) {
      setBusy(false);
      if ((err as { status?: number }).status === 402) {
        router.replace("/paywall");
        return;
      }
      Alert.alert("Couldn't start", "Please try again.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[22px] text-ink">Choose your focus</Text>
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
      >
        <Text className="mb-5 font-regular text-[15px] leading-[21px] text-muted">
          Pick the areas you want to train. Choose{" "}
          <Text className="font-semibold text-ink">Full Body</Text> for a
          balanced plan, or select as many specific areas as you like.
        </Text>

        <View className="flex-row flex-wrap justify-between">
          {FOCUS_OPTIONS.map((opt) => {
            const on = selected.includes(opt.key);
            const fullWidth = opt.key === "full_body";
            return (
              <Pressable
                key={opt.key}
                onPress={() => toggle(opt.key)}
                className={`mb-3 flex-row items-center rounded-2xl border px-4 py-4 ${
                  fullWidth ? "w-full" : "w-[48%]"
                } ${on ? "border-green bg-green-surface" : "border-line bg-card"}`}
              >
                <SymbolView
                  name={opt.icon as never}
                  size={20}
                  tintColor={on ? "#16A34A" : colors.muted}
                />
                <Text
                  className={`ml-3 flex-1 font-semibold text-[15px] ${
                    on ? "text-green-dark" : "text-ink"
                  }`}
                >
                  {opt.label}
                </Text>
                {on ? (
                  <SymbolView
                    name="checkmark.circle.fill"
                    size={20}
                    tintColor="#22C55E"
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="border-t border-line px-5 pb-2 pt-4">
        <Text className="mb-3 text-center font-regular text-[13px] text-muted">
          {isFullBody(selected)
            ? "Balanced full-body plan"
            : `Focusing on ${focusLabel(selected)}`}
        </Text>
        <PrimaryButton
          label="Build my plan"
          icon="sparkles"
          loading={busy}
          disabled={busy}
          onPress={generate}
        />
      </View>
    </SafeAreaView>
  );
}

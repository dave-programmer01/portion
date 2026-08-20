import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/icon";

import { useApi } from "../lib/api";
import { useThemeColors } from "../lib/theme";
import { PrimaryButton } from "../components/ui";
import {
  useNotifPrefs,
  saveReminderPrefs,
  formatTime,
  DAY_SHORT,
} from "../lib/notifications";
import { registerPushToken } from "../lib/push";

/**
 * Workout reminder editor. Pick the days and time; saving schedules repeating
 * on-device local notifications (and requests permission if reminders are on).
 */
export default function Reminders() {
  const { prefs } = useNotifPrefs();
  const { request } = useApi();
  const colors = useThemeColors();

  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  // Suggested time from the user's usual training time (null = not enough data).
  const [suggest, setSuggest] = useState<{ hour: number; minute: number } | null>(
    null,
  );

  useEffect(() => {
    if (prefs && !ready) {
      setEnabled(prefs.reminders.enabled);
      setDays(prefs.reminders.days);
      setHour(prefs.reminders.hour);
      setMinute(prefs.reminders.minute);
      setReady(true);
    }
  }, [prefs, ready]);

  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    request<{ hour: number | null; minute: number }>(
      `/api/me/workout-times?tz=${tz}`,
    )
      .then((r) => {
        if (r.hour !== null) setSuggest({ hour: r.hour, minute: r.minute });
      })
      .catch(() => {});
  }, [request]);

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => a - b),
    );
  }

  async function save() {
    setBusy(true);
    const willEnable = enabled && days.length > 0;
    const res = await saveReminderPrefs({ enabled: willEnable, days, hour, minute });
    // If enabling turned the master switch on, register this device for server
    // push too so dormant win-backs can reach the user.
    if (res.enabled) void registerPushToken(request);
    setBusy(false);
    if (willEnable && !res.enabled) {
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for Portion in your device settings to receive reminders.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[22px] text-ink">Workout reminders</Text>
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
        <View className="mb-6 flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-4">
          <View className="flex-1 pr-3">
            <Text className="font-semibold text-[15px] text-ink">
              Remind me to work out
            </Text>
            <Text className="mt-[2px] font-regular text-[12px] text-muted">
              A gentle nudge on your chosen days.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: "#22C55E", false: colors.line }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Text className="mb-2 font-semibold text-[14px] text-ink">Days</Text>
        <View className="mb-6 flex-row justify-between">
          {DAY_SHORT.map((label, d) => {
            const on = days.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => toggleDay(d)}
                className={`h-11 w-11 items-center justify-center rounded-full border ${
                  on ? "border-green bg-green" : "border-line bg-card"
                }`}
              >
                <Text
                  className={`font-bold text-[15px] ${on ? "text-white" : "text-muted"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 font-semibold text-[14px] text-ink">Time</Text>
        <View className="rounded-2xl border border-line bg-card px-5 py-4">
          <Text className="mb-4 text-center font-bold text-[30px] text-ink">
            {formatTime(hour, minute)}
          </Text>
          <View className="flex-row justify-between">
            <Stepper
              label="Hour"
              onDown={() => setHour((h) => (h + 23) % 24)}
              onUp={() => setHour((h) => (h + 1) % 24)}
              colors={colors}
            />
            <Stepper
              label="Minute"
              onDown={() => setMinute((m) => (m + 55) % 60)}
              onUp={() => setMinute((m) => (m + 5) % 60)}
              colors={colors}
            />
          </View>
        </View>

        {suggest && (suggest.hour !== hour || suggest.minute !== minute) ? (
          <Pressable
            onPress={() => {
              setHour(suggest.hour);
              setMinute(suggest.minute);
            }}
            className="mt-4 flex-row items-center rounded-2xl border border-green-light bg-green-surface px-4 py-3 active:opacity-90"
          >
            <Icon
              name="lightbulb.fill"
              size={16}
              tintColor="#16A34A"
              style={{ marginRight: 10 }}
            />
            <Text className="flex-1 font-regular text-[13px] leading-[18px] text-green-dark">
              You usually train around{" "}
              <Text className="font-bold">
                {formatTime(suggest.hour, suggest.minute)}
              </Text>
            </Text>
            <Text className="font-semibold text-[13px] text-green-dark">Use</Text>
          </Pressable>
        ) : null}

        <Text className="mt-4 font-regular text-[12px] leading-[18px] text-muted">
          Reminders are scheduled on your device — they work offline and are
          never sent to a server.
        </Text>
      </ScrollView>

      <View className="border-t border-line px-5 pb-2 pt-4">
        <PrimaryButton
          label="Save reminders"
          icon="bell.fill"
          loading={busy}
          disabled={busy}
          onPress={save}
        />
      </View>
    </SafeAreaView>
  );
}

function Stepper({
  label,
  onDown,
  onUp,
  colors,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  colors: { ink: string };
}) {
  return (
    <View className="flex-1 flex-row items-center justify-center">
      <Pressable
        onPress={onDown}
        className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
      >
        <Icon name="minus" size={15} tintColor={colors.ink} />
      </Pressable>
      <Text className="mx-3 font-semibold text-[13px] text-muted">{label}</Text>
      <Pressable
        onPress={onUp}
        className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
      >
        <Icon name="plus" size={15} tintColor={colors.ink} />
      </Pressable>
    </View>
  );
}

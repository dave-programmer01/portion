import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/icon";

import { useApi, useFetch, todayLocal } from "../../lib/api";
import { useBilling } from "../../lib/billing-context";
import { kgToLb, lbToKg } from "../../lib/nutrition";
import { BarChart, LineChart } from "../../components/charts";
import { useSteps } from "../../lib/steps";
import { NumberField, PrimaryButton } from "../../components/ui";
import type { WeightLog } from "@/db/schema";

type WeightResponse = {
  logs: WeightLog[];
  currentKg: number | null;
  targetKg: number | null;
  unitPreference: "metric" | "imperial";
};
type HistoryResponse = {
  from: string;
  to: string;
  days: { date: string; calories: number }[];
  target: number | null;
};

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export default function Progress() {
  const { request } = useApi();
  const { isPremium } = useBilling();

  const weight = useFetch(() => request<WeightResponse>("/api/weight"), []);
  const history = useFetch(
    () => request<HistoryResponse>("/api/food/history?days=7"),
    [],
  );

  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const imperial = weight.data?.unitPreference === "imperial";
  const unit = imperial ? "lb" : "kg";
  const toDisplay = (kg: number) => (imperial ? kgToLb(kg) : kg);

  const current = weight.data?.currentKg ?? null;
  const targetKg = weight.data?.targetKg ?? null;
  const delta =
    current !== null && targetKg !== null ? current - targetKg : null;

  // Build the last 7 calorie bars, filling gaps with 0.
  const calMap = new Map(history.data?.days.map((d) => [d.date, d.calories]));
  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { label: WEEKDAY[d.getDay()], value: calMap.get(key) ?? 0 };
  });

  const weights = (weight.data?.logs ?? []).map((l) => toDisplay(l.weightKg));

  // Steps: today's live count + the last 7 days from the pedometer/store.
  const steps = useSteps();
  const stepMap = new Map(steps.days.map((d) => [d.date, d.steps]));
  const todayKey = todayLocal();
  const stepsToday = Math.max(stepMap.get(todayKey) ?? 0, steps.today);
  const stepPct =
    steps.goal > 0 ? Math.min(100, Math.round((stepsToday / steps.goal) * 100)) : 0;
  const stepBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const val = key === todayKey ? stepsToday : (stepMap.get(key) ?? 0);
    return { label: WEEKDAY[d.getDay()], value: val };
  });

  async function refreshAll() {
    await Promise.all([weight.refetch(), history.refetch()]);
  }

  async function logWeight(value: number) {
    setBusy(true);
    try {
      const kg = imperial ? lbToKg(value) : value;
      await request("/api/weight", {
        method: "POST",
        body: JSON.stringify({ loggedDate: todayLocal(), weightKg: kg }),
      });
      setLogOpen(false);
      await refreshAll();
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pt-1">
        <Text className="font-bold text-[26px] text-ink">Progress</Text>
        {isPremium ? (
          <View className="flex-row items-center rounded-full bg-green-surface px-3 py-1">
            <Icon name="crown.fill" size={12} tintColor="#16A34A" />
            <Text className="ml-1 font-semibold text-[12px] text-green-dark">
              Premium
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={weight.loading || history.loading}
            onRefresh={refreshAll}
            tintColor="#22C55E"
          />
        }
      >
        {/* Upgrade banner (free only) */}
        {!isPremium ? (
          <Pressable
            onPress={() => router.push("/paywall")}
            className="mb-5 flex-row items-center rounded-2xl bg-green-dark px-5 py-4 active:opacity-90"
          >
            <Icon name="crown.fill" size={22} tintColor="#FFFFFF" />
            <View className="ml-3 flex-1">
              <Text className="font-bold text-[15px] text-white">
                Go Premium
              </Text>
              <Text className="mt-[1px] font-regular text-[12px] text-green-light">
                Unlimited scans · full history · smarter plans
              </Text>
            </View>
            <Icon name="chevron.right" size={15} tintColor="#FFFFFF" />
          </Pressable>
        ) : null}

        {/* Weight card */}
        <View className="mb-5 rounded-2xl border border-line bg-card p-5">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="font-regular text-[12px] text-muted">
                Current weight
              </Text>
              <Text className="mt-[2px] font-bold text-[28px] text-ink">
                {current !== null ? Math.round(toDisplay(current) * 10) / 10 : "—"}
                <Text className="font-regular text-[15px] text-muted"> {unit}</Text>
              </Text>
              {delta !== null ? (
                <Text className="mt-[2px] font-medium text-[12px] text-muted">
                  {Math.abs(Math.round(toDisplay(Math.abs(delta)) * 10) / 10)} {unit}{" "}
                  {delta > 0 ? "to lose" : delta < 0 ? "to gain" : "— at goal 🎉"}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setLogOpen(true)}
              className="h-9 flex-row items-center rounded-full bg-green px-3"
            >
              <Icon name="plus" size={12} tintColor="#FFFFFF" weight="bold" />
              <Text className="ml-1 font-semibold text-[13px] text-white">
                Log
              </Text>
            </Pressable>
          </View>

          {weights.length >= 2 ? (
            <View className="mt-4">
              <LineChart data={weights} height={140} />
            </View>
          ) : (
            <Text className="mt-4 font-regular text-[13px] text-muted">
              Log your weight a few times to see your trend.
            </Text>
          )}
        </View>

        {/* Steps card */}
        <View className="mb-5 rounded-2xl border border-line bg-card p-5">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="font-regular text-[12px] text-muted">
                Steps today
              </Text>
              <Text className="mt-[2px] font-bold text-[28px] text-ink">
                {stepsToday.toLocaleString()}
                <Text className="font-regular text-[15px] text-muted">
                  {" "}
                  / {steps.goal.toLocaleString()}
                </Text>
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-bold text-[18px] text-green-dark">
                {stepPct}%
              </Text>
              <Text className="font-regular text-[11px] text-muted">of goal</Text>
            </View>
          </View>
          <View className="mt-3 h-[8px] overflow-hidden rounded-full bg-line">
            <View
              className="h-full rounded-full bg-green"
              style={{ width: `${stepPct}%` }}
            />
          </View>
          {steps.available === false ? (
            <Text className="mt-3 font-regular text-[12px] text-muted">
              Step counting isn't available or wasn't allowed on this device.
              You can enable Motion &amp; Fitness access in your device settings.
            </Text>
          ) : (
            <View className="mt-4">
              <BarChart data={stepBars} target={steps.goal} />
            </View>
          )}
        </View>

        {/* Calorie history */}
        <View className="mb-5 rounded-2xl border border-line bg-card p-5">
          <Text className="mb-1 font-bold text-[15px] text-ink">
            Calories · last 7 days
          </Text>
          <Text className="mb-4 font-regular text-[12px] text-muted">
            {history.data?.target
              ? `Target ${history.data.target.toLocaleString()} kcal/day`
              : "vs your daily target"}
          </Text>
          <BarChart data={bars} target={history.data?.target ?? undefined} />
        </View>
      </ScrollView>

      {/* Log-weight modal */}
      <LogWeightModal
        visible={logOpen}
        unit={unit}
        busy={busy}
        onClose={() => setLogOpen(false)}
        onSubmit={logWeight}
      />
    </SafeAreaView>
  );
}

function LogWeightModal({
  visible,
  unit,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  unit: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="rounded-t-3xl bg-card px-5 pb-10 pt-4">
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
        <Text className="mb-4 font-bold text-[19px] text-ink">Log weight</Text>
        <NumberField
          label="Today's weight"
          unit={unit}
          value={value}
          onChangeText={(t) => setValue(t.replace(/[^0-9.]/g, ""))}
          autoFocus
        />
        <PrimaryButton
          label="Save"
          loading={busy}
          disabled={!(Number(value) > 0)}
          onPress={() => onSubmit(Number(value))}
        />
      </View>
    </Modal>
  );
}

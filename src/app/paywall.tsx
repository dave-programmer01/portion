import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useBilling } from "../lib/billing-context";
import { useThemeColors } from "../lib/theme";
import { getOfferings, purchase, restore } from "../lib/purchases";
import { log, captureError } from "../lib/log";
import { track } from "../lib/analytics";
import { PrimaryButton } from "../components/ui";

const BENEFITS: { icon: SymbolViewProps["name"]; text: string }[] = [
  { icon: "camera.fill", text: "Unlimited AI photo scans" },
  { icon: "figure.strengthtraining.traditional", text: "4–6 day plans + regenerate anytime" },
  { icon: "clock.arrow.circlepath", text: "Full history & progress trends" },
  { icon: "bolt.fill", text: "Priority processing" },
];

export default function Paywall() {
  const { status, isPremium, refresh, setDevTier } = useBilling();
  const colors = useThemeColors();
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");
  const [busy, setBusy] = useState(false);

  const prices = status?.prices;
  const rcEnabled = status?.revenueCatEnabled ?? false;

  useEffect(() => {
    track("paywall_viewed");
  }, []);

  async function upgrade() {
    setBusy(true);
    try {
      if (!rcEnabled) {
        // Dev path — no native purchase; flip the tier so gating can be tested.
        await setDevTier("premium");
        track("subscription_started", { plan, dev: true });
        router.back();
        return;
      }
      const offerings = await getOfferings();
      const opt = offerings.find((o) => o.period === plan) ?? offerings[0];
      if (!opt) throw new Error("No subscription available");
      log.info("billing.purchase.attempt", { plan });
      const ok = await purchase(opt);
      await refresh();
      log.info("billing.purchase.result", { plan, entitled: ok });
      if (ok) {
        track("subscription_started", { plan, dev: false });
        router.back();
      }
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "";
      if (!/cancel/i.test(msg)) {
        captureError(err, { plan, where: "paywall.upgrade" });
        Alert.alert("Purchase failed", "Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    setBusy(true);
    try {
      const ok = await restore();
      await refresh();
      if (ok) router.back();
      else Alert.alert("Nothing to restore", "No active subscription found.");
    } catch {
      Alert.alert("Restore failed", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-end px-5 pt-1">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="xmark" size={15} tintColor={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 24, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-green-surface">
            <SymbolView name="crown.fill" size={30} tintColor="#22C55E" />
          </View>
          <Text className="mt-4 text-center font-bold text-[26px] text-ink">
            Portion Premium
          </Text>
          <Text className="mt-2 text-center font-regular text-[15px] leading-[22px] text-muted">
            Unlock unlimited scans, smarter plans, and your full progress history.
          </Text>
        </View>

        {isPremium ? (
          <View className="mt-8 items-center rounded-2xl border border-green bg-green-surface p-6">
            <SymbolView name="checkmark.seal.fill" size={34} tintColor="#22C55E" />
            <Text className="mt-3 font-bold text-[17px] text-green-dark">
              You're Premium
            </Text>
            <Text className="mt-1 text-center font-regular text-[13px] text-muted">
              Thanks for supporting Portion. Manage your subscription in the App
              Store.
            </Text>
          </View>
        ) : (
          <>
            <View className="mt-8 gap-3">
              {BENEFITS.map((b) => (
                <View key={b.text} className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-surface">
                    <SymbolView name={b.icon} size={17} tintColor="#16A34A" />
                  </View>
                  <Text className="flex-1 font-medium text-[15px] text-ink">
                    {b.text}
                  </Text>
                </View>
              ))}
            </View>

            <View className="mt-8 gap-3">
              <PlanCard
                title="Annual"
                price={prices ? `$${prices.annualUsd.toFixed(2)} / year` : "—"}
                badge={
                  prices?.annualTrialDays
                    ? `${prices.annualTrialDays}-day free trial`
                    : undefined
                }
                selected={plan === "annual"}
                onPress={() => setPlan("annual")}
              />
              <PlanCard
                title="Monthly"
                price={prices ? `$${prices.monthlyUsd.toFixed(2)} / month` : "—"}
                selected={plan === "monthly"}
                onPress={() => setPlan("monthly")}
              />
            </View>

            <View className="mt-8">
              <PrimaryButton
                label={
                  plan === "annual" && prices?.annualTrialDays
                    ? "Start free trial"
                    : "Upgrade to Premium"
                }
                icon="crown.fill"
                loading={busy}
                onPress={upgrade}
              />
            </View>

            {rcEnabled ? (
              <Pressable onPress={onRestore} className="mt-4 py-2">
                <Text className="text-center font-semibold text-[14px] text-muted">
                  Restore purchases
                </Text>
              </Pressable>
            ) : (
              <Text className="mt-4 text-center font-regular text-[12px] text-muted">
                Dev mode: purchases aren't wired yet — this grants Premium locally
                for testing.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  title,
  price,
  badge,
  selected,
  onPress,
}: {
  title: string;
  price: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center rounded-2xl border px-4 py-4 ${
        selected ? "border-green bg-green-surface" : "border-line bg-card"
      }`}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-bold text-[16px] text-ink">{title}</Text>
          {badge ? (
            <View className="rounded-full bg-green px-2 py-[2px]">
              <Text className="font-semibold text-[11px] text-white">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-[2px] font-regular text-[13px] text-muted">
          {price}
        </Text>
      </View>
      <SymbolView
        name={selected ? "checkmark.circle.fill" : "circle"}
        size={22}
        tintColor={selected ? "#22C55E" : "#CBD5E1"}
      />
    </Pressable>
  );
}

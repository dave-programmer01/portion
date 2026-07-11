import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/icon";

import { PrimaryButton, SecondaryButton } from "../components/ui";
import { track } from "../lib/analytics";

/**
 * Post-onboarding payoff screen. The first 3 days decide whether a user stays,
 * and value has to land in the first ~90 seconds — so instead of dropping the
 * user on an empty dashboard we show their personalized target (the reward for
 * finishing onboarding) and route them straight into their first log.
 */
export default function Welcome() {
  const { kcal, goal } = useLocalSearchParams<{ kcal?: string; goal?: string }>();
  const target = Number(kcal) || null;
  const goalLine =
    goal === "lose"
      ? "lose weight"
      : goal === "gain"
        ? "build muscle"
        : "stay on track";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-green-surface">
          <Icon name="checkmark" size={30} tintColor="#16A34A" />
        </View>
        <Text className="mt-5 text-center font-bold text-[24px] text-ink">
          You're all set 🎉
        </Text>
        <Text className="mt-2 text-center font-regular text-[15px] text-muted">
          Your personalized plan is ready to help you {goalLine}.
        </Text>

        {target ? (
          <View className="mt-8 w-full items-center rounded-3xl border border-green-light bg-green-surface py-7">
            <Text className="font-regular text-[13px] text-green-dark">
              Your daily target
            </Text>
            <Text className="mt-1 font-bold text-[40px] leading-[44px] text-ink">
              {target.toLocaleString()}
            </Text>
            <Text className="font-regular text-[13px] text-muted">
              calories / day
            </Text>
          </View>
        ) : null}

        <Text className="mt-8 text-center font-regular text-[14px] text-muted">
          Log your first meal — it takes about 20 seconds.
        </Text>
      </View>

      <View className="gap-3 px-6 pb-3">
        <PrimaryButton
          label="Log my first meal"
          onPress={() => {
            track("first_win", { action: "log" });
            router.replace({ pathname: "/home", params: { log: "1" } });
          }}
        />
        <SecondaryButton
          label="Take me to my dashboard"
          onPress={() => router.replace("/home")}
        />
      </View>
    </SafeAreaView>
  );
}

import { Pressable, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";

import { useApi, useFetch } from "../lib/api";
import { PrimaryButton } from "../components/ui";
import { track } from "../lib/analytics";
import { useThemeColors } from "../lib/theme";
import { goBack } from "../lib/nav";

/**
 * Invite screen — the referral loop's share surface. Shows the user's code +
 * how many friends have joined, and hands a pre-written message to the OS share
 * sheet. Both sides get comp Premium when a new user redeems (see server/referrals).
 */
export default function Invite() {
  const { request } = useApi();
  const colors = useThemeColors();
  const { data } = useFetch(
    () =>
      request<{ code: string; url: string; invited: number; rewardDays: number }>(
        "/api/referrals/me",
      ),
    [],
  );

  async function share() {
    if (!data) return;
    const message =
      `Join me on Portion — snap a photo of your meal and it logs the calories for you. ` +
      `Use my code ${data.code} and we both get ${data.rewardDays} days of Premium, free.\n${data.url}`;
    try {
      await Share.share({ message });
      track("referral_shared");
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center px-5 pt-1">
        <Pressable
          onPress={() => goBack("/home")}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <Icon name="chevron.left" size={16} tintColor={colors.ink} />
        </Pressable>
        <Text className="ml-2 font-bold text-[26px] text-ink">Invite friends</Text>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-green-surface">
          <Icon name="gift.fill" size={30} tintColor="#16A34A" />
        </View>
        <Text className="mt-5 text-center font-bold text-[22px] text-ink">
          You both get {data?.rewardDays ?? 7} days of Premium
        </Text>
        <Text className="mt-2 text-center font-regular text-[15px] text-muted">
          Share your code. When a friend joins with it, you each unlock a free
          week of Premium.
        </Text>

        <View className="mt-8 w-full items-center rounded-3xl border border-green-light bg-green-surface py-6">
          <Text className="font-regular text-[13px] text-green-dark">
            Your invite code
          </Text>
          <Text className="mt-1 font-bold text-[34px] tracking-[3px] text-ink">
            {data?.code ?? "•••••••"}
          </Text>
        </View>

        {data?.invited ? (
          <Text className="mt-5 text-center font-medium text-[14px] text-muted">
            {data.invited} friend{data.invited === 1 ? "" : "s"} joined with your
            code 🎉
          </Text>
        ) : null}
      </View>

      <View className="px-6 pb-3">
        <PrimaryButton
          label="Share my invite"
          onPress={share}
          disabled={!data}
        />
      </View>
    </SafeAreaView>
  );
}

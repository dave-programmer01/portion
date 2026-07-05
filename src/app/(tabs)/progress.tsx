import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useAuth } from "@clerk/expo";

import { useThemeColors } from "../../lib/theme";

export default function Progress() {
  const { signOut } = useAuth();
  const colors = useThemeColors();

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="px-5 pt-1">
        <Text className="font-bold text-[26px] text-ink">Progress</Text>
      </View>
      <View className="flex-1 items-center justify-center px-10">
        <SymbolView name="chart.bar.fill" size={40} tintColor={colors.faint} />
        <Text className="mt-4 text-center font-regular text-[15px] text-muted">
          Your weight & macro trends will live here.
        </Text>
      </View>

      <View className="px-5 pb-8">
        <Pressable
          onPress={() => signOut()}
          className="h-12 flex-row items-center justify-center rounded-[14px] border border-line bg-card active:opacity-90"
        >
          <Text className="font-semibold text-[15px] text-muted">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

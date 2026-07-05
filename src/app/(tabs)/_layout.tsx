import { View, Pressable, useColorScheme } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Redirect, ThemeProvider, DefaultTheme, DarkTheme, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useProfile } from "../../lib/profile-context";
import { useThemeColors } from "../../lib/theme";

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { loading: profileLoading, onboarded, sessionValid } = useProfile();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = useThemeColors();

  // Session still restoring from the secure token cache.
  if (!isLoaded) return null;
  // Not signed in, or the backend invalidated the session → auth landing.
  if (!isSignedIn || !sessionValid) return <Redirect href="/" />;
  // Signed in but hasn't finished onboarding → send them to the gate.
  if (!profileLoading && !onboarded) return <Redirect href="/onboarding" />;

  return (
    // ThemeProvider keeps the iOS 26 native tab bar in sync with the color
    // scheme (otherwise it renders a dark material over the light UI).
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
      <NativeTabs
        tintColor="#22C55E"
        backgroundColor={colors.card}
        iconColor={colors.faint}
        labelStyle={{ color: colors.muted }}
      >
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
          />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="food">
          <NativeTabs.Trigger.Icon sf="fork.knife" />
          <NativeTabs.Trigger.Label>Food</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="workout">
          <NativeTabs.Trigger.Icon
            sf={{ default: "dumbbell", selected: "dumbbell.fill" }}
          />
          <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="progress">
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
          />
          <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Center "+" FAB — floats above the native tab bar. Wired to the
          photo/quick-log flow later. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          // Center the FAB vertically on the native tab bar (icon row) so it
          // reads as the middle item rather than floating above the bar.
          bottom: Math.max(insets.bottom - 4, 6),
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => router.push("/log")}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#22C55E",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#16A34A",
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          }}
        >
          <SymbolView name="plus" size={24} tintColor="#FFFFFF" weight="bold" />
        </Pressable>
      </View>
      </View>
    </ThemeProvider>
  );
}

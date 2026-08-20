import { Platform, View, Pressable, useColorScheme } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Redirect, ThemeProvider, DefaultTheme, DarkTheme, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Icon } from "@/components/icon";
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
        // Android (Material) only: icons-only so the selected tab's (wide) label
        // no longer collides with the center FAB, and a subtle branded-green
        // active pill instead of the default grey. iOS ignores these and keeps
        // its native labels + tint.
        labelVisibilityMode="unlabeled"
        indicatorColor="rgba(34,197,94,0.16)"
      >
        <NativeTabs.Trigger name="home">
          <NativeTabs.Trigger.Icon
            {...(Platform.OS === "ios"
              ? { sf: { default: "house", selected: "house.fill" } }
              : { src: require("../../../assets/images/tab-home.png") })}
          />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="food">
          <NativeTabs.Trigger.Icon
            {...(Platform.OS === "ios"
              ? { sf: "fork.knife" }
              : { src: require("../../../assets/images/tab-food.png") })}
          />
          <NativeTabs.Trigger.Label>Food</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="workout">
          <NativeTabs.Trigger.Icon
            {...(Platform.OS === "ios"
              ? { sf: { default: "dumbbell", selected: "dumbbell.fill" } }
              : { src: require("../../../assets/images/tab-workout.png") })}
          />
          <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="progress">
          <NativeTabs.Trigger.Icon
            {...(Platform.OS === "ios"
              ? { sf: { default: "chart.bar", selected: "chart.bar.fill" } }
              : { src: require("../../../assets/images/tab-progress.png") })}
          />
          <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Center "+" FAB — floats above the native tab bar and opens the
          quick-log chooser. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          // Center the FAB vertically on the native tab bar's icon row so it
          // reads as the middle item rather than floating above the bar. The two
          // platforms need different offsets: iOS's tab bar hugs the safe-area
          // inset, while Android's Material bar is taller and sits above the
          // gesture inset, so the iOS value floated the FAB too low there.
          bottom:
            Platform.OS === "android"
              ? insets.bottom + 14
              : Math.max(insets.bottom - 4, 6),
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
          <Icon name="plus" size={24} tintColor="#FFFFFF" weight="bold" />
        </Pressable>
      </View>
      </View>
    </ThemeProvider>
  );
}

import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";

import { config } from "../config";
import { useSocialAuth } from "../hooks/use-social-auth";
import { useProfile } from "../lib/profile-context";
import { useThemeColors } from "../lib/theme";
import heroImage from "../assets/images/hero.png";
import leafImage from "../assets/images/leaf.png";
import googleBadge from "../assets/images/google-badge.png";

export default function AuthLanding() {
  const { isLoaded, isSignedIn } = useAuth();
  const { authenticate, pending } = useSocialAuth();
  const { loading: profileLoading, onboarded, sessionValid } = useProfile();
  const colors = useThemeColors();

  // Session is still restoring from the secure token cache.
  if (!isLoaded) return null;
  // Signed in AND the backend confirmed the session → route by onboarding
  // status. If the backend rejected it (401, e.g. deleted user), fall through
  // to the auth landing instead of sending a profile-less user to onboarding.
  if (isSignedIn && sessionValid) {
    if (profileLoading) return null;
    return <Redirect href={onboarded ? "/home" : "/onboarding"} />;
  }

  const busy = pending !== null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-1 px-7 pb-8">
        {/* Logo */}
        <View className="mt-10 flex-row items-center justify-center">
          <Image
            source={leafImage}
            style={{ width: 34, height: 34 }}
            contentFit="contain"
          />
          <Text className="ml-2 font-bold text-[28px] leading-[34px] text-green">
            Portion
          </Text>
        </View>

        {/* Heading */}
        <Text className="mt-6 text-center font-bold text-[26px] leading-8 text-ink">
          AI calorie tracker{"\n"}& workout planner
        </Text>

        {/* Subtitle */}
        <Text className="mt-3 text-center font-regular text-[15px] leading-[22px] text-muted">
          We tell you what to eat and{"\n"}what to train every day.
        </Text>

        {/* Feature bullets */}
        <View className="mt-5 gap-[10px]">
          {[
            "No guesswork",
            "Beginner friendly",
            "AI that helps",
            "Built for real life",
          ].map((feat) => (
            <View key={feat} className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded-full bg-green">
                <SymbolView name="checkmark" size={11} tintColor="#FFFFFF" weight="bold" />
              </View>
              <Text className="font-medium text-[14px] text-ink">{feat}</Text>
            </View>
          ))}
        </View>

        {/* Hero illustration — sits just below the feature list */}
        <View className="mt-4 items-center">
          <Image
            source={heroImage}
            style={{ width: "100%", aspectRatio: 744 / 530 }}
            contentFit="contain"
          />
        </View>

        {/* Flexible gap pushes the buttons toward the bottom */}
        <View className="flex-1" />

        {/* Buttons toward the bottom */}
        <View>
          {/* Continue with Google */}
          <Pressable
            disabled={busy}
            onPress={() => authenticate("oauth_google")}
            className="h-14 flex-row items-center justify-center rounded-[14px] bg-green active:opacity-90"
            style={{
              shadowColor: "#16A34A",
              shadowOpacity: 0.28,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
              opacity: busy && pending !== "oauth_google" ? 0.6 : 1,
            }}
          >
            {pending === "oauth_google" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Image
                  source={googleBadge}
                  style={{ width: 26, height: 26, borderRadius: 13 }}
                  contentFit="contain"
                />
                <Text className="ml-3 font-semibold text-[16px] text-white">
                  Continue with Google
                </Text>
              </>
            )}
          </Pressable>

          {/* Continue with Apple */}
          <Pressable
            disabled={busy}
            onPress={() => authenticate("oauth_apple")}
            className="mt-3 h-14 flex-row items-center justify-center rounded-[14px] border border-line bg-card active:opacity-90"
            style={{ opacity: busy && pending !== "oauth_apple" ? 0.6 : 1 }}
          >
            {pending === "oauth_apple" ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <SymbolView name="apple.logo" size={20} tintColor={colors.ink} />
                <Text className="ml-3 font-semibold text-[16px] text-ink">
                  Continue with Apple
                </Text>
              </>
            )}
          </Pressable>

          {/* Terms & privacy */}
          <Text className="mt-5 px-4 text-center font-regular text-[13px] leading-[19px] text-muted">
            By continuing you agree to our{" "}
            <Text
              className="font-medium text-green"
              onPress={() => void Linking.openURL(`${config.legalBaseUrl}/terms`)}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              className="font-medium text-green"
              onPress={() =>
                void Linking.openURL(`${config.legalBaseUrl}/privacy`)
              }
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

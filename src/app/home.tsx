import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";

export default function Home() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  // Session still restoring from the secure token cache.
  if (!isLoaded) return null;
  // Not signed in → back to the auth landing screen.
  if (!isSignedIn) return <Redirect href="/" />;

  const name =
    user?.firstName ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "there";

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-7">
        <Text className="font-bold text-[28px] leading-[34px] text-ink">
          Welcome, {name} 👋
        </Text>
        <Text className="mt-3 text-center font-regular text-[15px] leading-[22px] text-muted">
          You're signed in with{" "}
          {user?.primaryEmailAddress?.emailAddress ?? "your account"}.
        </Text>
      </View>

      <View className="px-7 pb-8">
        <Pressable
          onPress={() => signOut()}
          className="h-14 flex-row items-center justify-center rounded-[14px] bg-green active:opacity-90"
          style={{
            shadowColor: "#16A34A",
            shadowOpacity: 0.28,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}
        >
          <Text className="font-semibold text-[16px] text-white">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

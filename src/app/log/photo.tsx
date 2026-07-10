import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import {
  resizeForUpload,
  uploadToImageKit,
  type ImageKitAuthResponse,
} from "../../lib/upload";
import { PrimaryButton } from "../../components/ui";
import { useThemeColors } from "../../lib/theme";
import { track } from "../../lib/analytics";
import type { MealType } from "@/db/schema";

/**
 * Camera capture for the optimistic photo flow. On shutter we resize + upload
 * the image, create a `pending` entry, and immediately dismiss — the entry
 * shows as "analyzing…" on the dashboard while the Inngest job fills it in.
 */
export default function PhotoCapture() {
  const { meal } = useLocalSearchParams<{ meal?: MealType }>();
  const { request } = useApi();
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function capture() {
    if (!cameraRef.current || busy) return;
    try {
      setBusy("Capturing…");
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error("No photo captured");

      setBusy("Preparing…");
      const resized = await resizeForUpload(photo.uri);

      setBusy("Uploading…");
      const auth = await request<ImageKitAuthResponse>("/api/imagekit/auth");
      const { url: imageUrl, fileId: imageFileId } = await uploadToImageKit(
        auth,
        resized,
      );

      setBusy("Saving…");
      await request("/api/food/entries", {
        method: "POST",
        body: JSON.stringify({
          loggedDate: todayLocal(),
          mealType: meal ?? "lunch",
          source: "photo",
          imageUrl,
          imageFileId,
        }),
      });

      track("food_logged", { source: "photo" });
      router.dismissAll();
    } catch (err) {
      setBusy(null);
      const e = err as { status?: number; message?: string };
      // Hit the free scan cap / spend ceiling → send to the paywall.
      if (e.status === 402) {
        router.replace("/paywall");
        return;
      }
      const msg = e.message ?? "";
      Alert.alert(
        "Couldn't analyze photo",
        msg.includes("not configured")
          ? "Photo logging isn't set up yet. Try search or manual entry."
          : "Something went wrong. You can retry or log manually.",
        [
          { text: "Log manually", onPress: () => router.replace("/log/search") },
          { text: "OK" },
        ],
      );
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
        <Header />
        <View className="flex-1 items-center justify-center px-10">
          <SymbolView name="camera.fill" size={40} tintColor={colors.faint} />
          <Text className="mt-4 text-center font-semibold text-[16px] text-ink">
            Camera access needed
          </Text>
          <Text className="mt-1 text-center font-regular text-[14px] text-muted">
            Allow the camera to snap your meals and get instant estimates.
          </Text>
          <View className="mt-6 w-full">
            <PrimaryButton label="Allow camera" onPress={requestPermission} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* Close */}
      <SafeAreaView className="absolute left-0 right-0 top-0" edges={["top"]}>
        <View className="flex-row justify-between px-5 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40"
          >
            <SymbolView name="xmark" size={17} tintColor="#FFFFFF" />
          </Pressable>
          <View className="rounded-full bg-black/40 px-4 py-2">
            <Text className="font-medium text-[13px] text-white">
              Fit the whole plate in frame
            </Text>
          </View>
          <View className="w-10" />
        </View>
      </SafeAreaView>

      {/* Shutter / progress */}
      <SafeAreaView className="absolute bottom-0 left-0 right-0" edges={["bottom"]}>
        <View className="items-center pb-6">
          {busy ? (
            <View className="items-center">
              <ActivityIndicator color="#FFFFFF" />
              <Text className="mt-2 font-medium text-[14px] text-white">
                {busy}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={capture}
              className="h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white/40"
            >
              <View className="h-[58px] w-[58px] rounded-full bg-white" />
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function Header() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between px-5 pt-1">
      <Text className="font-bold text-[20px] text-ink">Photo</Text>
      <Pressable
        onPress={() => router.back()}
        className="h-9 w-9 items-center justify-center rounded-full bg-surface"
      >
        <SymbolView name="xmark" size={15} tintColor={colors.ink} />
      </Pressable>
    </View>
  );
}

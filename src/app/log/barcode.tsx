import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useApi, todayLocal } from "../../lib/api";
import { useThemeColors } from "../../lib/theme";
import { PrimaryButton } from "../../components/ui";
import { ServingPicker } from "../../components/serving-picker";
import type { FoodMasterLite, LogItem } from "../../lib/food";
import type { MealType } from "@/db/schema";

/**
 * Barcode scanner → Open Food Facts lookup → serving picker → log. Scanning is
 * locked after a hit so we don't fire the same code repeatedly; it unlocks when
 * the picker closes (e.g. a wrong scan) so the user can try again.
 */
export default function BarcodeScan() {
  const { meal } = useLocalSearchParams<{ meal?: MealType }>();
  const { request } = useApi();
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [food, setFood] = useState<FoodMasterLite | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const locked = useRef(false);

  async function onScan(result: BarcodeScanningResult) {
    if (locked.current) return;
    locked.current = true;
    try {
      const res = await request<{ food: FoodMasterLite | null }>(
        `/api/food/barcode?code=${encodeURIComponent(result.data)}`,
      ).catch(() => ({ food: null }));

      if (res.food) {
        setFood(res.food);
      } else {
        Alert.alert(
          "Not found",
          "We couldn't find that barcode. Try search or manual entry.",
          [
            { text: "Search instead", onPress: () => router.replace("/log/search") },
            { text: "Scan again", onPress: () => (locked.current = false) },
          ],
        );
      }
    } catch {
      locked.current = false;
    }
  }

  async function confirm(item: LogItem) {
    setSubmitting(true);
    try {
      await request("/api/food/entries", {
        method: "POST",
        body: JSON.stringify({
          loggedDate: todayLocal(),
          mealType: meal ?? "snack",
          source: "barcode",
          items: [item],
        }),
      });
      router.dismissAll();
    } catch {
      Alert.alert("Couldn't log", "Please try again.");
      setSubmitting(false);
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between px-5 pt-1">
          <Text className="font-bold text-[20px] text-ink">Scan</Text>
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface"
          >
            <SymbolView name="xmark" size={15} tintColor={colors.ink} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-10">
          <SymbolView name="barcode.viewfinder" size={40} tintColor={colors.faint} />
          <Text className="mt-4 text-center font-semibold text-[16px] text-ink">
            Camera access needed
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
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
        }}
        onBarcodeScanned={food ? undefined : onScan}
      />

      <SafeAreaView className="absolute left-0 right-0 top-0" edges={["top"]}>
        <View className="flex-row justify-between px-5 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40"
          >
            <SymbolView name="xmark" size={17} tintColor="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Aiming guide */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View className="h-32 w-72 rounded-2xl border-2 border-white/70" />
        <Text className="mt-4 font-medium text-[14px] text-white">
          Point at a barcode
        </Text>
      </View>

      <ServingPicker
        food={food}
        visible={food !== null}
        submitting={submitting}
        onClose={() => {
          setFood(null);
          locked.current = false;
        }}
        onConfirm={confirm}
      />
    </View>
  );
}

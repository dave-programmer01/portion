import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useCallback } from "react";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { router, useFocusEffect } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { config } from "../config";
import { useApi } from "../lib/api";
import { useProfile } from "../lib/profile-context";
import { useAnalyticsConsent } from "../lib/analytics";
import {
  useNotifPrefs,
  setMasterEnabled,
  loadNotifPrefs,
  reminderSummary,
} from "../lib/notifications";
import type { UnitPreference } from "@/db/schema";
import { useThemePref } from "../lib/theme-preference";
import { useThemeColors } from "../lib/theme";
import { goBack } from "../lib/nav";

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { profile, refresh } = useProfile();
  const { request } = useApi();
  const { isDark, setDark } = useThemePref();
  const { granted: analyticsOn, setConsent } = useAnalyticsConsent();
  const { prefs: notifPrefs, setPrefs: setNotifPrefs } = useNotifPrefs();

  // Refresh reminder summary when returning from the reminders editor.
  useFocusEffect(
    useCallback(() => {
      loadNotifPrefs().then(setNotifPrefs);
    }, [setNotifPrefs]),
  );

  async function toggleNotifications(on: boolean) {
    const next = await setMasterEnabled(on);
    setNotifPrefs(next);
    if (on && !next.enabled) {
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for Portion in your device settings.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
    }
  }
  const colors = useThemeColors();

  const name = user?.fullName ?? user?.firstName ?? "Your profile";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const unit =
    profile?.unitPreference === "imperial"
      ? "Imperial (lb, ft)"
      : "Metric (kg, cm)";
  const version = Constants.expoConfig?.version ?? "1.0.0";


  /**
   * Switch display units. Canonical storage stays metric; `unitPreference` only
   * changes how heights/weights are shown, so we resubmit the profile (which
   * harmlessly recomputes the same targets) and refresh the shared context.
   */
  async function setUnit(pref: UnitPreference) {
    if (!profile || pref === profile.unitPreference) return;
    try {
      await request("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          goal: profile.goal,
          sex: profile.sex,
          age: profile.age,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          targetWeightKg: profile.targetWeightKg,
          activityLevel: profile.activityLevel,
          experience: profile.experience,
          equipment: profile.equipment,
          trainingDaysPerWeek: profile.trainingDaysPerWeek,
          injuries: profile.injuries,
          unitPreference: pref,
          healthAck: profile.healthAck,
          healthFlag: profile.healthFlag,
        }),
      });
      await refresh();
    } catch {
      Alert.alert("Couldn't update units", "Please try again.");
    }
  }

  const chooseUnits = () =>
    Alert.alert("Units", "How should heights and weights be shown?", [
      { text: "Metric (kg, cm)", onPress: () => setUnit("metric") },
      { text: "Imperial (lb, ft)", onPress: () => setUnit("imperial") },
      { text: "Cancel", style: "cancel" },
    ]);

  // Opens the mail app to our support address. Falls back to showing the address
  // when no mail client is set up (e.g. the iOS Simulator), so it always works.
  async function contactSupport() {
    const email = "opabunmidavid@gmail.com";
    const url = `mailto:${email}?subject=${encodeURIComponent("Portion support")}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      Linking.openURL(url).catch(() => {});
      return;
    }
    Alert.alert("Contact us", `Email us at ${email} and we'll get back to you.`, [
      { text: "OK" },
    ]);
  }

  // Portion's UI is English-only for now, but we surface the device language so
  // the row is honest. Tapping points the user to their device settings, which
  // is where the app language actually comes from.
  const language = deviceLanguageLabel();
  const showLanguageInfo = () =>
    Alert.alert(
      "App language",
      `Portion follows your device language (currently ${language}). You can change it in your device settings.`,
      [
        { text: "Close", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );

  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "This permanently erases your profile, logs, and plans. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await request("/api/account", { method: "DELETE" });
            } catch {
              // Session likely already invalid — sign out regardless.
            }
            await signOut();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View className="flex-row items-center px-5 pt-1">
        <Pressable
          onPress={() => goBack("/home")}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <SymbolView name="chevron.left" size={16} tintColor={colors.ink} />
        </Pressable>
        <Text className="ml-2 font-bold text-[26px] text-ink">Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <Pressable
          onPress={() => router.push("/profile")}
          className="mb-6 flex-row items-center rounded-2xl border border-line bg-card p-4 active:opacity-90"
        >
          <Avatar uri={user?.imageUrl} size={56} />
          <View className="ml-4 flex-1">
            <Text className="font-bold text-[17px] text-ink">{name}</Text>
            {email ? (
              <Text className="mt-[1px] font-regular text-[13px] text-muted">
                {email}
              </Text>
            ) : null}
            <View className="mt-2 flex-row">
              <View className="flex-row items-center rounded-full bg-green-surface px-2 py-[3px]">
                <SymbolView name="star.fill" size={11} tintColor="#16A34A" />
                <Text className="ml-1 font-semibold text-[12px] text-green-dark">
                  Consistent Achiever
                </Text>
              </View>
            </View>
          </View>
          <SymbolView name="chevron.right" size={16} tintColor={colors.faint} />
        </Pressable>

        <Section label="Account">
          <Row icon="person" label="Personal Information" onPress={() => router.push("/profile")} />
          <Row icon="target" label="Goals" onPress={() => router.push("/goals")} />
          <Row icon="trash" label="Delete Account" danger onPress={confirmDelete} last />
        </Section>

        <Section label="Preferences">
          <Row
            icon="bell"
            label="Notifications"
            right={
              <Switch
                value={notifPrefs?.enabled ?? false}
                onValueChange={toggleNotifications}
                trackColor={{ true: "#22C55E", false: colors.line }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row
            icon="moon"
            label="Dark Mode"
            right={
              <Switch
                value={isDark}
                onValueChange={setDark}
                trackColor={{ true: "#22C55E", false: colors.line }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row icon="globe" label="Language" value={language} onPress={showLanguageInfo} />
          <Row icon="ruler" label="Units" value={unit} onPress={chooseUnits} />
          <Row
            icon="chart.bar"
            label="Share usage data"
            right={
              <Switch
                value={!!analyticsOn}
                onValueChange={setConsent}
                trackColor={{ true: "#22C55E", false: colors.line }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row
            icon="clock"
            label="Workout Reminders"
            value={notifPrefs ? reminderSummary(notifPrefs) : "Off"}
            onPress={() => router.push("/reminders")}
            last
          />
        </Section>

        <Section label="Support">
          <Row
            icon="questionmark.circle"
            label="Help Center"
            onPress={() => Linking.openURL(`${config.legalBaseUrl}/help`)}
          />
          <Row
            icon="message"
            label="Contact Us"
            onPress={contactSupport}
          />
          <Row
            icon="doc.text"
            label="Terms of Service"
            onPress={() => Linking.openURL(`${config.legalBaseUrl}/terms`)}
          />
          <Row
            icon="checkmark.shield"
            label="Privacy Policy"
            onPress={() => Linking.openURL(`${config.legalBaseUrl}/privacy`)}
          />
          <Row icon="info.circle" label="About" value={version} last />
        </Section>

        <Pressable
          onPress={() => signOut()}
          className="mt-2 h-14 flex-row items-center justify-center rounded-2xl border border-line bg-card active:opacity-90"
        >
          <SymbolView
            name="rectangle.portrait.and.arrow.right"
            size={17}
            tintColor="#16A34A"
          />
          <Text className="ml-2 font-semibold text-[15px] text-green-dark">
            Log Out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The device's current language as a human label (e.g. "English"), via
 * expo-localization. Falls back to the language code if `Intl.DisplayNames`
 * isn't available on this engine, and to "English" if there's no locale at all.
 */
function deviceLanguageLabel(): string {
  const locale = Localization.getLocales()[0];
  const code = locale?.languageCode ?? "en";
  const tag = locale?.languageTag ?? "en-US";
  try {
    const name = new Intl.DisplayNames([tag], { type: "language" }).of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Intl.DisplayNames unsupported on this engine — fall through.
  }
  return code.toUpperCase();
}

export function Avatar({ uri, size }: { uri?: string; size: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="overflow-hidden bg-green-light"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <SymbolView name="person.fill" size={size * 0.5} tintColor="#16A34A" />
        </View>
      )}
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="mb-2 ml-1 font-semibold text-[12px] uppercase tracking-wide text-muted">
        {label}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-line bg-card">
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  right,
  onPress,
  danger,
  last,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const colors = useThemeColors();
  // Rows with an interactive control (e.g. the Dark Mode Switch) render as a
  // plain View so the control — not the row — handles the touch.
  const Container = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      className={`flex-row items-center px-4 py-[14px] ${onPress ? "active:opacity-70" : ""} ${
        last ? "" : "border-b border-line"
      }`}
    >
      <SymbolView name={icon} size={19} tintColor={danger ? "#EF4444" : "#16A34A"} />
      <Text
        className={`ml-3 flex-1 font-medium text-[15px] ${danger ? "text-red-500" : "text-ink"}`}
      >
        {label}
      </Text>
      {value ? (
        <Text className="mr-2 font-regular text-[14px] text-muted">{value}</Text>
      ) : null}
      {right ?? (onPress ? (
        <SymbolView name="chevron.right" size={15} tintColor={colors.faint} />
      ) : null)}
    </Container>
  );
}

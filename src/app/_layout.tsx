import { useEffect } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import {
  Stack,
  useNavigationContainerRef,
  usePathname,
  router,
} from "expo-router";
import { isRunningInExpoGo } from "expo";
import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ProfileProvider, useProfile } from "../lib/profile-context";
import {
  identifyUser,
  resetAnalytics,
  loadAnalyticsConsent,
  setAnalyticsConsent,
  analyticsConsentAsked,
} from "../lib/analytics";
import { BillingProvider } from "../lib/billing-context";
import { StepsProvider } from "../lib/steps";
import { useApplyStoredTheme } from "../lib/theme-preference";
import { capturePendingRef } from "../lib/referral";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import "../../global.css";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

SplashScreen.preventAutoHideAsync();

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn: "https://4eea70b2d48b6b2a530d115a03b558aa@o4511678948900864.ingest.us.sentry.io/4511679261442048",
  // Split dev vs prod events so production issues are easy to filter.
  environment: __DEV__ ? "development" : "production",
  // Portion handles health data (weight, medical-condition flags, injuries) and
  // meal photos. Do NOT attach IP addresses / request bodies to events by
  // default — keep diagnostics free of personal data. Flip to true only with a
  // deliberate privacy review and a matching Privacy Policy update.
  sendDefaultPii: false,

  // --- Performance tracing ---
  // Trace everything in dev; sample 20% of transactions in production. The
  // navigation integration auto-creates a transaction per screen; `useApi`
  // adds http.client spans; native frames catch UI jank.
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  // Attach `sentry-trace`/`baggage` headers to our own API calls so client
  // spans can link to backend spans once server-side Sentry is added.
  tracePropagationTargets: ["localhost", /\/api\//],
  enableNativeFramesTracking: !isRunningInExpoGo(),

  // --- Structured logs (Sentry Logs) ---
  // `Sentry.logger.*` calls are sent as logs; console.warn/error are also
  // forwarded (info/debug console stays local to avoid noise).
  enableLogs: true,

  integrations: [
    // Session replay must never capture personal or health data. Portion screens
    // show weight, medical-condition flags, injuries, and meal photos, so mask
    // all text, images, and vectors — we keep replay for layout/interaction
    // debugging, not content. Do not disable masking without a privacy review.
    Sentry.mobileReplayIntegration({
      maskAllImages: true,
      maskAllText: true,
      maskAllVectors: true,
    }),
    navigationIntegration,
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
});

/**
 * Attaches the Clerk user id to Sentry so production errors, traces, and logs
 * are grouped per user. Clears it on sign-out. Must live inside ClerkProvider.
 */
function SentryUser() {
  const { isSignedIn, userId } = useAuth();
  useEffect(() => {
    Sentry.setUser(isSignedIn && userId ? { id: userId } : null);
  }, [isSignedIn, userId]);
  return null;
}

/**
 * Ties product analytics to the signed-in user (opaque Clerk id only) and
 * clears identity on sign-out so the next user starts a fresh anonymous id.
 */
function AnalyticsIdentity() {
  const { isSignedIn, userId } = useAuth();
  useEffect(() => {
    if (isSignedIn && userId) identifyUser(userId);
    else resetAnalytics();
  }, [isSignedIn, userId]);
  return null;
}

/**
 * Asks for product-analytics consent exactly once, after the user is onboarded
 * and inside the app (never on the auth or onboarding screens). Until they
 * choose, analytics stays off and collects nothing. The choice is remembered, so
 * this never re-prompts; users can change it anytime in Settings.
 */
function AnalyticsConsentPrompt() {
  const { loading, onboarded } = useProfile();
  useEffect(() => {
    if (loading || !onboarded) return;
    let active = true;
    void (async () => {
      if (await analyticsConsentAsked()) return;
      if (!active) return;
      Alert.alert(
        "Help improve Portion?",
        "Share anonymous usage data — like which features you use and where you get stuck — so we can make Portion better. This never includes your health data, weights, or meal photos. You can change this anytime in Settings.",
        [
          {
            text: "Not now",
            style: "cancel",
            onPress: () => void setAnalyticsConsent(false),
          },
          { text: "Allow", onPress: () => void setAnalyticsConsent(true) },
        ],
      );
    })();
    return () => {
      active = false;
    };
  }, [loading, onboarded]);
  return null;
}

/**
 * Global auth guard. Screens pushed on top of the tab navigator (settings,
 * profile, session, workout-day, …) have no auth gate of their own, so signing
 * out or deleting the account while on one of them would otherwise leave the
 * user stranded inside the app. This watches auth state and sends any
 * signed-out user back to the auth landing, from anywhere. Must live inside
 * ClerkProvider + ProfileProvider.
 */
function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { sessionValid } = useProfile();
  const pathname = usePathname();
  useEffect(() => {
    if (!isLoaded) return;
    const signedOut = !isSignedIn || !sessionValid;
    const onLanding = pathname === "/"; // the auth landing
    if (signedOut && !onLanding) router.replace("/");
  }, [isLoaded, isSignedIn, sessionValid, pathname]);
  return null;
}

function RootLayout() {
  const ref = useNavigationContainerRef();
  useApplyStoredTheme();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Restore the saved analytics-consent choice before anything can track().
  useEffect(() => {
    void loadAnalyticsConsent();
  }, []);

  // Capture a `?ref=CODE` from the launch URL or any deep link that opens the
  // app, to be redeemed once the user is signed in (see home.tsx).
  useEffect(() => {
    void Linking.getInitialURL().then((url) => capturePendingRef(url));
    const sub = Linking.addEventListener("url", ({ url }) =>
      capturePendingRef(url),
    );
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SentryUser />
      <AnalyticsIdentity />
      <ProfileProvider>
        <AuthGate />
        <AnalyticsConsentPrompt />
        <BillingProvider>
          <StepsProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="log" options={{ presentation: "modal" }} />
            <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
            <Stack.Screen name="workout-focus" options={{ presentation: "modal" }} />
            <Stack.Screen name="equipment" options={{ presentation: "modal" }} />
            <Stack.Screen name="goals" options={{ presentation: "modal" }} />
            <Stack.Screen name="reminders" options={{ presentation: "modal" }} />
          </Stack>
          </StepsProvider>
        </BillingProvider>
      </ProfileProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);

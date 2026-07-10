import { useEffect, useState } from "react";
import PostHog from "posthog-react-native";
import * as SecureStore from "expo-secure-store";

import { config } from "@/config";

/**
 * Privacy-scoped product analytics (PostHog), gated on explicit user consent.
 *
 * Hard rules (this app handles health data):
 *  - NOTHING is collected until the user opts in. We don't even construct the
 *    PostHog client until consent is granted, so no lifecycle/identify/events
 *    are ever sent beforehand.
 *  - Only the explicit events in `AnalyticsEvent` are sent, via track().
 *  - NO autocapture (singleton client, not the provider) and NO session replay.
 *  - NEVER pass health data, meal contents, weights, or free text as props.
 *  - Users are identified by opaque Clerk id only — never email or name.
 *  - Fully inert unless `EXPO_PUBLIC_POSTHOG_KEY` is set.
 *
 * Consent is persisted in SecureStore: "granted" / "denied" / (absent = not yet
 * asked). Change it via `useAnalyticsConsent()`; we ask once via the first-run
 * prompt in the root layout.
 */

const CONSENT_KEY = "portion-analytics-consent";

let client: PostHog | null = null;
let consent = false;
let identity: string | null = null;

/** Construct (once) and return the client — only ever when consent is granted. */
function ensureClient(): PostHog | null {
  if (!config.posthog.enabled || !consent) return null;
  if (!client) {
    client = new PostHog(config.posthog.key, {
      host: config.posthog.host,
      // No session replay — this app shows health data and meal photos.
      enableSessionReplay: false,
      // App opened / backgrounded / updated: non-sensitive lifecycle signal.
      captureAppLifecycleEvents: true,
    });
    void client.optIn();
    if (identity) client.identify(identity);
  }
  return client;
}

/** The only events we send. A closed union prevents ad-hoc / sensitive names. */
export type AnalyticsEvent =
  | "onboarding_started"
  | "onboarding_completed"
  | "food_logged"
  | "paywall_viewed"
  | "subscription_started";

/** Non-sensitive props only — never widen this to carry health data or text. */
type AnalyticsProps = Record<string, string | number | boolean>;

/** Send a product event. No-op unless enabled AND the user has consented. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  ensureClient()?.capture(event, props);
}

/** Tie events to the signed-in user by opaque Clerk id (no PII). */
export function identifyUser(userId: string): void {
  identity = userId;
  ensureClient()?.identify(userId);
}

/** Clear identity on sign-out so the next session starts anonymous. */
export function resetAnalytics(): void {
  identity = null;
  client?.reset();
}

/** Load the persisted consent decision at startup. Call once, high in the tree. */
export async function loadAnalyticsConsent(): Promise<void> {
  try {
    consent = (await SecureStore.getItemAsync(CONSENT_KEY)) === "granted";
  } catch {
    consent = false;
  }
  if (consent) ensureClient();
}

/** Grant or revoke consent, persist it, and start/stop collection accordingly. */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  consent = granted;
  try {
    await SecureStore.setItemAsync(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    // Non-fatal — the choice still applies for this session.
  }
  if (granted) {
    await ensureClient()?.optIn();
  } else if (client) {
    // Stop capturing and drop any identity we were holding.
    await client.optOut();
    client.reset();
  }
}

/** Whether the user has already made a consent choice (drives the first-run ask). */
export async function analyticsConsentAsked(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CONSENT_KEY)) !== null;
  } catch {
    // Fail closed: if storage is unreadable, don't nag with the prompt.
    return true;
  }
}

/** Settings-toggle state + setter. `granted` is null while the choice loads. */
export function useAnalyticsConsent(): {
  granted: boolean | null;
  setConsent: (v: boolean) => void;
} {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(CONSENT_KEY)
      .then((v) => active && setGranted(v === "granted"))
      .catch(() => active && setGranted(false));
    return () => {
      active = false;
    };
  }, []);
  return {
    granted,
    setConsent: (v: boolean) => {
      setGranted(v);
      void setAnalyticsConsent(v);
    },
  };
}

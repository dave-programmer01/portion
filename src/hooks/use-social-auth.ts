import { useCallback, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";

export type SocialStrategy = "oauth_google" | "oauth_apple";

/**
 * Pre-warm the system browser so the OAuth hand-off is instant on Android.
 * No-op on iOS/web, so it's safe to always run.
 */
function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

/**
 * Browser-based social sign-in / sign-up via Clerk's `useSSO`.
 *
 * A single `startSSOFlow` call handles both sign-in and sign-up (Clerk transfers
 * the OAuth identity to a new account when needed), and internally resolves the
 * `transferable` / `session_exists` states — so we only setActive on success.
 */
export function useSocialAuth() {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState<SocialStrategy | null>(null);

  const authenticate = useCallback(
    async (strategy: SocialStrategy) => {
      if (pending) return;
      setPending(strategy);
      try {
        const { createdSessionId, setActive } = await startSSOFlow({ strategy });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
        }
        // No session created → user cancelled or the flow needs extra steps.
        // Cancellation is non-fatal; nothing to surface here.
      } catch (err) {
        console.error(`[social-auth] ${strategy} failed`, err);
      } finally {
        setPending(null);
      }
    },
    [pending, startSSOFlow],
  );

  return { authenticate, pending };
}

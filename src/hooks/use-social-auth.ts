import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useSSO } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";

import { log, captureError } from "../lib/log";

// Completes any pending OAuth session when the app is re-focused via the
// redirect. Without this, the browser's redirect back into the app is treated
// as a fresh deep link and Expo Router shows an "unmatched route". Must run at
// module scope, before any component mounts.
WebBrowser.maybeCompleteAuthSession();

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
 * Social sign-in / sign-up via Clerk.
 *
 * Google on Android uses Clerk's **native** sign-in (Credential Manager): it
 * gets a Google ID token on-device and exchanges it with Clerk directly, with
 * no browser. This is deliberate — the browser OAuth flow's custom-scheme
 * redirect (`portion://`) is never captured by `openAuthSessionAsync` on
 * Android (verified across dev client, emulator, and standalone), so it always
 * returned `dismiss` with no session. Requires `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`.
 *
 * Everything else (Google on iOS, Apple) uses the browser SSO flow, which iOS
 * captures reliably via ASWebAuthenticationSession.
 */
export function useSocialAuth() {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [pending, setPending] = useState<SocialStrategy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(
    async (strategy: SocialStrategy) => {
      if (pending) return;
      setPending(strategy);
      setError(null);
      try {
        // --- Android Google: native, no browser ---
        if (strategy === "oauth_google" && Platform.OS === "android") {
          const { createdSessionId, setActive } =
            await startGoogleAuthenticationFlow();
          if (createdSessionId && setActive) {
            await setActive({ session: createdSessionId });
            log.info("auth.signin.success", { strategy, method: "native" });
          }
          return;
        }

        // --- Google on iOS + Apple: browser SSO ---
        const redirectUrl = AuthSession.makeRedirectUri({ scheme: "portion" });
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy,
          redirectUrl,
        });
        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          log.info("auth.signin.success", { strategy, method: "browser" });
        }
        // No session created → user cancelled or the flow needs extra steps.
        // Cancellation is non-fatal; nothing to surface here.
      } catch (err) {
        log.error(log.fmt`auth.signin.failed (${strategy})`);
        captureError(err, { strategy });
        // User-initiated cancellation isn't a failure — stay quiet. Anything
        // else, tell the user so a broken sign-in doesn't look like a frozen app.
        const msg = (err as { message?: string })?.message ?? "";
        if (!/cancel|dismiss/i.test(msg)) {
          setError("Couldn't sign in. Please try again.");
        }
      } finally {
        setPending(null);
      }
    },
    [pending, startSSOFlow, startGoogleAuthenticationFlow],
  );

  return { authenticate, pending, error };
}

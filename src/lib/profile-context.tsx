import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/expo";

import { useApi } from "./api";
import type { ApiError } from "./api";
import type { Profile, NutritionTargets } from "@/db/schema";

/**
 * Loads the signed-in user's profile + nutrition targets once and shares them
 * app-wide. Drives the onboarding gate: `onboarded` is false until the profile
 * exists, so the router can send new users to `/onboarding`. `import type` keeps
 * the Drizzle schema module out of the client bundle.
 *
 * `sessionValid` is the key signal for a *deleted* user: Clerk may still report
 * `isSignedIn` from a stale cached session, but the backend rejects the request
 * with 401 (the Clerk user no longer exists). We only treat someone as
 * "needs onboarding" once the backend confirms the session with a 200 — a 401
 * means send them to the auth screen, not onboarding.
 */

type ProfileResponse = {
  profile: Profile | null;
  targets: NutritionTargets | null;
};

type ProfileContextValue = {
  profile: Profile | null;
  targets: NutritionTargets | null;
  loading: boolean;
  onboarded: boolean;
  /** False once the backend has rejected the session with 401 (deleted user). */
  sessionValid: boolean;
  /** Re-fetch after onboarding or a profile edit (also recomputes targets). */
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { request } = useApi();
  const [state, setState] = useState<ProfileResponse>({
    profile: null,
    targets: null,
  });
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setState({ profile: null, targets: null });
      setSessionValid(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await request<ProfileResponse>("/api/profile"));
      // Backend confirmed a real, authenticated user.
      setSessionValid(true);
    } catch (err) {
      // 401 → the Clerk user was deleted / session revoked. `useApi` already
      // triggered signOut; flag it so the gates route to the auth screen
      // instead of onboarding (which they'd otherwise get as a profile-less user).
      if ((err as ApiError)?.status === 401) setSessionValid(false);
      // Other errors (network) leave prior state and just unblock the UI.
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, request]);

  useEffect(() => {
    if (isLoaded) void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  return (
    <ProfileContext.Provider
      value={{
        profile: state.profile,
        targets: state.targets,
        loading,
        onboarded: !!state.profile?.onboardingCompletedAt,
        sessionValid,
        refresh,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

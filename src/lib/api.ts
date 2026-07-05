import { useCallback, useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import { useAuth } from "@clerk/expo";

/**
 * Base URL for our Expo Router API routes.
 *
 * In dev the routes are served by the Metro/Expo server, whose host:port lives
 * in `Constants.expoConfig.hostUri` (e.g. "192.168.1.4:8081") — so it resolves
 * correctly on a physical device, not just localhost. In production set
 * `EXPO_PUBLIC_API_URL` to the deployed origin (Vercel).
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri}`;
  return "";
}

export const API_BASE = resolveBaseUrl();

export type ApiError = { status: number; message: string };

/**
 * Hook returning an authenticated `request` fn. Attaches the current Clerk
 * session token so protected API routes (`requireUser`) accept the call.
 */
export function useApi() {
  const { getToken, signOut } = useAuth();
  // Clerk hands back a fresh `getToken`/`signOut` identity on every render;
  // capture them in refs so `request` can stay referentially stable. Without
  // this, any effect that depends on `request` (e.g. the profile loader)
  // re-fires forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const request = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getTokenRef.current();
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });

      if (!res.ok) {
        // A 401 means the session is no longer valid — e.g. the Clerk user was
        // deleted, or the token can't be refreshed. Sign out so the routing
        // gates (index / (tabs)) bounce the user back to the auth screen.
        if (res.status === 401) {
          void signOutRef.current().catch(() => {});
        }
        let message = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // non-JSON error body; keep the generic message
        }
        throw { status: res.status, message } satisfies ApiError;
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [],
  );

  return { request };
}

/**
 * Minimal data-fetching hook (we don't pull in React Query for v1). Re-runs
 * when `deps` change; exposes `refetch` for manual refresh and pull-to-refresh.
 * Pass `enabled: false` to defer until a condition is met.
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<ApiError | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcherRef.current());
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return { data, loading, error, refetch: run, setData };
}

/** Local YYYY-MM-DD for "today" (entries are keyed by local calendar day). */
export function todayLocal(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

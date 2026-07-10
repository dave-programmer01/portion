import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import { useAuth } from "@clerk/expo";

import { useApi, todayLocal } from "./api";
import { useProfile } from "./profile-context";

export type StepDay = { date: string; steps: number };

type StepsValue = {
  /** null = still checking; false = unavailable / not permitted. */
  available: boolean | null;
  today: number;
  days: StepDay[];
  goal: number;
  refresh: () => Promise<void>;
};

type RequestFn = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<unknown>;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const StepsContext = createContext<StepsValue | null>(null);

/**
 * Shared device step counter (expo-sensors pedometer) + stored daily history.
 * Runs a SINGLE pedometer subscription + sync for the whole app (mounted once at
 * the root), so Home and Progress read the same data without re-subscribing.
 * Only active once the user is signed in and onboarded.
 *
 * iOS: Core Motion gives today's true total and up to 7 days back, so we read
 * the real total and backfill history. Android: the pedometer only reports steps
 * since we subscribe, so `today` reflects steps counted this session (the server
 * keeps the day's peak via GREATEST). Degrades gracefully when unavailable.
 */
export function StepsProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const { onboarded } = useProfile();
  const active = !!isSignedIn && onboarded;
  const { request } = useApi();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [today, setToday] = useState(0);
  const [days, setDays] = useState<StepDay[]>([]);
  const [goal, setGoal] = useState(10000);
  const backfilled = useRef(false);

  const load = useCallback(async () => {
    if (!active) return;
    try {
      const r = await request<{ days: StepDay[]; goal: number }>(
        "/api/steps?days=7",
      );
      setDays(r.days);
      setGoal(r.goal);
    } catch {
      // keep last-known values
    }
  }, [active, request]);

  useEffect(() => {
    void load();
  }, [load]);

  // Read the pedometer (once, while active).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let sub: { remove: () => void } | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const ok = await Pedometer.isAvailableAsync().catch(() => false);
      if (cancelled) return;
      if (!ok) {
        setAvailable(false);
        return;
      }
      const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
      if (cancelled) return;
      if (perm && perm.granted === false) {
        setAvailable(false);
        return;
      }
      setAvailable(true);

      if (Platform.OS === "ios") {
        const readToday = async () => {
          const res = await Pedometer.getStepCountAsync(
            startOfToday(),
            new Date(),
          ).catch(() => null);
          if (res && !cancelled) setToday(res.steps);
        };
        await readToday();
        interval = setInterval(readToday, 60_000);

        if (!backfilled.current) {
          backfilled.current = true;
          void backfillHistory(request).then(() => {
            if (!cancelled) void load();
          });
        }
      } else {
        sub = Pedometer.watchStepCount((res) => {
          if (!cancelled) setToday(res.steps);
        });
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
      if (interval) clearInterval(interval);
    };
  }, [active, request, load]);

  // Sync today's count to the server (debounced), then refresh history.
  useEffect(() => {
    if (!active || today <= 0) return;
    const t = setTimeout(() => {
      request("/api/steps", {
        method: "PUT",
        body: JSON.stringify({ loggedDate: todayLocal(), steps: today }),
      })
        .then(() => load())
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [active, today, request, load]);

  return createElement(
    StepsContext.Provider,
    { value: { available, today, days, goal, refresh: load } },
    children,
  );
}

/** Read the shared step data. Safe to call anywhere under StepsProvider. */
export function useSteps(): StepsValue {
  return (
    useContext(StepsContext) ?? {
      available: null,
      today: 0,
      days: [],
      goal: 10000,
      refresh: async () => {},
    }
  );
}

/** iOS only: push the previous 6 days of step totals from Core Motion. */
async function backfillHistory(request: RequestFn): Promise<void> {
  for (let i = 1; i <= 6; i++) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const res = await Pedometer.getStepCountAsync(dayStart, dayEnd).catch(
      () => null,
    );
    if (!res || res.steps <= 0) continue;
    await request("/api/steps", {
      method: "PUT",
      body: JSON.stringify({
        loggedDate: dayStart.toISOString().slice(0, 10),
        steps: res.steps,
      }),
    }).catch(() => {});
  }
}

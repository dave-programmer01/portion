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
import { configurePurchases } from "./purchases";
import type { Tier } from "@/db/schema";

/**
 * App-wide billing state: tier + today's scan usage + prices. Drives paywall
 * gating and the "N scans left" UI. Also configures RevenueCat with the Clerk
 * user id on sign-in (no-op in dev). Refresh after an upgrade or a scan.
 */

export type BillingStatus = {
  tier: Tier;
  scansToday: number;
  scanLimit: number;
  scansRemaining: number | null;
  historyFreeDays: number;
  prices: { monthlyUsd: number; annualUsd: number; annualTrialDays: number };
  revenueCatEnabled: boolean;
};

type BillingContextValue = {
  status: BillingStatus | null;
  isPremium: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Dev-only: flip tier locally when RevenueCat isn't wired. */
  setDevTier: (tier: Tier) => Promise<void>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { request } = useApi();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      setStatus(await request<BillingStatus>("/api/billing/status"));
    } catch {
      // Non-fatal (e.g. 401 during sign-out) — leave prior state.
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, request]);

  const setDevTier = useCallback(
    async (tier: Tier) => {
      await request("/api/billing/dev-set-tier", {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
      await refresh();
    },
    [request, refresh],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) void configurePurchases(userId);
    void refresh();
  }, [isLoaded, isSignedIn, userId, refresh]);

  return (
    <BillingContext.Provider
      value={{
        status,
        isPremium: status?.tier === "premium",
        loading,
        refresh,
        setDevTier,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used inside BillingProvider");
  return ctx;
}

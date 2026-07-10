import { Platform } from "react-native";

import { config } from "@/config";

/**
 * Thin wrapper around `react-native-purchases`. The native module is **lazily
 * required** and only touched when RevenueCat is configured (a public key is
 * present), so the current dev client — which hasn't been rebuilt with the
 * native module — never loads it and can't crash. When disabled, the paywall
 * uses the dev tier toggle instead of a real purchase.
 */

export type PurchaseOption = {
  id: string;
  title: string;
  priceString: string;
  period: "monthly" | "annual";
  // Opaque RevenueCat package, passed back to `purchase()`.
  pkg?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Purchases(): any {
  // Deferred require: evaluated only when enabled.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("react-native-purchases").default;
}

let configured = false;

/** Configure the SDK and associate the Clerk user id. No-op when disabled. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!config.revenuecat.enabled || configured) return;
  const apiKey =
    Platform.OS === "ios"
      ? config.revenuecat.iosKey
      : config.revenuecat.androidKey;
  if (!apiKey) return;
  const P = Purchases();
  P.configure({ apiKey, appUserID: userId });
  configured = true;
}

/** Fetch the current offering's packages as display-ready options. */
export async function getOfferings(): Promise<PurchaseOption[]> {
  if (!config.revenuecat.enabled) return [];
  const P = Purchases();
  const offerings = await P.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pkgs.map((pkg: any) => ({
    id: pkg.identifier,
    title: pkg.product.title,
    priceString: pkg.product.priceString,
    period: pkg.packageType === "ANNUAL" ? "annual" : "monthly",
    pkg,
  }));
}

/** Run a purchase; returns whether the premium entitlement is now active. */
export async function purchase(option: PurchaseOption): Promise<boolean> {
  if (!config.revenuecat.enabled) return false;
  const P = Purchases();
  const { customerInfo } = await P.purchasePackage(option.pkg);
  return !!customerInfo.entitlements.active[config.revenuecat.entitlementId];
}

/** Restore prior purchases; returns whether premium is active afterwards. */
export async function restore(): Promise<boolean> {
  if (!config.revenuecat.enabled) return false;
  const P = Purchases();
  const info = await P.restorePurchases();
  return !!info.entitlements.active[config.revenuecat.entitlementId];
}

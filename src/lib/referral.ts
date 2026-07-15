import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";

/**
 * Client side of the referral loop. We capture a `?ref=CODE` from the launch /
 * deep-link URL and stash it until the user is authenticated, then redeem it
 * once. Kept tiny and dependency-light so it can run from the root layout.
 */

const PENDING_KEY = "portion-pending-ref";

/** Pull a referral code out of a deep-link / universal-link URL. */
export function parseRef(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const ref = Linking.parse(url).queryParams?.ref;
    return typeof ref === "string" && ref.trim() ? ref.trim() : null;
  } catch {
    return null;
  }
}

/** Stash a referral code from an incoming URL for redemption after sign-in. */
export async function capturePendingRef(
  url: string | null | undefined,
): Promise<void> {
  const ref = parseRef(url);
  if (!ref) return;
  try {
    await SecureStore.setItemAsync(PENDING_KEY, ref);
  } catch {
    // Non-fatal — the user can still enter the code manually.
  }
}

async function clearPendingRef(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {
    // ignore
  }
}

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Redeem a previously-captured referral code, if any. On success returns the
 * reward days AND the code (so the caller can celebrate and tag the acquisition
 * source for per-creator attribution). Clears the pending code on success or a
 * terminal 4xx (invalid/self/already/not-new) so we don't retry forever; keeps
 * it on a network/5xx error to retry next launch.
 */
export async function redeemPendingRef(
  request: Requester,
): Promise<{ rewardDays: number; code: string } | null> {
  let code: string | null = null;
  try {
    code = await SecureStore.getItemAsync(PENDING_KEY);
  } catch {
    return null;
  }
  if (!code) return null;

  try {
    const res = await request<{ ok: boolean; rewardDays: number }>(
      "/api/referrals/redeem",
      { method: "POST", body: JSON.stringify({ code }) },
    );
    await clearPendingRef();
    return { rewardDays: res.rewardDays ?? 0, code };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status && status >= 400 && status < 500) await clearPendingRef();
    return null;
  }
}

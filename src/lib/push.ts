import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

/**
 * Client side of server push: gets this device's Expo push token and registers
 * it with our API so the engagement cron can reach the user. Registration is
 * best-effort and silent — push is a nice-to-have, never blocks the UI. Pass in
 * the authed `request` from `useApi()` (this lib stays hook-free).
 */

type RequestFn = <T>(
  path: string,
  options?: { method?: string; body?: string },
) => Promise<T>;

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
    (Constants.easConfig?.projectId as string | undefined)
  );
}

async function currentToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // no push on simulators/emulators
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return null;
  const id = projectId();
  try {
    const res = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined,
    );
    return res.data;
  } catch {
    return null;
  }
}

/** Register/refresh this device's push token. No-op without permission. */
export async function registerPushToken(request: RequestFn): Promise<void> {
  const token = await currentToken();
  if (!token) return;
  try {
    await request("/api/me/push-token", {
      method: "POST",
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      }),
    });
  } catch {
    // Non-fatal — we'll try again next launch.
  }
}

/** Remove this device's token (user turned notifications off). */
export async function unregisterPushToken(request: RequestFn): Promise<void> {
  const token = await currentToken();
  if (!token) return;
  try {
    await request(`/api/me/push-token?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
  } catch {
    // Non-fatal.
  }
}

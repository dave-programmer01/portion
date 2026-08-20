import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";

/**
 * On-device workout reminders (local notifications — no server/push). Prefs live
 * in SecureStore; reminders are scheduled as repeating weekly local
 * notifications on the user's chosen days + time.
 */

// Show reminders as a banner even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const KEY = "portion-notif-prefs";
const CHANNEL = "workout-reminders";

// A gentle daily "log your meals" reminder (gated on the master switch). Win-back
// for dormant users is handled SERVER-side now (the push cron), because a device
// can't re-arm a one-shot notification while the app is closed — see
// server/push.ts + inngest/functions/engagement-push.ts.
const DAILY_NUDGE_HOUR = 19; // 7pm — after dinner, when meals are loggable

export type ReminderPrefs = {
  enabled: boolean;
  days: number[]; // 0 = Sun … 6 = Sat
  hour: number; // 0-23
  minute: number; // 0-59
};

export type NotifPrefs = {
  enabled: boolean; // master notifications switch
  reminders: ReminderPrefs;
};

export const DEFAULT_PREFS: NotifPrefs = {
  enabled: false,
  reminders: { enabled: false, days: [1, 3, 5], hour: 18, minute: 0 },
};

export const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatTime(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** Human summary for the Settings row. */
export function reminderSummary(prefs: NotifPrefs): string {
  const r = prefs.reminders;
  if (!prefs.enabled || !r.enabled || r.days.length === 0) return "Off";
  const days = [...r.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");
  return `${days} · ${formatTime(r.hour, r.minute)}`;
}

export async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as NotifPrefs;
    return {
      enabled: !!p.enabled,
      reminders: {
        enabled: !!p.reminders?.enabled,
        days: Array.isArray(p.reminders?.days)
          ? p.reminders.days.filter((d) => d >= 0 && d <= 6)
          : DEFAULT_PREFS.reminders.days,
        hour: Number.isFinite(p.reminders?.hour) ? p.reminders.hour : 18,
        minute: Number.isFinite(p.reminders?.minute) ? p.reminders.minute : 0,
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

async function persist(prefs: NotifPrefs): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
  } catch {
    // Non-fatal — settings still apply for this session.
  }
}

/** Request notification permission; returns whether it's granted. */
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Workout reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});
}

/** Cancel everything and (re)schedule from prefs, if enabled + permitted. */
export async function applySchedule(prefs: NotifPrefs): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  // Master switch off → no notifications at all.
  if (!prefs.enabled) return;
  const granted = await Notifications.getPermissionsAsync()
    .then((p) => p.granted)
    .catch(() => false);
  if (!granted) return;
  await ensureChannel();
  const channel = Platform.OS === "android" ? { channelId: CHANNEL } : {};

  // Workout reminders (weekly, on the chosen days).
  const r = prefs.reminders;
  if (r.enabled && r.days.length > 0) {
    for (const day of r.days) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Time to train 💪",
          body: "Your workout is waiting — let's get it done.",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: (day % 7) + 1, // expo weekday: 1 = Sun … 7 = Sat
          hour: r.hour,
          minute: r.minute,
          ...channel,
        },
      }).catch(() => {});
    }
  }

  // Daily "log your meals" nudge — the tiny-action half of the habit loop.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Don't forget to log 🍽️",
      body: "Log today's meals in a few taps — keep your streak alive.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_NUDGE_HOUR,
      minute: 0,
      ...channel,
    },
  }).catch(() => {});
}

/**
 * Called from every food-log success path. Re-arms the local schedule so the
 * daily/workout reminders stay fresh. Fire-and-forget; no-ops when notifications
 * are off. (Dormancy win-back lives on the server now — see engagement-push.)
 */
export async function noteFoodLogged(): Promise<void> {
  const prefs = await loadNotifPrefs();
  if (prefs.enabled) await applySchedule(prefs);
}

/** Toggle master notifications (requests permission when turning on). */
export async function setMasterEnabled(on: boolean): Promise<NotifPrefs> {
  const prefs = await loadNotifPrefs();
  const enabled = on ? await ensurePermission() : false;
  const next: NotifPrefs = { ...prefs, enabled };
  await persist(next);
  await applySchedule(next);
  return next;
}

/** Save reminder settings; enabling them turns master on + requests permission. */
export async function saveReminderPrefs(reminders: ReminderPrefs): Promise<NotifPrefs> {
  const prefs = await loadNotifPrefs();
  let master = prefs.enabled;
  if (reminders.enabled && !master) master = await ensurePermission();
  const next: NotifPrefs = { enabled: master, reminders };
  await persist(next);
  await applySchedule(next);
  return next;
}

/** Load prefs once for a screen. */
export function useNotifPrefs() {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  useEffect(() => {
    let active = true;
    loadNotifPrefs().then((p) => active && setPrefs(p));
    return () => {
      active = false;
    };
  }, []);
  return { prefs, setPrefs };
}

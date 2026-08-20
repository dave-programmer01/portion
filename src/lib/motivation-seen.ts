import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";

import type { MotivationCard } from "./motivation";

/**
 * Tracks when the user last opened the Motivation Center so the home bell can
 * show an unread dot. The dot lights up at most once per day, and only when
 * there's a real nudge to act on (log today / welcome back) — not for the
 * celebratory or informational cards. Local-only (SecureStore), no server round-
 * trip for a dot.
 */

const KEY = "portion-motivation-last-open";

// Cards that represent something the user should actually do → worth a dot.
const NUDGE_KINDS = new Set<MotivationCard["kind"]>([
  "welcome_back",
  "log_reminder",
]);

export async function markMotivationSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, String(Date.now()));
  } catch {
    // Non-fatal — the dot just stays until next open.
  }
}

async function getLastOpen(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whether to show the unread dot on the bell. Reloads the last-open time whenever
 * the screen refocuses (so it clears right after the Center is opened).
 */
export function useMotivationUnread(cards: MotivationCard[]): boolean {
  const [lastOpen, setLastOpen] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLastOpen().then((v) => active && setLastOpen(v));
      return () => {
        active = false;
      };
    }, []),
  );

  if (lastOpen === null) return false; // don't flash a dot before we know
  const hasNudge = cards.some((c) => NUDGE_KINDS.has(c.kind));
  return hasNudge && lastOpen < startOfToday();
}

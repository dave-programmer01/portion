import { config } from "@/config";

/**
 * Thin Expo Push API client. Sends notifications to device tokens and reports
 * back which tokens are dead (`DeviceNotRegistered`) so callers can prune them.
 * Batches at the Expo limit of 100 messages/request. Network/HTTP failures are
 * swallowed per-chunk — the daily cron simply retries next run.
 */

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushResult = { sent: number; invalidTokens: string[] };

type ExpoTicket = {
  status: "ok" | "error";
  details?: { error?: string };
};

export async function sendExpoPush(
  messages: PushMessage[],
): Promise<PushResult> {
  const invalidTokens: string[] = [];
  let sent = 0;

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(config.push.expoApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      tickets.forEach((t, idx) => {
        if (t.status === "ok") {
          sent += 1;
        } else if (t.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(chunk[idx]!.to);
        }
      });
    } catch {
      // Transient failure — leave these for the next cron run.
    }
  }

  return { sent, invalidTokens };
}

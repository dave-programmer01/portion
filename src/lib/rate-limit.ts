/**
 * Tiny in-memory fixed-window rate limiter. Best-effort abuse guard for the
 * unauthenticated Open Food Facts proxy routes (barcode + search) so one client
 * can't hammer OFF — which asks callers to be reasonable — or run up our egress.
 *
 * State is per server instance, so on multi-instance serverless this limits per
 * instance, not globally. That's an acceptable ceiling here; swap in a shared
 * store (Redis / a Neon table) if you ever need strict global limits.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

/**
 * Record a hit for `key` and report whether it's within `limit` per `windowMs`.
 * Fixed window: the first hit opens a window, and it resets once the window
 * elapses. `retryAfterSec` is how long to wait when blocked (0 when allowed).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic sweep so the map can't grow unbounded under many distinct keys.
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
  }

  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from the usual proxy headers (Vercel/Cloudflare/etc.). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

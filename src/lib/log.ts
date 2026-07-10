import * as Sentry from "@sentry/react-native";

/**
 * App logging surface. Wraps Sentry's structured logger (enabled via
 * `enableLogs` in the root Sentry.init) so screens can emit searchable,
 * queryable logs in production:
 *
 *   import { log } from "@/lib/log";
 *   log.info("food.logged", { source, mealType });
 *   log.error(log.fmt`workout gen failed: ${message}`);
 *
 * Levels: trace | debug | info | warn | error | fatal. Attributes must be a
 * flat object of primitives. Use `log.fmt` for parameterized messages.
 */
export const log = Sentry.logger;

/** Capture a handled exception with extra context (goes to Issues, not Logs). */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

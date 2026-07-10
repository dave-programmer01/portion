import * as SentryNode from "@sentry/node";

/**
 * Server-side Sentry for AI monitoring. LLM calls run in Inngest jobs (Node),
 * not the RN client, so this is a separate `@sentry/node` init. We use MANUAL
 * `gen_ai.*` spans (per Sentry's AI-agents conventions) rather than the OpenAI
 * auto-integration, because that relies on require-in-the-middle patching which
 * is unreliable under Expo Router's Metro server bundling. Everything degrades
 * gracefully: if Sentry can't init, the AI calls still run un-instrumented.
 */

// DSN comes from env — no secret is hardcoded. Prefer a dedicated backend DSN
// (`SENTRY_DSN`); fall back to the public client DSN if that's all that's set.
// If neither is present, monitoring degrades gracefully (AI calls run
// un-instrumented) rather than throwing.
const DSN = process.env.SENTRY_DSN ?? process.env.EXPO_PUBLIC_SENTRY_DSN;

let initState: "pending" | "ready" | "failed" = "pending";

function ensureInit(): boolean {
  if (initState !== "pending") return initState === "ready";
  if (!DSN) {
    initState = "failed";
    return false;
  }
  try {
    SentryNode.init({
      dsn: DSN,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      // AI jobs are low-volume → trace all of them.
      tracesSampleRate: 1.0,
      // Skip the OTEL auto-instrumentations (http/fs/etc.) — they use import
      // hooks that don't survive Metro server bundling. Manual spans still work.
      defaultIntegrations: false,
    });
    initState = "ready";
  } catch (err) {
    console.error("[monitoring] Sentry (node) init failed", err);
    initState = "failed";
  }
  return initState === "ready";
}

/** Minimal shape we read off an OpenAI chat completion to fill span attributes. */
type LlmResult = {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * Wrap one LLM call in Sentry AI-monitoring spans: an outer `gen_ai.invoke_agent`
 * (the logical agent, e.g. "food-vision") and an inner `gen_ai.chat` carrying
 * the model + token usage Sentry uses to compute cost/latency. Flushes after so
 * spans are delivered even in a short-lived serverless invocation.
 */
export async function withGenAI<T extends LlmResult>(
  meta: { agent: string; model: string },
  run: () => Promise<T>,
): Promise<T> {
  if (!ensureInit()) return run();

  const attrs = {
    "gen_ai.request.model": meta.model,
    "gen_ai.system": "openai",
    "gen_ai.provider.name": "openai",
  };

  try {
    return await SentryNode.startSpan(
      {
        op: "gen_ai.invoke_agent",
        name: `invoke_agent ${meta.agent}`,
        attributes: {
          ...attrs,
          "gen_ai.operation.name": "invoke_agent",
          "gen_ai.agent.name": meta.agent,
        },
      },
      () =>
        SentryNode.startSpan(
          {
            op: "gen_ai.chat",
            name: `chat ${meta.model}`,
            attributes: { ...attrs, "gen_ai.operation.name": "chat" },
          },
          async (span) => {
            const res = await run();
            span.setAttribute(
              "gen_ai.usage.input_tokens",
              res.usage?.prompt_tokens ?? 0,
            );
            span.setAttribute(
              "gen_ai.usage.output_tokens",
              res.usage?.completion_tokens ?? 0,
            );
            if (res.model) span.setAttribute("gen_ai.response.model", res.model);
            return res;
          },
        ),
    );
  } finally {
    // Serverless-safe: make sure the spans leave before the invocation freezes.
    try {
      await SentryNode.flush(2000);
    } catch {
      // ignore flush errors
    }
  }
}

/** Capture a server-side exception (AI job failures, etc.). */
export function captureServerError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!ensureInit()) return;
  SentryNode.captureException(
    error,
    context ? { extra: context } : undefined,
  );
}

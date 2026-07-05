import { verifyToken, createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Server-side Clerk auth for Expo Router API routes.
 *
 * The app attaches a short-lived Clerk session token as `Authorization: Bearer`
 * (see `src/lib/api.ts`). We verify it networklessly with the secret key and
 * pull the user id out of the `sub` claim. Every DB-touching route funnels
 * through `requireUser` so we never trust a client-supplied user id.
 */

const secretKey = process.env.CLERK_SECRET_KEY;

const clerk = createClerkClient({ secretKey: secretKey ?? "" });

// Users we've already confirmed/created this process — skip the DB round-trip.
const ensuredUsers = new Set<string>();

/**
 * Make sure the signed-in Clerk user has a row in `users`. The Clerk→Neon
 * webhook (Inngest `syncUser`) is the source of truth, but in local dev it
 * often isn't reachable, leaving `users` empty — which breaks every table that
 * FK-references it (profiles, food, workouts). This closes that gap by
 * upserting the user from Clerk on first authenticated request; the webhook
 * still keeps the row fresh when it fires.
 */
export async function ensureUser(userId: string): Promise<void> {
  if (ensuredUsers.has(userId)) return;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing) {
    ensuredUsers.add(userId);
    return;
  }

  // Pull profile details from Clerk so the NOT NULL email is populated — and so
  // we can confirm the user still exists. A deleted Clerk user must NOT be
  // recreated here (that would resurrect a user you removed); we reject instead.
  let u;
  try {
    u = await clerk.users.getUser(userId);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      // User was deleted from Clerk → unauthorized. The client signs out on 401.
      throw new HttpError(401, "User no longer exists");
    }
    // Couldn't reach Clerk to confirm — refuse rather than write a bad row.
    console.error("[auth] ensureUser: Clerk lookup failed", err);
    throw new HttpError(401, "Could not verify user");
  }

  const email =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
      ?.emailAddress ??
    u.emailAddresses[0]?.emailAddress ??
    `${userId}@placeholder.local`;

  await db
    .insert(users)
    .values({
      id: userId,
      email,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      imageUrl: u.imageUrl ?? null,
    })
    .onConflictDoNothing();
  ensuredUsers.add(userId);
}

/** Returns the Clerk user id for a request, or null if unauthenticated. */
export async function getUserId(request: Request): Promise<string | null> {
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }

  const header = request.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const payload = await verifyToken(token, { secretKey });
    return payload.sub ?? null;
  } catch {
    // Expired / malformed / wrong-instance token → treat as unauthenticated.
    return null;
  }
}

/** Thrown to short-circuit a handler with a JSON error response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve the user id or throw a 401 — use at the top of protected routes. */
export async function requireUser(request: Request): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) throw new HttpError(401, "Unauthorized");
  // Guarantee the Neon `users` row exists before any FK-dependent write runs.
  await ensureUser(userId);
  return userId;
}

/**
 * Wrap a handler so thrown `HttpError`s become JSON responses and anything else
 * becomes a 500. Keeps each route body focused on the happy path.
 */
export function route(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error("[api] unhandled error", err);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

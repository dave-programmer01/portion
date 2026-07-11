import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // Server-only module. If this throws on the client you've imported it from
  // the wrong place — DB access lives in API routes / Inngest functions only.
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });

/**
 * The app's Drizzle database type. Query helpers accept this so they can run
 * against the real Neon `db` in production and a pglite instance in tests.
 */
export type Db = typeof db;

export { schema };

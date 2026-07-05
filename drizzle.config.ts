import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Loaded by the drizzle-kit CLI (npm run db:generate / db:push).
// `dotenv/config` pulls DATABASE_URL out of .env since the CLI runs outside Expo.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

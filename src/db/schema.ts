import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Users synced from Clerk. `id` is the Clerk user id (e.g. `user_2abc…`),
 * so we never generate our own — Clerk is the source of truth for identity.
 * Profile / onboarding data lives in separate tables (see PLAN.md Phase 1).
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

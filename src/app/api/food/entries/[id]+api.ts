import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem } from "@/db/schema";
import { requireUser, route, HttpError } from "@/server/auth";
import { recomputeEntryTotals } from "@/server/food";
import { deleteImageKitFiles } from "@/server/imagekit";

/**
 * Edit or delete a single entry. PATCH replaces the item list (used to correct
 * an AI/scanned result before/after confirming) and recomputes totals; DELETE
 * removes the entry (items cascade). Ownership is always checked.
 */

const itemSchema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().max(120).nullable().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().max(20).default("serving"),
  servingLabel: z.string().max(60).nullable().optional(),
  calories: z.number().min(0),
  proteinG: z.number().min(0).default(0),
  carbsG: z.number().min(0).default(0),
  fatG: z.number().min(0).default(0),
});

const patchSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  items: z.array(itemSchema).optional(),
});

function idFrom(request: Request): string {
  const id = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Bad id");
  return id;
}

async function requireOwnedEntry(request: Request, userId: string) {
  const id = idFrom(request);
  const [entry] = await db
    .select()
    .from(foodEntry)
    .where(and(eq(foodEntry.id, id), eq(foodEntry.userId, userId)));
  if (!entry) throw new HttpError(404, "Entry not found");
  return entry;
}

export const PATCH = route(async (request) => {
  const userId = await requireUser(request);
  const entry = await requireOwnedEntry(request, userId);
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid patch" }, { status: 400 });
  }
  const { mealType, items } = parsed.data;

  if (mealType) {
    await db
      .update(foodEntry)
      .set({ mealType, updatedAt: new Date() })
      .where(eq(foodEntry.id, entry.id));
  }

  if (items) {
    await db.delete(foodItem).where(eq(foodItem.entryId, entry.id));
    if (items.length > 0) {
      await db.insert(foodItem).values(
        items.map((i) => ({
          entryId: entry.id,
          name: i.name,
          brand: i.brand ?? null,
          quantity: i.quantity,
          unit: i.unit,
          servingLabel: i.servingLabel ?? null,
          calories: Math.round(i.calories),
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
        })),
      );
    }
    await recomputeEntryTotals(entry.id, "complete");
  }

  const items2 = await db
    .select()
    .from(foodItem)
    .where(eq(foodItem.entryId, entry.id));
  const [fresh] = await db
    .select()
    .from(foodEntry)
    .where(eq(foodEntry.id, entry.id));

  return Response.json({ entry: fresh, items: items2 });
});

export const DELETE = route(async (request) => {
  const userId = await requireUser(request);
  const entry = await requireOwnedEntry(request, userId);
  // Remove the meal photo from ImageKit too (best-effort; never blocks delete).
  if (entry.imageFileId) await deleteImageKitFiles([entry.imageFileId]);
  await db.delete(foodEntry).where(eq(foodEntry.id, entry.id));
  return new Response(null, { status: 204 });
});

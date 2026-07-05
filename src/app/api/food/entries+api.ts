import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { recomputeEntryTotals } from "@/server/food";
import {
  getUserTier,
  photoScansToday,
  monthToDateSpendUsd,
} from "@/server/billing";
import { photoScanAllowed } from "@/lib/gating";
import { inngest } from "@/inngest/client";
import { PHOTO_ANALYZE_EVENT, config } from "@/config";

/**
 * Create a food entry.
 *  - manual / barcode / search / saved → lands `complete` with its items.
 *  - photo → lands `pending` (optimistic); the Inngest vision job fills items
 *    and flips it to `complete`/`failed`. A failed scan costs the user nothing.
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
  foodMasterId: z.string().uuid().nullable().optional(),
});

const bodySchema = z.object({
  loggedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  source: z.enum(["photo", "barcode", "search", "manual", "saved"]),
  imageUrl: z.string().url().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  items: z.array(itemSchema).default([]),
});

export const POST = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid entry" }, { status: 400 });
  }
  const body = parsed.data;
  const isPhoto = body.source === "photo";

  // Gate the AI photo path: daily free cap + global spend ceiling. Barcode /
  // search / manual are always free and skip this entirely.
  if (isPhoto) {
    const tier = await getUserTier(userId);
    const [scans, spend] = await Promise.all([
      photoScansToday(userId, body.loggedDate),
      monthToDateSpendUsd(),
    ]);
    const decision = photoScanAllowed({
      tier,
      scansToday: scans,
      dailyLimit: config.freeScansPerDay,
      monthSpendUsd: spend,
      spendCeilingUsd: config.monthlyAiSpendCeilingUsd,
    });
    if (!decision.allowed) {
      return Response.json(
        {
          error:
            decision.reason === "spend_ceiling"
              ? "AI photo scans are paused for now — use barcode or search."
              : "You've used your free scans for today.",
          reason: decision.reason,
          code: "paywall",
        },
        { status: 402 },
      );
    }
  }

  const [entry] = await db
    .insert(foodEntry)
    .values({
      userId,
      loggedDate: body.loggedDate,
      mealType: body.mealType,
      source: body.source,
      imageUrl: body.imageUrl ?? null,
      note: body.note ?? null,
      status: isPhoto ? "pending" : "complete",
    })
    .returning();

  if (body.items.length > 0) {
    await db.insert(foodItem).values(
      body.items.map((i) => ({
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
        foodMasterId: i.foodMasterId ?? null,
      })),
    );
    await recomputeEntryTotals(entry.id, "complete");
  }

  // Optimistic photo flow: hand off to the background vision job and return the
  // pending entry immediately so the UI can show "analyzing…".
  if (isPhoto && body.imageUrl) {
    // Non-fatal: if the event bus is down the entry still exists as `pending`
    // (user can delete/retry) rather than failing the whole optimistic create.
    try {
      await inngest.send({
        name: PHOTO_ANALYZE_EVENT,
        data: { entryId: entry.id, userId, imageUrl: body.imageUrl },
      });
    } catch (err) {
      console.error("[food/entries] inngest.send failed", err);
    }
  }

  const items = await db
    .select()
    .from(foodItem)
    .where(eq(foodItem.entryId, entry.id));
  const [fresh] = await db
    .select()
    .from(foodEntry)
    .where(and(eq(foodEntry.id, entry.id), eq(foodEntry.userId, userId)));

  return Response.json({ entry: fresh, items });
});

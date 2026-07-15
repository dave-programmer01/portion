import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem } from "@/db/schema";
import { recomputeEntryTotals, cacheAiFoods } from "@/server/food";
import { analyzeFoodPhoto } from "@/server/ai";
import { config, PHOTO_ANALYZE_EVENT } from "@/config";

import { inngest } from "../client";

type PhotoEvent = {
  entryId: string;
  userId: string;
  imageUrl: string;
  // Optional "what is this?" caption the user typed — a strong hint for the
  // vision model on regional / unfamiliar dishes.
  caption?: string | null;
};

/**
 * Second half of the optimistic photo flow. The entry already exists as
 * `pending`; here we run the vision estimate, write the detected items, and
 * flip the entry to `complete` — or to `failed` if the model errors or sees no
 * food. A failure changes NO totals and burns NO quota (quota counts only
 * pending+complete photo entries); the UI offers retry / manual fallback.
 */
export const analyzeFoodPhotoJob = inngest.createFunction(
  {
    id: "analyze-food-photo",
    name: "Analyze food photo (vision)",
    triggers: [{ event: PHOTO_ANALYZE_EVENT }],
  },
  async ({ event, step }) => {
    const { entryId, userId, imageUrl, caption } = event.data as PhotoEvent;

    // Deliver a downscaled variant to the model (ImageKit transform). Harmless
    // if the client already resized; keeps the token/cost bound either way.
    const sep = imageUrl.includes("?") ? "&" : "?";
    const analyzeUrl = `${imageUrl}${sep}tr=w-${config.imageMaxPx}`;

    const analysis = await step
      .run("vision", () => analyzeFoodPhoto(analyzeUrl, userId, caption))
      .catch(() => null);

    // Model errored or found nothing edible → failed state, totals untouched.
    if (!analysis || analysis.items.length === 0) {
      await step.run("mark-failed", async () => {
        await db
          .update(foodEntry)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(foodEntry.id, entryId));
      });
      return { entryId, status: "failed" as const };
    }

    await step.run("write-items", async () => {
      // Cache confident results into the shared food_master (best-effort) and
      // link each item to its cache row so it's searchable / re-loggable later.
      const masterIds = await cacheAiFoods(analysis.items, analysis.confidence);
      await db.insert(foodItem).values(
        analysis.items.map((i, idx) => ({
          entryId,
          foodMasterId: masterIds[idx],
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          servingLabel: i.servingLabel,
          calories: i.calories,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
        })),
      );
      await recomputeEntryTotals(entryId, "complete");
      // Persist the model's confidence so the UI can flag shaky estimates.
      await db
        .update(foodEntry)
        .set({ confidence: analysis.confidence })
        .where(eq(foodEntry.id, entryId));
    });

    return { entryId, status: "complete" as const, items: analysis.items.length };
  },
);

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodEntry, foodItem } from "@/db/schema";
import { recomputeEntryTotals } from "@/server/food";
import { analyzeFoodPhoto } from "@/server/ai";
import { config, PHOTO_ANALYZE_EVENT } from "@/config";

import { inngest } from "../client";

type PhotoEvent = { entryId: string; userId: string; imageUrl: string };

/**
 * Second half of the optimistic photo flow. The entry already exists as
 * `pending`; here we run the vision estimate, write the detected items, and
 * flip the entry to `complete` — or to `failed` if the model errors or sees no
 * food. A failure changes NO totals and (once Phase 4 lands) burns NO quota;
 * the UI offers retry / manual fallback.
 */
export const analyzeFoodPhotoJob = inngest.createFunction(
  {
    id: "analyze-food-photo",
    name: "Analyze food photo (vision)",
    triggers: [{ event: PHOTO_ANALYZE_EVENT }],
  },
  async ({ event, step }) => {
    const { entryId, imageUrl } = event.data as PhotoEvent;

    // Deliver a downscaled variant to the model (ImageKit transform). Harmless
    // if the client already resized; keeps the token/cost bound either way.
    const sep = imageUrl.includes("?") ? "&" : "?";
    const analyzeUrl = `${imageUrl}${sep}tr=w-${config.imageMaxPx}`;

    const analysis = await step
      .run("vision", () => analyzeFoodPhoto(analyzeUrl))
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
      await db.insert(foodItem).values(
        analysis.items.map((i) => ({
          entryId,
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
    });

    return { entryId, status: "complete" as const, items: analysis.items.length };
  },
);

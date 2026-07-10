import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser, route } from "@/server/auth";
import { normalizeEquipment, deriveEquipmentTier } from "@/lib/equipment";

/**
 * Update the user's equipment inventory after onboarding. Equipment doesn't
 * affect calorie targets, so this is a lightweight write (no recompute) rather
 * than a full profile PUT. The legacy `equipment` tier is kept in sync.
 */
const bodySchema = z.object({ equipmentItems: z.array(z.string()) });

export const PUT = route(async (request) => {
  const userId = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid equipment" }, { status: 400 });
  }

  const items = normalizeEquipment(parsed.data.equipmentItems);
  await db
    .update(profiles)
    .set({
      equipmentItems: items,
      equipment: deriveEquipmentTier(items),
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId));

  return Response.json({ equipmentItems: items });
});

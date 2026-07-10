import { serve } from "inngest/edge";

import { inngest } from "@/inngest/client";
import { deleteUser } from "@/inngest/functions/delete-user";
import { syncUser } from "@/inngest/functions/sync-user";
import { analyzeFoodPhotoJob } from "@/inngest/functions/analyze-food-photo";
import { generateWorkoutJob } from "@/inngest/functions/generate-workout";
import { updateTier } from "@/inngest/functions/update-tier";

// The `inngest/edge` adapter is framework-agnostic: `serve` returns a plain
// (Request) => Promise<Response> handler, which is exactly what Expo Router API
// routes expect. The Inngest dev server introspects this endpoint (GET) and
// invokes functions through it (POST/PUT).
const handler = serve({
  client: inngest,
  functions: [
    syncUser,
    deleteUser,
    analyzeFoodPhotoJob,
    generateWorkoutJob,
    updateTier,
  ],
});

export function GET(request: Request) {
  return handler(request);
}

export function POST(request: Request) {
  return handler(request);
}

export function PUT(request: Request) {
  return handler(request);
}

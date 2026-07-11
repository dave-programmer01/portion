import { db } from "@/db";
import { requireUser, route } from "@/server/auth";
import { buildAccountExport } from "@/server/account-export";

/**
 * Self-service data export (GDPR/CCPA portability — the right our privacy policy
 * promises). The aggregation lives in `buildAccountExport` so it's integration-
 * tested (in particular, that it never returns another user's rows).
 */
export const GET = route(async (request) => {
  const userId = await requireUser(request);
  const payload = await buildAccountExport(db, userId);

  return Response.json(payload, {
    headers: {
      "Content-Disposition": 'attachment; filename="portion-data-export.json"',
    },
  });
});

import { requireUser, route } from "@/server/auth";
import { getUploadAuth, imagekitConfigured } from "@/server/imagekit";

/**
 * Hands the signed-in client a short-lived ImageKit upload signature so it can
 * upload the food photo directly (private key stays server-side). Also returns
 * the URL endpoint the client posts the resized image to.
 */
export const GET = route(async (request) => {
  await requireUser(request);
  if (!imagekitConfigured()) {
    return Response.json({ error: "ImageKit not configured" }, { status: 503 });
  }
  return Response.json({
    ...getUploadAuth(),
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
});

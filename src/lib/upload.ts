import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

import { config } from "@/config";

/**
 * Client-side photo prep + upload. We downscale to the configured max edge and
 * JPEG-compress BEFORE uploading (cost control for the AI vision call), then
 * push straight to ImageKit using a short-lived signature from our server — the
 * image never round-trips through our own backend.
 */

export type ImageKitAuthResponse = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
};

/** Resize the longest edge to config.imageMaxPx and compress to JPEG. */
export async function resizeForUpload(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: config.imageMaxPx });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
  });
  return out.uri;
}

export type UploadedImage = { url: string; fileId: string };

/**
 * Upload a local file to ImageKit; returns the hosted URL and its `fileId`. The
 * fileId is persisted with the food entry so the asset can be deleted later
 * (on entry delete / account deletion) — the public URL is not a delete key.
 */
export async function uploadToImageKit(
  auth: ImageKitAuthResponse,
  fileUri: string,
): Promise<UploadedImage> {
  const name = `meal_${Date.now()}.jpg`;
  const form = new FormData();
  // Expo SDK 57's global fetch/FormData are the WHATWG ("winter") ones, which
  // reject React Native's legacy { uri, name, type } file shape ("Unsupported
  // FormDataPart implementation"). A File (implements Blob) is read into the
  // multipart body directly.
  form.append("file", new File(fileUri), name);
  form.append("fileName", name);
  form.append("folder", "/portion/meals");
  form.append("publicKey", auth.publicKey);
  form.append("signature", auth.signature);
  form.append("expire", String(auth.expire));
  form.append("token", auth.token);

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`ImageKit upload failed (${res.status})`);
  const data = (await res.json()) as { url?: string; fileId?: string };
  if (!data.url || !data.fileId) throw new Error("ImageKit returned no url");
  return { url: data.url, fileId: data.fileId };
}

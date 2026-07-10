import crypto from "node:crypto";

/**
 * ImageKit client-upload auth. The private key never leaves the server: we hand
 * the client a short-lived `{ token, expire, signature }` triple (HMAC-SHA1 of
 * token+expire with the private key), which it posts alongside the file to
 * ImageKit's upload API. See ImageKit "secure client-side upload".
 */

const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

export function imagekitConfigured(): boolean {
  return !!(privateKey && publicKey && urlEndpoint);
}

export type ImageKitAuth = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
};

export function getUploadAuth(): ImageKitAuth {
  if (!privateKey || !publicKey) {
    throw new Error("ImageKit keys are not set");
  }
  const token = crypto.randomUUID();
  // Valid for 5 minutes — long enough to upload one photo, short enough to be safe.
  const expire = Math.floor(Date.now() / 1000) + 60 * 5;
  const signature = crypto
    .createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  return { token, expire, signature, publicKey };
}

/**
 * Delete uploaded images from ImageKit by fileId (bulk). Used when a food entry
 * or an entire account is deleted so meal photos don't outlive the user's data.
 * Best-effort: ImageKit auth failures / already-deleted ids must never block the
 * DB deletion, so we swallow errors here and let the caller proceed. Batched to
 * ImageKit's 100-id-per-request limit.
 */
export async function deleteImageKitFiles(fileIds: string[]): Promise<void> {
  const ids = fileIds.filter(Boolean);
  if (ids.length === 0 || !privateKey) return;

  const auth = `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const res = await fetch(
        "https://api.imagekit.io/v1/files/batch/deleteByFileIds",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ fileIds: batch }),
        },
      );
      if (!res.ok) {
        console.error(
          `[imagekit] batch delete failed (${res.status})`,
          await res.text().catch(() => ""),
        );
      }
    } catch (err) {
      console.error("[imagekit] batch delete threw", err);
    }
  }
}

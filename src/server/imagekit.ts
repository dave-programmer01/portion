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

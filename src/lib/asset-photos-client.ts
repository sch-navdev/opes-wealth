"use client";

import { createClient } from "@/utils/supabase/client";
import { ASSET_PHOTO_BUCKET, assetPhotoPath } from "@/lib/asset-photos";
import { ASSET_IMAGE_MAX_SIZE, ASSET_IMAGE_QUALITY } from "@/lib/crop-image";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Re-encodes a picked photo as a real image FILE: WEBP (smaller, keeps
 * transparency), falling back to a white-backed JPEG in a browser that can't
 * encode WEBP. The long edge is capped at `ASSET_IMAGE_MAX_SIZE` (never
 * upscaled) and the aspect ratio is kept exactly — no cropping.
 */
export async function encodeAssetPhoto(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, ASSET_IMAGE_MAX_SIZE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    const webp = await toBlob(canvas, "image/webp", ASSET_IMAGE_QUALITY);
    if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };

    // No WEBP encoder: JPEG has no alpha, so repaint on white first.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const jpeg = await toBlob(canvas, "image/jpeg", ASSET_IMAGE_QUALITY);
    if (!jpeg) throw new Error("Could not encode the image.");
    return { blob: jpeg, ext: "jpg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Uploads one photo to the `asset-photos` bucket under the signed-in user's own
 * folder (`<user id>/<uuid>.webp`, enforced by the bucket's storage policies)
 * and returns its public URL — the only thing stored in `assets.images`.
 * Throws an Error with a user-presentable message on failure.
 */
export async function uploadAssetPhoto(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to upload a photo.");

  const { blob, ext } = await encodeAssetPhoto(file);
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(ASSET_PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "31536000", // file names are unique and never overwritten: cache for a year
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(ASSET_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Deletes a photo the user uploaded in this editing session but never saved
 * (removed again, or the dialog was dismissed). Runs as the user, so the
 * bucket policy only lets it touch their own folder. Best effort.
 */
export async function discardUploadedPhoto(url: string): Promise<void> {
  const path = assetPhotoPath(url);
  if (!path) return;
  try {
    await createClient().storage.from(ASSET_PHOTO_BUCKET).remove([path]);
  } catch {
    // An orphaned file is harmless.
  }
}

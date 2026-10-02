"use client";

import { createClient } from "@/utils/supabase/client";
import { ASSET_PHOTO_BUCKET, assetPhotoPaths } from "@/lib/asset-photos";
import {
  ASSET_IMAGE_MAX_SIZE,
  ASSET_IMAGE_QUALITY,
  ASSET_THUMB_MAX_SIZE,
  ASSET_THUMB_QUALITY,
} from "@/lib/crop-image";

type Variant = { blob: Blob; ext: "webp" | "jpg" };

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

/** Draws `image` scaled so its long edge is at most `maxSize` (never upscaled, never cropped) and encodes it. */
async function encode(
  image: HTMLImageElement,
  maxSize: number,
  quality: number,
  forceJpeg: boolean,
): Promise<Variant> {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
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

  if (!forceJpeg) {
    const webp = await toBlob(canvas, "image/webp", quality);
    if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  }
  // No WEBP encoder (or already decided on JPEG): JPEG has no alpha, so repaint on white.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("Could not encode the image.");
  return { blob: jpeg, ext: "jpg" };
}

/**
 * Turns a picked photo into TWO real image files: the full picture (long edge ≤
 * 1440px) and a small thumbnail (≤ 192px, ≈ 5–15 KB) for the lists and avatars.
 * Both keep the original aspect ratio — no cropping — and share one format
 * (WEBP, or JPEG in a browser that can't encode WEBP) so the thumbnail's file
 * name can be derived from the photo's URL (`<uuid>.webp` → `<uuid>-thumb.webp`).
 */
export async function encodeAssetPhoto(file: File): Promise<{ full: Variant; thumb: Variant }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const full = await encode(image, ASSET_IMAGE_MAX_SIZE, ASSET_IMAGE_QUALITY, false);
    const thumb = await encode(image, ASSET_THUMB_MAX_SIZE, ASSET_THUMB_QUALITY, full.ext === "jpg");
    return { full, thumb };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Uploads a photo and its thumbnail to the `asset-photos` bucket under the
 * signed-in user's own folder (`<user id>/<uuid>.webp` and
 * `<uuid>-thumb.webp`, enforced by the bucket's storage policies) and returns
 * the FULL photo's public URL — the only thing stored in `assets.images`; the
 * thumbnail URL is derived from it (`photoThumbUrl`). If the thumbnail fails,
 * the full file is removed again so no half-uploaded photo is left.
 * Throws an Error with a user-presentable message on failure.
 */
export async function uploadAssetPhoto(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to upload a photo.");

  const { full, thumb } = await encodeAssetPhoto(file);
  const base = `${user.id}/${crypto.randomUUID()}`;
  const fullPath = `${base}.${full.ext}`;
  const thumbPath = `${base}-thumb.${thumb.ext}`;
  const bucket = supabase.storage.from(ASSET_PHOTO_BUCKET);
  // File names are unique and never overwritten: cache for a year.
  const options = (blob: Blob) => ({ contentType: blob.type, cacheControl: "31536000", upsert: false });

  const { error: fullError } = await bucket.upload(fullPath, full.blob, options(full.blob));
  if (fullError) throw new Error(fullError.message);
  const { error: thumbError } = await bucket.upload(thumbPath, thumb.blob, options(thumb.blob));
  if (thumbError) {
    await bucket.remove([fullPath]);
    throw new Error(thumbError.message);
  }

  return bucket.getPublicUrl(fullPath).data.publicUrl;
}

/**
 * Deletes a photo (and its thumbnail) the user uploaded in this editing session
 * but never saved (removed again, or the dialog was dismissed). Runs as the
 * user, so the bucket policy only lets it touch their own folder. Best effort.
 */
export async function discardUploadedPhoto(url: string): Promise<void> {
  const paths = assetPhotoPaths(url);
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(ASSET_PHOTO_BUCKET).remove(paths);
  } catch {
    // An orphaned file is harmless.
  }
}

import type { Area } from "react-easy-crop";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Crops `imageSrc` to `cropAreaPixels`, then downscales it to fit within
 * `maxSize` x `maxSize` and re-encodes it as a JPEG data URL, so the
 * resulting Base64 string stored in `profiles.avatar_base64` stays small.
 */
export async function getCroppedImage(
  imageSrc: string,
  cropAreaPixels: Area,
  maxSize = 400,
  quality = 0.8,
): Promise<string> {
  const image = await loadImage(imageSrc);

  const outputSize = Math.min(maxSize, cropAreaPixels.width, cropAreaPixels.height) || maxSize;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get a 2D canvas context.");
  }

  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL("image/jpeg", quality);
}

/** Asset photos: long edge, and JPEG quality (was 400px / 0.8, which blurred photos). */
export const ASSET_IMAGE_MAX_SIZE = 1440;
export const ASSET_IMAGE_QUALITY = 0.9;

/**
 * LEGACY: encodes a photo as a base64 data URL. Asset photos are now uploaded as
 * files to Supabase Storage (`lib/asset-photos-client.ts`); this remains for
 * anything that still needs an inline string.
 *
 * Reads `file`, downscales it ONLY if its long edge exceeds `maxSize`
 * (never upscales, never crops — the original aspect ratio is kept exactly),
 * and re-encodes it as a JPEG data URL. Unlike `getCroppedImage`, there's no
 * crop step — used for the asset image/logo uploader. Transparent areas (PNG
 * logos) are painted white first, because JPEG has no alpha and would
 * otherwise turn them black. Defaults suit photos: 1440px at 0.9 quality is
 * typically 0.3–0.7 MB each (3 per asset, well inside the 5 MB action limit).
 */
export async function resizeImageToBase64(
  file: File,
  maxSize = ASSET_IMAGE_MAX_SIZE,
  quality = ASSET_IMAGE_QUALITY,
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await loadImage(rawDataUrl);

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get a 2D canvas context.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

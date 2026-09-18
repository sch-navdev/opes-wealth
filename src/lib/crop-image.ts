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

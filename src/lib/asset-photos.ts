/**
 * Asset photos live in the public Supabase Storage bucket `asset-photos`
 * (migration 0027); `assets.images` stores each photo's PUBLIC URL. Pure helpers
 * shared by the browser uploader, the server actions and the migration script.
 *
 * Legacy rows still hold `data:image/...` base64 strings until
 * `scripts/migrate-asset-images.mts` has moved them; both forms render fine
 * (they are just `<img src>` values), and the server accepts both while the
 * migration is in progress.
 */
export const ASSET_PHOTO_BUCKET = "asset-photos";

/** Biggest legacy base64 string still accepted on save (≈1.8 MB of image). */
const MAX_LEGACY_DATA_URI = 2_500_000;

/** `<supabase url>/storage/v1/object/public/asset-photos/` — every valid photo URL starts with this. */
export function assetPhotoUrlPrefix(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${ASSET_PHOTO_BUCKET}/` : null;
}

export function isLegacyDataUri(src: string): boolean {
  return src.startsWith("data:image/");
}

/**
 * Whether a string may be stored in `assets.images`: a photo in OUR bucket, or
 * (during the migration) a size-capped legacy data URI. Anything else — an
 * arbitrary external URL would be loaded by every co-owner's browser — is refused.
 */
export function isAllowedPhotoSrc(src: string, supabaseUrl?: string): boolean {
  if (typeof src !== "string") return false;
  if (isLegacyDataUri(src)) return src.length <= MAX_LEGACY_DATA_URI;
  const prefix = assetPhotoUrlPrefix(supabaseUrl);
  return !!prefix && src.startsWith(prefix) && !src.includes("..") && !/[?#]/.test(src.slice(prefix.length));
}

/** Storage object path (`<user id>/<file>`) of one of our photo URLs, or null. */
export function assetPhotoPath(src: string, supabaseUrl?: string): string | null {
  const prefix = assetPhotoUrlPrefix(supabaseUrl);
  if (!prefix || !src.startsWith(prefix)) return null;
  const path = decodeURIComponent(src.slice(prefix.length));
  return path && !path.includes("..") ? path : null;
}

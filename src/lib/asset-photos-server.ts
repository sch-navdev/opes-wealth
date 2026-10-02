import { createServiceClient } from "@/utils/supabase/service";
import { ASSET_PHOTO_BUCKET, assetPhotoPaths } from "@/lib/asset-photos";
import { DEMO_USER_ID } from "@/lib/demo-mode";

/**
 * Deletes photo files from the bucket after they stop being referenced (a photo
 * removed in an edit, or an asset deleted). Best-effort: a failure only leaves
 * an orphaned file, never breaks the user's action. Only URLs that point into
 * OUR bucket are touched; base64 strings and anything else are ignored.
 * Server-only (service role: the asset's creator may be deleting photos a
 * co-owner uploaded into another user's folder).
 */
export async function removeAssetPhotos(urls: string[]): Promise<void> {
  // The read-only demo account's photos are never deleted (files live in <user id>/…).
  const paths = urls.flatMap((u) => assetPhotoPaths(u)).filter((p) => !p.startsWith(`${DEMO_USER_ID}/`));
  if (paths.length === 0) return;
  try {
    await createServiceClient().storage.from(ASSET_PHOTO_BUCKET).remove(paths);
  } catch {
    // Orphaned files are harmless; ignore.
  }
}

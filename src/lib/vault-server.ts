/**
 * Server-only vault cleanup used when an asset is deleted: the document ROWS cascade with the asset,
 * but the stored objects do not, so the caller must collect the paths BEFORE deleting the asset and
 * remove the objects afterwards (best-effort, like `removeAssetPhotos`). Service role: the objects sit
 * in each uploader's own folder, which the asset's creator cannot reach with a user session.
 *
 * NOT YET WIRED into `deleteAsset` / `batchDeleteAssets` (src/app/dashboard/actions.ts, shared file):
 * see tracker/Governance-Vault.md, open items.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import { VAULT_BUCKET, isUuid } from "@/lib/vault";

/** Storage paths of every document attached to `assetIds` (call before deleting the assets). */
export async function collectVaultPaths(assetIds: string[], service: SupabaseClient = createServiceClient() as unknown as SupabaseClient): Promise<string[]> {
  const ids = assetIds.filter(isUuid);
  if (ids.length === 0) return [];
  try {
    const { data, error } = await service.from("asset_documents").select("storage_path").in("asset_id", ids).limit(5000);
    if (error) return [];
    return ((data ?? []) as { storage_path: unknown }[]).map((r) => r.storage_path).filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

/** Removes the objects; an orphan is harmless compared with a failed asset delete, so errors are swallowed. */
export async function removeVaultObjects(paths: string[], service: SupabaseClient = createServiceClient() as unknown as SupabaseClient): Promise<number> {
  if (paths.length === 0) return 0;
  try {
    const { data } = await service.storage.from(VAULT_BUCKET).remove(paths);
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

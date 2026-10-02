-- 0027_asset_photos_bucket.sql
-- Opes Wealth: asset photos move from base64 strings inside `assets.images` to
-- real files in Supabase Storage. `assets.images` (text[]) now holds the PUBLIC
-- URLs of those files (…/storage/v1/object/public/asset-photos/<user id>/<file>).
--
-- Bucket `asset-photos`:
--   * public       — photos are served by URL without signing (what was asked for;
--                    anyone who has a URL can open it, URLs are unguessable UUIDs
--                    and are only ever shown to the asset's owners);
--   * 3 MB limit   — the app resizes to ≤1440px WEBP/JPEG (typically 0.2–0.7 MB);
--   * webp / jpeg  — the only types the app produces.
-- Write access is limited to a user's OWN folder: the first path segment must be
-- their auth.uid(). There is no select policy, so nobody can LIST the bucket
-- (public URLs work without one). Idempotent: safe to re-run.
-- Existing base64 photos are moved by scripts/migrate-asset-images.mts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-photos', 'asset-photos', true, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "asset_photos_insert_own_folder" on storage.objects;
create policy "asset_photos_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "asset_photos_update_own_folder" on storage.objects;
create policy "asset_photos_update_own_folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "asset_photos_delete_own_folder" on storage.objects;
create policy "asset_photos_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

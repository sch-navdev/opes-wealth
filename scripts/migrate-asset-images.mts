/**
 * One-off data migration: moves asset photos stored as base64 strings in
 * `assets.images` into real files in the Supabase Storage bucket `asset-photos`
 * and rewrites `images` to hold their public URLs (migration 0027 creates the
 * bucket and its policies — apply it first).
 *
 *   node --env-file=.env.local scripts/migrate-asset-images.mts            # dry run: reads only, prints what it would do
 *   node --env-file=.env.local scripts/migrate-asset-images.mts --yes      # upload + update rows
 *
 * Safe to re-run: only `data:image/...` entries are converted (URLs are left
 * alone), and a row is updated only AFTER all its photos uploaded. Files go to
 * `<asset owner id>/<uuid>.<ext>` with the image's original bytes (WEBP/JPEG are
 * not re-encoded, so nothing is lost; a PNG is converted to WEBP because the bucket
 * only accepts WEBP/JPEG), plus a `<uuid>-thumb.<ext>` thumbnail (≤192px) made with
 * `sharp`, matching what the browser uploader produces. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (the service role bypasses RLS and storage policies).
 * Uses Node's built-in TypeScript support, so only erasable syntax is allowed.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "asset-photos";
const EXT: Record<string, "webp" | "jpg"> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "webp" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).");

const apply = process.argv.includes("--yes");
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log(`Target project: ${new URL(url).host} (${apply ? "WRITING" : "dry run"})`);

const { data: rows, error } = await db.from("assets").select("id, profile_id, name, images").not("images", "eq", "{}");
if (error) throw error;

let assetsToMove = 0;
let photosToMove = 0;
let bytes = 0;
for (const row of rows ?? []) {
  const images: string[] = row.images ?? [];
  const legacy = images.filter((s) => s.startsWith("data:image/"));
  if (legacy.length === 0) continue;
  assetsToMove += 1;
  photosToMove += legacy.length;
  for (const s of legacy) bytes += Math.round(((s.length - s.indexOf(",") - 1) * 3) / 4);
}
console.log(`${assetsToMove} asset(s) with ${photosToMove} base64 photo(s), about ${(bytes / 1024 / 1024).toFixed(1)} MB, to move to the "${BUCKET}" bucket.`);

if (!apply) {
  console.log("Dry run: nothing written. Re-run with --yes to migrate.");
} else {
  let moved = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const images: string[] = row.images ?? [];
    if (!images.some((s) => s.startsWith("data:image/"))) continue;

    const uploadedPaths: string[] = [];
    const next: string[] = [];
    let ok = true;
    for (const src of images) {
      if (!src.startsWith("data:image/")) {
        next.push(src);
        continue;
      }
      const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(src);
      const mime = match?.[1]?.toLowerCase() ?? "";
      if (!match || !EXT[mime]) {
        console.log(`  ! ${row.name}: unsupported image format, left as is`);
        next.push(src);
        continue;
      }
      const ext = EXT[mime];
      const base = `${row.profile_id}/${randomUUID()}`;
      const path = `${base}.${ext}`;
      const thumbPath = `${base}-thumb.${ext}`;
      const original = Buffer.from(match[2], "base64");
      // WEBP/JPEG keep their original bytes; a PNG becomes WEBP (the bucket's allowed types).
      const full = mime === "image/png" ? await sharp(original).webp({ quality: 90 }).toBuffer() : original;
      const thumbPipe = sharp(original).resize({ width: 192, height: 192, fit: "inside", withoutEnlargement: true });
      const thumb = ext === "webp" ? await thumbPipe.webp({ quality: 80 }).toBuffer() : await thumbPipe.jpeg({ quality: 80 }).toBuffer();
      const contentType = ext === "webp" ? "image/webp" : "image/jpeg";
      const opts = { contentType, cacheControl: "31536000", upsert: false };
      const { error: upError } = await db.storage.from(BUCKET).upload(path, full, opts);
      const { error: thumbError } = upError ? { error: null } : await db.storage.from(BUCKET).upload(thumbPath, thumb, opts);
      if (upError || thumbError) {
        console.log(`  ! ${row.name}: upload failed (${(upError ?? thumbError)?.message})`);
        if (!upError) await db.storage.from(BUCKET).remove([path]);
        ok = false;
        break;
      }
      uploadedPaths.push(path, thumbPath);
      next.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      next.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }

    if (!ok) {
      // Don't leave half a set uploaded: remove what this row uploaded, keep its base64 photos.
      if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths);
      failed += 1;
      continue;
    }
    const { error: updError } = await db.from("assets").update({ images: next }).eq("id", row.id);
    if (updError) {
      console.log(`  ! ${row.name}: row update failed (${updError.message})`);
      await db.storage.from(BUCKET).remove(uploadedPaths);
      failed += 1;
      continue;
    }
    moved += 1;
    console.log(`  ✓ ${row.name}: ${uploadedPaths.length / 2} photo(s) moved`);
  }
  console.log(`Done: ${moved} asset(s) migrated, ${failed} failed.`);
}

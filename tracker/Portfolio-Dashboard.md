[[PROJECT_TRACKER|← Project Tracker]]

# Portfolio Dashboard

**Status:** Done (foundation) — Phase 1, Step 7. Extended with edit/delete and multi-currency display.

## Foundation
- `src/app/dashboard/actions.ts` — server action `addAsset(formData)`: reads `name`, `category_id`, `quantity`, `current_value`, `currency` (default `'USD'`) from the form, resolves the current user via `getUser()`, inserts into `assets` with `profile_id` set to that user's id, and calls `revalidatePath('/dashboard')` on success.
- `src/components/add-asset-dialog.tsx` — Client Component using shadcn `Dialog`/`Select`/`Input`/`Label`. Submits `addAsset` via a client-driven `startTransition` (not a bare form `action`) so it can show inline errors and close the dialog only on success. Category dropdown is populated from the `asset_categories` passed in as a prop.
- `src/app/dashboard/page.tsx` — now also queries `asset_categories` (all rows, for the dropdown) and the signed-in user's own `assets` (joined with `asset_categories(name)`), in parallel. Renders `AddAssetDialog` at the top of the page and a shadcn `Table` of the user's assets below it (Name / Category / Quantity / Value, liabilities shown in destructive red with a leading `-`). Empty state shown when there are no assets yet.
- Installed shadcn `dialog`, `select`, `table` components (`src/components/ui/`); fixed the same CLI `cn`-package import issue as previous component installs.
- **Resolved**: the missing-`profiles`-row gap that would have made `addAsset` fail with a foreign-key violation is now fixed by `supabase/migrations/0002_user_profile_trigger.sql` (see [[Database-Schema|Database Schema]]).
- Not yet verified against a live Supabase instance (dev server was only exercised while signed out, since these routes are visible only to newly-verified sessions and no test account/schema deployment was available in this session).

## Edit/Delete Asset Actions
`src/app/dashboard/actions.ts` gained `updateAsset(id, formData)` (same field extraction as `addAsset`, `.update(...).eq('id', id).eq('profile_id', user.id)`, `revalidatePath('/dashboard', 'layout')`) and `deleteAsset(id)` (same ownership-scoped `.delete()`). Both re-check `profile_id = user.id` explicitly in addition to relying on RLS, so a row that isn't the caller's own is a no-op rather than a surprise. `add-asset-dialog.tsx` now accepts an optional `asset` prop; when present it's in edit mode — every field is pre-filled from that asset (including [[Real-Estate-Multi-Currency|Real Estate]] metadata), the trigger becomes an `Edit`-icon-only button instead of "Add Asset", the title/description/submit-button text switch to "Edit Asset"/"Save Changes", and submission calls `updateAsset(asset.id, formData)` instead of `addAsset`. Installed shadcn `alert-dialog` (same `cn`-import fix as before); `src/components/delete-asset-button.tsx` wraps it — clicking the `Trash2`-icon button opens a double-confirmation dialog ("Are you sure you want to delete this asset? This action cannot be undone."), and `AlertDialogAction`'s `onClick` calls `e.preventDefault()` before running `deleteAsset` so the dialog stays open while the delete is pending and only closes on success (Radix's `Action` would otherwise close it immediately on click). `dashboard/page.tsx`'s table gained a right-aligned "Actions" column rendering both per row.

Verified visually in the browser (via a disposable local-only preview route, removed before committing): editing a sample Real Estate asset correctly pre-fills every field and the button reads "Save Changes"; the delete button opens the exact confirmation copy requested.

## Asset Image / Logo
- `supabase/migrations/0005_asset_image.sql` adds `assets.image_base64` (`text`, nullable) — see [[Database-Schema|Database Schema]].
- `src/lib/crop-image.ts` gained `resizeImageToBase64(file, maxSize = 400, quality = 0.8)`: reads the file, downscales it (preserving aspect ratio, no crop step) to fit within 400×400, and re-encodes as a JPEG data URL — a simpler sibling of `getCroppedImage` (used by the circular profile-avatar cropper in [[Profile-Settings|Profile & Settings]], which does crop).
- `add-asset-dialog.tsx` — new "Image / Logo" field at the top of the form: a rounded-square `Avatar` preview (falls back to the selected category's first letter), an "Upload Image"/"Change Image" button, and a remove (×) button once an image is set. Selecting a file resizes it via `resizeImageToBase64` into state, mirrored into a hidden `image_base64` form input. In edit mode, `AssetForEdit` carries `image_base64` so the preview pre-fills from the existing asset; `resetState()` reverts it on cancel like every other field.
- `src/app/dashboard/actions.ts` — `addAsset`/`updateAsset` now also read `image_base64` from the form and write it straight through to the `assets.image_base64` column (same opaque-passthrough pattern as `metadata`).
- `dashboard/page.tsx` — the Name column now shows a small rounded-square `Avatar` to the left of the name: the asset's `image_base64` if set, otherwise a `Building2` icon for Real Estate or the category's first letter for anything else.
- Verified interactively via a disposable preview route: uploading a test image correctly resized/previewed it and swapped the button to "Change Image" with a remove control; clicking remove reverted to the placeholder and "Upload Image". Not yet verified against a live Supabase instance.

## Related
- [[Database-Schema|Database Schema]] — `assets` table, `profiles` trigger
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — Real Estate sub-form rendered inside the Add/Edit dialog, FX conversion of the Value column
- [[Design-System|Design System]] — theme tokens used by the table/dialog
- [[Profile-Settings|Profile & Settings]] — shares the resize/compress-to-Base64 image pipeline with the profile avatar uploader

[[PROJECT_TRACKER|← Project Tracker]]

# Governance Vault

Documents (title deed, insurance, trust deed, tax, valuation, ID, contract, other) attached to an asset, stored in a **private** bucket, with expiry reminders in the notification bell. Module 3 of [[UHNW-Modules-Plan|the UHNW modules plan]]. Related: [[Co-Ownership|Co-Ownership]] (who counts as a co-owner), [[Authentication-Security|Authentication & Security]] (MFA step-up), [[Database-Schema|Database Schema]].

**Status (2026-10-09): code written and unit-tested with mocks. Migration 0038 is a DRAFT and has NOT been applied; the bucket does not exist; nothing has run against a real database or bucket.** Until 0038 is applied the Documents tab shows "not available yet" and the cron reports `available:false`.

## Decisions (Steve, 2026-10-08)
Private bucket, signed URLs, MFA step-up, 15 MB, PDF + PNG/JPEG only, `owner_only` flag (co-owners see by default), Professional tier and up, expiry notifications by cron.

## What was built
- `supabase/migrations/0038_governance_vault.sql` (draft): `asset_documents`, `document_access_log`, private bucket `governance-vault` (15 MB, pdf/png/jpeg), `storage.objects` policies scoped to `<profile_id>/<asset_id>/`, demo read-only restrictive policies, `notifications.kind` widened to add `document_expiry`, unique index `notifications_document_expiry_once`.
- `src/lib/vault.ts` (pure: magic bytes, size, name sanitising, path building, expiry maths, DTO), `src/lib/vault-labels.ts` (English text + typed keys), `src/lib/vault-expiry.ts` (threshold planning), `src/lib/vault-expiry-server.ts` (cron body), `src/lib/vault-server.ts` (cleanup helpers, not wired, see open items).
- `src/app/dashboard/vault-actions.ts`: `listDocuments`, `uploadDocument`, `getDocumentUrl` (60 s), `updateDocument`, `deleteDocument`.
- `src/components/vault/vault-documents.tsx` (Chronograph list, upload/edit dialog, delete confirm), `vault-text.ts` (translator with English fallback). Wired in `asset-detail-view.tsx` as a "Documents" tab for Professional and Expert (lazy via `asset-detail/lazy.tsx`). 21st.dev "File Upload" used as the pattern (type-validated drop surface + compact list), adapted, no code copied.
- `src/app/api/cron/document-expiry/route.ts` + `vercel.json` entry (`45 6 * * *`). Bell: `notifications.ts` / `notifications-bell.tsx` know `document_expiry` (two messages: expiring within 60/30/7 days, expired).
- `next.config.ts`: server action body limit raised 5 mb to 16 mb (needed for 15 MB uploads; global).
- Assistant knowledge updated (`chat-knowledge.ts`). New strings: `tmp-i18n-vault.json` (57 keys, 9 languages) to be merged into the dictionaries; until then the UI falls back to English.

## Model
`asset_documents.profile_id` is the document OWNER (the member who uploaded). Any member of the asset may upload; the file lives in that member's folder. Co-owners see a document unless `owner_only`; only the owner edits or deletes. Browser sessions can read objects only in their own folder; co-owners reach a file only through a server-issued signed URL.

## Security review (attacker view)
| Area | Finding | Status |
|---|---|---|
| Path traversal | Storage path is built server-side from three validated UUIDs and a sanitised stem; client names contribute only `[A-Za-z0-9-]`, extension comes from the detected type. DB check constraint also requires `<profile_id>/<asset_id>/%`. `isOwnPath` re-checks the stored path before signing or removing. | Fixed + tested |
| IDOR on ids | Document, asset ids are UUID-validated; every lookup is by id AND visibility (RLS + `visibleDocuments` + membership check in code). Update/delete add `.eq("profile_id", user)`. | Fixed + tested |
| Enumeration | Missing, not-yours, owner-only-for-you, wrong path all return the same `vault_err_not_found`. Error strings are fixed keys, never DB messages. | Fixed + tested |
| Mime spoofing | Type from magic bytes (PDF, PNG, JPEG signature at byte 0), never the client mime or extension; content type at upload is the detected one; SVG/HTML/GIF/zip refused; bucket also enforces `allowed_mime_types`. | Fixed + tested (bucket enforcement unverified) |
| Signed URL leakage | 60 s TTL, issued only after the access-log row is written (fail closed), never stored, storage path never sent to the browser, opened with `rel="noopener noreferrer"` in a new tab. Residual: a link can be forwarded within its 60 s; files are served from the Supabase domain, not the app origin, so PDF scripts cannot touch the app session. | Accepted residual |
| Co-owner sees owner-only | RLS select policy + `visibleDocuments` in code + `getDocumentUrl` uses the same finder; log insert policy cannot reference a row the actor cannot see. Storage policies give co-owners no object access at all. | Fixed + tested (RLS untested on a real DB) |
| Log tampering | No update/delete grants or policies; insert only as yourself, only for a visible document whose owner matches; owner column denormalised so the delete entry survives the row (`on delete set null`). A co-owner could still add many genuine "view" lines to an owner's log (noise, not forgery). Service role can edit anything (inherent). | Fixed; noise accepted |
| RLS gaps | Column-level update grant limited to title, doc_type, expires_on, owner_only (path/owner/asset/mime/size immutable). Storage has no update policy (no overwrite). Demo account blocked on both tables + storage (0032). Insert policy requires `is_asset_member`. | Draft, unverified |
| Ex co-owner | A removed co-owner keeps read/delete access to documents THEY uploaded (own folder). The asset creator cannot see their owner-only ones. | Open (decide policy) |
| Asset deletion | Rows cascade but storage objects do not: orphaned files. `vault-server.ts` has `collectVaultPaths` / `removeVaultObjects`; not yet called from `deleteAsset` / `batchDeleteAssets` (shared `dashboard/actions.ts`). | Open: wire it |
| Cron auth | `Authorization: Bearer $CRON_SECRET` required, refuses when the secret is unset; plain string compare like the sibling crons (not constant-time). Response and log are counts only. | OK, same as siblings |
| Cron idempotence | Dedupe by (document, threshold, expiry date) read from existing notifications, plus a unique index as the race guard. Renewing the date re-arms reminders. Ids are chunked (100) to keep PostgREST URLs short. | Tested with fakes; the `data->>document_id` `in.()` filter is unverified on real PostgREST |
| Unbounded uploads | Per asset 50, per user 500 documents, per user 2 GB total (counted from the caller's own rows); 15 MB per file, checked on `file.size` before the bytes are read, then on the bytes. The 16 MB action body limit is global (any server action now accepts a larger body). No rate limit on request frequency. | Fixed; rate limit open |
| MFA / demo | All five actions require the same step-up gate as other sensitive actions (a read also needs it: it lists titles); writes refuse the demo user. Mock auth only in dev. | Fixed + tested |
| No malware scan | Stated limitation (no scanner in the stack). | Accepted |
| Encryption | Supabase at-rest only; no app-level or customer-managed keys in v1. Files never go to the chat or any third party; the server never logs titles, paths or user ids. | As planned |

## Verified by tests (mocks only)
`src/lib/vault.test.ts` (magic bytes, size, sanitising, path building and `isOwnPath`, metadata validation, expiry classes, DTO has no path, i18n file complete and placeholder-consistent), `src/app/dashboard/vault-actions.test.ts` (ownership, co-owner owner-only filtering, demo and MFA refusal, caps, rollback on failed insert, log-before-sign and fail-closed, 60 s TTL, delete order), `src/lib/vault-expiry.test.ts` (thresholds, idempotence, renewal, counts-only, notification kind), `src/app/api/cron/document-expiry/route.test.ts` (auth, counts-only log), `src/components/vault/vault-documents.test.tsx` (empty, unavailable, error, badges, owner-only lock, noopener open, delete confirm, upload payload). `tsc --noEmit` and eslint clean on these files.

## NOT verified
Migration 0038 never run (syntax, the `like profile_id::text || ...` check constraint, policy behaviour, the `do $$` block, `storage.foldername`); bucket creation and its mime/size enforcement; a real upload (action body limit, Supabase storage RLS with the user JWT), a real signed URL and its Content-Type in a browser; MFA step-up in a browser; the cron on Vercel; the bell rendering a real reminder; the Documents tab visually (no browser used); non-English text (strings only in `tmp-i18n-vault.json`, not merged).

## To apply (Steve)
1. Merge `tmp-i18n-vault.json` into the dictionaries. 2. Run 0038 in the Supabase SQL editor; confirm the bucket is private. 3. Check `CRON_SECRET` is set. 4. Upload, view, download, delete a test PDF as owner and as co-owner (owner-only on and off).

## Open items
Wire storage cleanup into asset deletion; decide policy for ex-co-owner documents; optional per-user request rate limit; an "expiring soon" row in Data quality (planned, not built); entity-page Documents tab (entities are assets, so the same tab already applies where the asset page is used).

[[PROJECT_TRACKER|← Project Tracker]]

# Co-Ownership & Approval Workflow

**Status:** built and type-checked (2026-10-02, OW11); **migration `0025_co_ownership.sql` is NOT applied and the database side has not been exercised** — see "Verification" for exactly what was and was not tested.

## What it does
- An asset can have several owners with percentages totalling exactly 100%. The creator (`assets.profile_id`) stays the owner of record; co-owners are registered users (linked by email) or just a name + email until they sign up.
- Every dashboard total is **pro-rata**: an asset worth $1M that you own 50% of counts as $500k in net worth, categories, charts, passive income, DCC and the Excel export.
- Editing a shared asset goes through approval when another **registered** co-owner exists; otherwise it applies immediately (so an unregistered co-owner can never block an edit).
- Pending edits that nobody answers are applied automatically after 7 days.

## Database (migration 0025, idempotent)
- **`asset_owners`**: `asset_id`, `profile_id` (null until registered), `name`, `email`, `ownership_percentage` (0 < p ≤ 100), `is_creator`, `invited_at`. Unique per (asset, profile) and per (asset, lower(email)). **An asset with no rows is 100% the creator's** (every pre-existing asset), so nothing was backfilled.
- **`asset_change_requests`**: `asset_id`, `requested_by`, `proposed_payload` JSONB (`{ fields, owners? }`), `status` (pending / approved / rejected), `auto_approved`, `created_at`, `expires_at` (default now() + 7 days), `resolved_at`.
- **`change_approvals`**: one row per registered co-owner who must approve (`pending` / `approved` / `rejected`, `decided_at`), unique per request + profile.
- **RLS:** co-owners get **read** access to `assets`, `asset_history`, `asset_owners`, requests and their approval rows through the security-definer helper `is_asset_member(asset_id)` (a plain cross-reference between `assets` and `asset_owners` policies would recurse). **No write policies** on the new tables, and no co-owner write policy on `assets`: creation, owner changes, approvals and the application of a change all run in server code with the service role after the app has authorised the user. The 100% total is validated by the app (`lib/ownership.ts`), not by a DB constraint, because rows are written one request at a time.
- **Signup linking:** trigger `link_pending_co_owners` on `profiles` insert sets `profile_id` on every `asset_owners` row whose email matches the new user's, so shared assets appear on their dashboard at once. It covers an invited user accepting and a person who registers on their own. `profile_id_for_email(text)` (service role only) resolves an email to an account.

## Code map
- `src/lib/ownership.ts` (pure): `validateOwners`, `ownershipFactor`, `otherRegisteredOwners`, and **`scaleAssetForOwner(asset, f)`** — current value always; money fields per category (real estate incl. loan, payment schedule, rents and expenses; vehicles; private equity calls/distributions; brokerage trades and income; SCPI dividends); `quantity` for unit-based categories. Per-unit prices, rates, areas and dates are untouched.
- `src/lib/shared-assets/load.ts`: loads assets shared with the user, factors, scaling; used by the dashboard, the Excel export and the Companies page. `src/lib/shared-assets/server.ts` (service role): owners + invites (`replaceOwners`, `inviteCoOwner`), `routeAssetEdit`, `applyChangeRequest`, `respondToApproval`, `expirePendingRequests`, `loadPendingApprovals`.
- `src/lib/asset-history-sync.ts`: `syncAssetHistory` moved out of the `"use server"` actions file (exporting it there would have made it a callable server action) so an approved change writes the same history points as a normal edit.
- `addAsset` / `updateAsset` (`dashboard/actions.ts`) validate and persist owners and route shared edits; `dashboard/ownership-actions.ts` has `respondToChangeRequest`.
- UI: **Ownership & co-owners** section (`components/ownership-fields.tsx`: name, email, % per owner, live total, must be 100) in the Add/Edit modal for every category; **approvals bell** in the dashboard header (`components/approvals-bell.tsx`: count badge, what each edit changes, auto-apply date, Accept / Reject); an ownership summary on the asset page; the "waiting for approval" notice in the modal.
- Cron: `/api/cron/expire-changes` (`vercel.json`, daily 06:30 UTC, same `CRON_SECRET` bearer protection as the bug-report cron) applies expired pending requests and flags them `auto_approved`.

## Rules worth knowing
- **Who approves:** every other registered owner of the asset. Any single rejection rejects the request; the last approval applies it. A co-owner's own edit always needs the creator (they cannot write `assets` directly). One pending request per asset at a time (a second edit is refused until the first is decided).
- **Owner changes** travel in the same payload, so changing shares of a shared asset is approved like any edit; the creator row cannot be removed.
- **Invites:** adding an email with no account calls Supabase Auth's invite (`CO_OWNER_INVITE_EMAILS=off` disables sending). The invite uses the project's invite email template (customise it in the Supabase dashboard) and redirects to `/auth/callback?next=/dashboard`, which must be in the allowed redirect URLs. An email that already has an account is linked immediately and gets no email — the shared asset and the approvals bell are their notice.

## Deviations from the brief
- **Vercel cron instead of pg_cron / an edge function:** the repo already schedules its jobs through `vercel.json`, and the apply step must reuse the TypeScript history/owner logic, which a SQL cron function would duplicate. It needs `CRON_SECRET` set on Vercel (as for the bug-report cron).
- The asset **detail page shows whole-asset figures** (it is also where co-owners edit the totals), with a banner saying the dashboard counts the viewer's share; dashboards, exports, DCC and Companies are pro-rata.

## Verification
- **Done:** `tsc`, `eslint`, `next build`; a disposable `tsx` check (deleted) of the pure logic — ownership validation (50/50, 67/33, 33.34+33.33+33.33 pass; 90%, 110%, bad/duplicate emails, no creator, 0% fail), factors, **$1M at 50% = $500k**, a half-owned property's value, loan, rent and passive income all halved with the input untouched, shares scaling for brokerage holdings.
- **The brief's test scenario** (a property shared 50% with "Von", a company shared 33% with Jamie Taylor, a vehicle shared with a non-user email) is in the demo seed as owner rows for three **unregistered** co-owners (`scripts/seed-demo.mts`; no emails, no approvals). It was **skipped** on the last run because 0025 isn't applied; it needs that migration.
- **NOT tested:** the whole database path — the migration itself (RLS, trigger, function), approvals with two real accounts, the invite email, the signup linking and the daily job. These need migration 0025 applied and a second user; the approval/auto-apply path in particular has only been type-checked.

## Known limits
- The creator can delete a shared asset (it disappears for everyone); co-owners cannot. No transfer of the creator role, no re-send of invites, no notice when a co-owner is removed.
- Open Finance bank links and the vehicle/real-estate valuation refreshes still act on the creator's whole asset.
- A shared-asset history point reflects the whole asset; scaling happens at read time.

## Regression fixed: asset page 404 (2026-10-02)

- After co-ownership shipped, **every asset page returned 404**. Cause: the page's access check reads `asset.profile_id`, but its query never selected that column, so the check always failed (`src/app/dashboard/assets/[id]/page.tsx`). The select now includes `profile_id`. I had type-checked but not exercised this page; the other loaders (dashboard, export, Companies) were checked and do select it.
- With 0025 applied, the demo seed inserted its three shared assets (Palm Jumeirah villa 50% with Von, Vance Strategy Consulting 33% with Jamie Taylor, Mercedes G 63 20% with Sam Cousin — all unregistered). A server-side check against the live database confirmed the owner rows and that an edit by the creator of such an asset is routed **direct** with no change request created. The **registered co-owner approval path is still untested** (needs a second account).

## Related
- [[Database-Schema|Database Schema]] — migration 0025
- [[Portfolio-Dashboard|Portfolio Dashboard]] — the pro-rata totals, the header bell, the Passive Income card
- [[Authentication-Security|Authentication & Security]] — RLS and the service-role pattern
- [[Deployment|Deployment]] — `CRON_SECRET`, redirect URLs, `CO_OWNER_INVITE_EMAILS`
- [[Localization|Localization]] — 34 new keys in nine languages

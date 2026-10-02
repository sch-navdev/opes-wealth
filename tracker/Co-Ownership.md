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

## Email notifications and status (2026-10-02, migration 0029)

**Why:** a co-owner added to an asset never "received the email to approve". Findings: (1) the join invitation DID go out (Supabase Auth through the project's Resend SMTP, status Delivered) but Hotmail filed it in **Junk**; (2) the app had **no code** to email an approval request, only the in-app bell, which an invited-but-unconfirmed user cannot see.

- **Migration 0029** (idempotent): `asset_owners.invite_status` (not_sent/sent/failed) + `invite_error`; `change_approvals.notify_status` + `notified_at` + `notify_error`. Existing invited rows are backfilled to `sent`. **Not applied until the user runs it.**
- **Sending:** `lib/email.ts` (Resend REST API; needs `RESEND_API_KEY`, optional `RESEND_FROM`, default `Opes Wealth <noreply@opeswealth.app>`) and `lib/shared-assets/notify.ts` (branded approval email: navy/gold, who proposed what, the auto-apply date, a Review button to the asset page). Without the key nothing is sent and the status shows "Email failed: Email service not configured".
- **Notify checkbox** in the Ownership section ("Notify co-owners by email", on by default, shown when there is a co-owner); sent as the `notify` form field, stored in the change request payload so a later auto-apply still invites new co-owners only if the requester wanted that.
- **Status panel** (`components/ownership-status.tsx`, built by `loadOwnershipStatus`) on the asset page: per owner "has an account / hasn't joined yet" and the invitation email status; while a change is pending, each approver's decision, whether and when they were emailed (or the failure reason), and the time left: **whole days while more than 24 h remain, then hours** (`timeLeft` in `lib/ownership.ts`, computed on the server so it cannot cause hydration mismatches).
- **Resend** buttons: the requester can re-send the review email to an approver who has not answered (`resendApprovalEmail`); the creator can re-send a join invitation (`resendCoOwnerInvite`). Both are authorised server-side.
- `replaceOwners` used to wipe `invited_at` on every save (rows are rewritten); it now carries over each invitation's status.
- **Invited-but-not-joined co-owners no longer block edits.** An invitation creates an Auth user and a profile at once, so they used to count as approvers although they cannot sign in. Approvers are now only owners who have joined (confirmed email or a sign-in). **Revoke sharing** (creator, on the status panel): `revokeCoOwner` removes a not-yet-joined co-owner without anyone's approval, gives their share back to the creator, cancels any change waiting on them, drops the owner rows entirely when only the creator is left, and deletes the never-used invited account (when it has no other shares or assets) so the invitation link stops working. Refused with a message once the person has joined.
- **Automatic share balancing** (`ownership-fields.tsx`): typing a co-owner's share used to leave the creator at 100% and only show "Total: 150%". Now the creator's share is what the co-owners leave (100% minus theirs, read-only), adding a co-owner starts them at an equal split, and removing one gives the share back. A tick box ("Adjust my share automatically", on by default) switches to fully manual shares. Also: parallelised four independent dashboard queries (`dashboard/page.tsx`); the Vercel function region (default US East vs. Supabase in Mumbai) is the bigger speed factor and is a dashboard setting.
- 28 new i18n keys in 9 languages. **Not verified:** a real approval email to a second inbox (needs `RESEND_API_KEY` set locally/on Vercel); whether an already-invited unconfirmed user can be re-invited through Supabase (the button reports the error if not). Deliverability: new sender domains often land in Junk until DKIM/SPF/DMARC are in place and recipients mark the mail as not junk.

## "Shared with you" email and a scaled-edit bug (2026-10-02)

- **Why a registered co-owner got no email:** claude's account already existed (created 22 Sep), and the app only emailed people WITHOUT an account (Supabase invitation); a registered co-owner was linked silently and could only see the in-app bell. Now a new co-owner with a working account gets a branded **"shared with you"** email through Resend (`sharedWithYouEmail` in `shared-assets/notify.ts`), recorded like the invitations (`invite_status`, `invited_at`), and one who was invited but never accepted gets the invitation again. The status panel shows **"Email sent <date, time>"** (or the failure reason) for every co-owner, with a **Resend email** button (the creator; `resendInvite` picks the right email), and Revoke only for those who have not joined. A save does not re-email existing co-owners: use the button.
- **Dashboard edit corrupted shared assets.** The dashboard rows are scaled to the viewer's share; its Edit dialog took those scaled figures and saving wrote them back to the real asset (purchase price, value and costs halved for a 50% share, again on every save). Shared assets are now edited on their own page (the dashboard shows a pencil link instead of the dialog; `sharedAssetIds` through `PortfolioGroups` and `PortfolioTable`). **Existing damage is not repaired automatically:** the Porsche's stored purchase price is 127,500 and value 169,015.76 (half of the 338,031.52 Argus value); confirm the true figures and correct them on the asset page.

## Related
- [[Database-Schema|Database Schema]] — migration 0025
- [[Portfolio-Dashboard|Portfolio Dashboard]] — the pro-rata totals, the header bell, the Passive Income card
- [[Authentication-Security|Authentication & Security]] — RLS and the service-role pattern
- [[Deployment|Deployment]] — `CRON_SECRET`, redirect URLs, `CO_OWNER_INVITE_EMAILS`
- [[Localization|Localization]] — 34 new keys in nine languages

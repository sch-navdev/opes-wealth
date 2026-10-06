[[PROJECT_TRACKER|← Project Tracker]]

# Database Schema

**Status:** In progress — Phase 1, Step 4 onward. Supabase/Postgres.

**Update (2026-09-22, verified directly against the live database via the Supabase MCP)**: despite every note below saying "not yet applied," the live schema actually already has nearly all of this structure (`profiles.last_name`/address fields/`avatar_base64`, `assets.metadata`/`images`, `asset_history.net_equity`/`source`) — applied by hand at some point (e.g. via the SQL editor), not through tracked migrations, since Supabase's migration-history table (`list_migrations`) comes back empty. One real divergence: `assets.images` is `jsonb` live, not the `text[]` the `0006` migration file defines. Full current-state summary: [[Architecture|Architecture]]. The per-migration notes below are left as originally written (useful history of *why* each change was made); don't take "not yet applied" in them at face value anymore.

Defined in `supabase/migrations/0001_initial_schema.sql` (not yet applied to the live database):
- **profiles** — `id` (uuid, PK, references `auth.users`), `first_name`, `last_name`, `default_currency` (default `'USD'`), `created_at`.
- **asset_categories** — `id` (uuid, PK), `name`, `slug` (unique). Seeded with Real Estate, SCPI, Equities, Crypto, Cash, Liabilities.
- **assets** — `id` (uuid, PK), `profile_id` (references `profiles`), `category_id` (references `asset_categories`), `name`, `ticker_symbol` (nullable), `quantity` (default `1`), `current_value`, `currency` (default `'USD'`), `is_liability` (default `false`), `created_at`, `updated_at`.
- **asset_history** — `id` (uuid, PK), `asset_id` (references `assets`), `recorded_date`, `value`, `created_at`.
- All four tables have Row Level Security enabled. `profiles`, `assets`, and `asset_history` restrict SELECT/INSERT/UPDATE/DELETE to rows owned by `auth.uid()` (directly via `profile_id`/`id`, or transitively for `asset_history` via its parent `assets` row). `asset_categories` is shared reference data, readable by any authenticated user.
- `supabase/migrations/0002_user_profile_trigger.sql` — `public.handle_new_user()` (a `security definer` trigger function, `search_path` pinned to `public`) inserts a `profiles` row for `new.id`, fired by an `on_auth_user_created` trigger `after insert on auth.users`. Fixes the gap noted after Step 7: without this, `addAsset` failed with a foreign-key violation because no `profiles` row existed for any signed-up user (see [[Portfolio-Dashboard|Portfolio Dashboard]]). Not yet applied to the live database.
- `supabase/migrations/0003_profile_extended_fields.sql` — adds `phone_number`, `address_street`, `address_po_box`, `address_city`, `address_postal_code`, `address_landmark`, `address_country`, and `avatar_base64` (all `text`) to `profiles`. Added proactively because the [[Profile-Settings|Profile Settings]] page needed these columns and they didn't exist yet — without this migration, `updateProfile` would fail with "column does not exist". Not yet applied to the live database.
- `supabase/migrations/0004_real_estate_and_currency.sql` — adds `assets.metadata` (`jsonb not null default '{}'`), for category-specific data (starting with Real Estate, see [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]]) without a column per field. Also has an `add column if not exists` for `assets.currency`, requested explicitly, but that column already existed from `0001` — a no-op guard, kept for idempotency. Not yet applied to the live database.
- `supabase/migrations/0005_asset_image.sql` — adds `assets.image_base64` (`text`, nullable), a per-asset image/logo shown as a small avatar in the [[Portfolio-Dashboard|Portfolio Dashboard]] table. **Superseded by 0006, see below.** Not yet applied to the live database.
- `supabase/migrations/0006_asset_images_loans_history.sql` — replaces the single `assets.image_base64` column with `assets.images` (`text[] not null default '{}'`, capped at 3 client-side, see [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]]). Extends `asset_history` with `net_equity` (`numeric`, nullable — the equity figure after subtracting any linked loan/off-plan balance, alongside the existing raw `value`) and `source` (`text not null default 'manual'`, constrained to `manual` / `dari` / `dubailand`) so each history row can power the valuation graph and record where a valuation came from. Syntax-checked with the real Postgres grammar (`libpg-query`, installed temporarily and removed after). Not yet applied to the live database.
- `supabase/migrations/0007_asset_history_unique_date.sql` — adds `unique (asset_id, recorded_date)` to `asset_history`, enabling `upsert(..., { onConflict: "asset_id,recorded_date" })` so the auto-generated historical timeline (see [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]]) can regenerate a date's row in place instead of duplicating it. Syntax-checked with `libpg-query`. Not yet applied to the live database.
- `supabase/migrations/0008_signup_profile_names.sql` — see [[Authentication-Security|Authentication & Security]]. Applied live.
- `supabase/migrations/0009_vehicle_private_equity_categories.sql` — seeds two new `asset_categories` rows, **Vehicles** (`vehicles`) and **Private Equity** (`private-equity`). No new tables/columns — like Real Estate, these categories store their fields in the existing `assets.metadata` jsonb column; the typed shapes are `VehicleMetadata` (`src/lib/vehicles.ts`: `vin`, `make`, `model`, `year`) and `PrivateEquityMetadata` (`src/lib/private-equity.ts`: `share_class`, `ownership_percentage`, `entity_name`), each with an `EMPTY_*` default and a defensive `parse*Metadata()` merge function mirroring `parseRealEstateMetadata`. Applied live; confirmed via a direct query that both rows exist. **Detail-view UI added** — see [[Portfolio-Dashboard|Portfolio Dashboard]].
- **Live data (2026-09-22)**: two rows were inserted directly into `public.assets` to validate the new categories — a 2015 Porsche 911 Carrera (Vehicles) and Navtec Group (Private Equity), both under the only existing profile, both metadata payloads confirmed to match `VehicleMetadata`/`PrivateEquityMetadata` field-for-field. Originally `[TEST]`-prefixed; **the prefix was removed on explicit request and this data is being kept live**, not deleted. **Flagging clearly**: the VIN (`WP0AA2A99FS123456`), share class (`Common`), and ownership percentage (`100%`) were placeholder values I invented to validate the schema shape, not real data about an actual vehicle or equity stake — worth editing these fields (currently only possible via direct SQL, since no Add/Edit UI exists for these categories yet) to the real figures if this is meant to be a genuine portfolio entry going forward.
- `supabase/migrations/0012_asset_purchase_date.sql` — adds `assets.purchase_date` (`date not null default current_date`), a top-level column (not jsonb metadata) so a "Purchase Date" can anchor an asset's history curve to when it was actually acquired instead of when the row was created — see [[Portfolio-Dashboard|Portfolio Dashboard]] for the UI/server-action side. **Applied live (2026-09-28)**, `src/types/supabase.ts` regenerated to match.
- `src/types/supabase.ts` (new) — the full `Database` type generated directly from the live schema via the Supabase MCP's `generate_typescript_types` (not hand-written).
- **Type reconciliation (2026-09-22)**: `utils/supabase/client.ts`, `utils/supabase/server.ts`, and `utils/supabase/mock-auth.ts` now instantiate `createBrowserClient<Database>`/`createServerClient<Database>`/`createClient<Database>` instead of the untyped defaults. This surfaced exactly 3 real type errors, all in `dashboard/actions.ts` (`addAsset`/`updateAsset`/`updateAssetValuation`), where a local `metadata` variable/cast was declared `Record<string, unknown> | null` instead of the generated `Json` type — fixed by importing `Json` from `@/types/supabase` and retyping those three spots (plus `syncAssetHistory`'s `metadata` param). Every other place that reads `metadata`/`images` (the portfolio table, asset detail view, add/edit dialog) uses an explicit `.returns<AssetRow[]>()`/manual type override on its query, which bypasses the client's generic inference entirely — that's *why* only 3 errors surfaced, not evidence the audit missed something. Verified with both `tsc --noEmit` and a full `next build`, both clean.

## asset_history.source Constraint Drift (2026-09-30)

- The live `asset_history_source_check` was found to allow only `manual, file_import, dld, adrec, dubailand, yahoo, finnhub, saxo` — not the values in `src/lib/asset-history.ts` (`broker_import`, `csv_import`, `coingecko`, `dari`, `vehicle_valuation`), so Saxo/CSV/crypto/ADREC/vehicle history writes were being rejected. How it drifted is unknown (it doesn't match migrations 0010/0011/0013 or my 0014). **Migration `0015_asset_history_source_superset.sql`** replaces it with the union of the app's values and the live ones; it is **not applied yet**. Until it is, history writes that hit a CHECK violation are retried as `manual` (see [[Portfolio-Dashboard|Portfolio Dashboard]]). Worth re-checking the other tables' constraints against the migrations directory for similar drift.


## Migration status — verified live 2026-10-06

Checked read-only against the live project (`lpaollycwokxejrihrap`): **every migration from 0015 to 0032 is applied.** Evidence: `asset_history_source_check` is the superset incl. `broker_import`/`open_finance` (0015, 0020); `list_my_sessions`/`revoke_my_session` exist (0016); categories Precious Metals, Companies, SCPI, Exotic Assets, Startups exist (0017–0019, 0023, 0024); tables `bank_connections`, `bank_account_links`, `bug_reports`, `transactions` (with `fingerprint`), `asset_owners`, `asset_change_requests`, `change_approvals`, `client_knowledge_documents`, `session_locations` exist (0020–0022, 0025, 0026, 0030); bucket `asset-photos` (0027); `invite_status`/`notify_status` columns (0029); `assets.status`/`plan` (0031); 39 restrictive policies and `is_demo_user()` (0032). The Supabase MCP `list_migrations` only shows seven entries because later migrations were applied through the SQL editor, so it is not a reliable status source. "Not applied" / "unapplied" wording in the sections below is **historical** (written at the time of each change).

### Re-check 2026-10-06 16:09 GST: one migration is NOT fully applied (0028), correcting the statement above
The line above ("every migration from 0015 to 0032 is applied") was based on checking objects only. A full re-check that also compares **privileges** found that **`0028_harden_function_access.sql` has not been applied**: its two `REVOKE`s are missing live.
- **Method (read-only):** every table, added column, function, trigger, policy, index and `GRANT/REVOKE EXECUTE` was extracted automatically from all 32 files in `supabase/migrations/` and compared with the live catalog: 13 tables, 22 added columns, 8 functions, 3 triggers, 17 policies, 17 indexes, the grants of 0016/0025/0028/0032. Everything matches **except 0028's revokes**. (`assets.image_base64` is expected to be absent: 0006 drops it.) No public table is missing RLS, there are no tables outside the migrations, 39 restrictive demo-mode policies exist (0032), the `asset-photos` bucket exists and is public (0027), `is_demo_user()` and `profile_id_for_email()` have the intended grants.
- **Drift:** live `is_asset_member(uuid)` and `link_pending_co_owners()` are still executable by **PUBLIC/anon** (ACL `=X/postgres`), and `link_pending_co_owners()` by `authenticated`. The Supabase security advisor flags both. Not exploitable for data (RLS and row ownership still apply) but it exposes two SECURITY DEFINER functions on `/rest/v1/rpc/`.
- **RESOLVED 2026-10-06 ~16:12 GST:** Steve ran the three statements in the Supabase SQL editor (the editor reported "Success. No rows returned"). Verified read-only afterwards: `is_asset_member(uuid)` anon=false, authenticated=true, service_role=true (ACL `postgres, authenticated, service_role`); `link_pending_co_owners()` anon=false, authenticated=false, service_role=true. The security advisor went from 4 anon-executable SECURITY DEFINER functions to 2 (`handle_new_user`, `rls_auto_enable`, the optional follow-up) and from 6 signed-in-executable to 5 (`is_asset_member`, `list_my_sessions`, `revoke_my_session` are intended; plus the same two). **Live Supabase now matches all 32 migrations.** Leaked-password protection cannot be enabled: the project is on the Supabase **Free** plan (shown in the dashboard header).
- **Migration 0033 (2026-10-06, applied by Steve in the SQL editor ~16:16 GST, verified):** `0033_revoke_trigger_helper_access.sql` revokes EXECUTE on `handle_new_user()` (trigger behind `on_auth_user_created` on `auth.users`) and `rls_auto_enable()` (behind the `ensure_rls` event trigger) from public, anon and authenticated. Postgres checks EXECUTE when a trigger is created, not when it fires, and the app never calls either by RPC; afterwards both triggers were confirmed still attached and enabled, and both functions are service_role-only. The security advisor now lists **no anon-executable function**; what remains is three intended signed-in functions (`is_asset_member`, `list_my_sessions`, `revoke_my_session`) and leaked-password protection (Free plan). **Live Supabase matches all 33 migrations.** A real sign-up was not re-tested after the revoke (the trigger is unchanged).
- **Not applied by Claude** (it is a security-privilege change on production). **Steve to run in the Supabase SQL editor** (idempotent, same as the migration file):
```sql
revoke execute on function public.is_asset_member(uuid) from public, anon;
grant  execute on function public.is_asset_member(uuid) to authenticated, service_role;
revoke execute on function public.link_pending_co_owners() from public, anon, authenticated;
```
Verify afterwards (expect `anon_can=false` for both, `authenticated_can=true` only for `is_asset_member`):
```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_asset_member', 'link_pending_co_owners');
```
- **Other advisor findings (not from the migrations, deliberately untouched by 0028):** `handle_new_user()` and `rls_auto_enable()` are SECURITY DEFINER functions executable by anon and authenticated (both are trigger/event-trigger helpers that need no direct EXECUTE grant, so `revoke execute ... from public, anon, authenticated` would be safe; offered as an optional follow-up, not applied); `list_my_sessions()` / `revoke_my_session()` are meant for signed-in users. **Leaked password protection is disabled** (Supabase dashboard -> Authentication -> password security; it may require a paid plan).
- **Edge Functions:** `refresh-market-price` (v13, updated 2026-10-01) and `adrec-pricing` (v3, 2026-09-30) are ACTIVE with `verify_jwt` on; the deployed sources contain everything the repo's last change added (Yahoo fallback, daily history with split adjustment, `no_data` handling; ADREC mock-mode contract) and were deployed after the repo's last edit to them. Compared by features and timestamps, not byte for byte.
- `supabase` MCP `list_migrations` still shows only 7 entries (later migrations were applied through the SQL editor), so the migration-history table is not a source of truth; the catalog comparison above is.

## OW7 Migrations — Not Yet Applied (2026-10-01, since applied)

- `0016_security_sessions.sql` — `list_my_sessions()` / `revoke_my_session(uuid)` SECURITY DEFINER functions for the Security page; see [[Authentication-Security|Authentication & Security]].
- `0017_precious_metals_category.sql` — seeds the `Precious Metals` row in `asset_categories`; see [[Live-Pricing|Live Pricing]].
- Both are written but **applied by the user** (`supabase db push` or the SQL editor). They are additive and idempotent (`create or replace`, `on conflict do nothing`). `0015` (history-source superset) from OW6 is still listed as pending too.


## Migration 0018 — Companies Category (2026-10-01)

- `0018_companies_category.sql` seeds the `Companies` row in `asset_categories` (idempotent). Metadata-only otherwise; the Private Equity redesign needs no migration. Written but **applied by the user**, with `0015`–`0017` still pending. See [[Portfolio-Dashboard|Portfolio Dashboard]].


## Migration 0019 — SCPI Category (2026-10-01)

- `0019_scpi_category.sql`: idempotent insert of the `SCPI` category. It was already seeded by `0001`, so this is a **no-op** on the live project; kept as a drift safeguard. No schema change; SCPI fields are metadata. See [[Portfolio-Dashboard|Portfolio Dashboard]].


## Migration 0020 — Bank Connections (2026-10-01; provider now `altareq` | `psd2`, still unapplied)

- `0020_bank_connections.sql` (**not applied yet**): `bank_connections` (provider, institution, status, `is_sandbox`, consent id/expiry, pending-OAuth `oauth_state` + `encrypted_code_verifier`, `encrypted_access_token`/`encrypted_refresh_token`, `token_expires_at`, `last_synced_at`, `last_sync_status`/`last_sync_error`) and `bank_account_links` (connection ↔ Cash `asset_id`, external account id, label, masked number, currency, `last_balance`, per-account sync status; unique per asset and per connection+account). RLS: select/delete own rows only. **Column-level privileges**: all privileges are revoked from `anon`/`authenticated` and only the non-secret columns are re-granted for select — so even the owner's browser session cannot read a token; writes and token reads go through the service role on the server. Also widens `asset_history_source_check` with `open_finance` (superset of 0015). See [[Market-Data-Integration|Market Data Integration]].


## Migration 0021 — Bug Reports (2026-10-01, unapplied)

- `bug_reports`: `fingerprint`, `title`, `summary`, `repro_steps`, `page_path`, `severity` (low|medium|high), `occurrences`, `reporter_ids uuid[]`, `status` (pending|sent|dismissed), `first_seen_at`, `last_seen_at`, `sent_at`, `external_ref`. A partial unique index allows one **pending** row per fingerprint (consolidation); sent rows are history.
- RLS is on with **no policies** and all privileges revoked from `anon`/`authenticated`: only the service role (server) touches it. See [[Architecture|Architecture]] (AI Help Assistant).


## Demo Data (2026-10-01)

- `scripts/seed-demo.mts` (not a migration) writes a demo user's `profiles`, `assets` and `asset_history` rows through the service role; it needs migrations up to 0019 for the categories. See [[Deployment|Deployment]] (Demo Account & Seed Script).

## Migrations 0022 and 0023 (2026-10-02, OW9)

- **`0022_transactions.sql`** — new `transactions` table (per-transaction ledger for CSV/statement imports) with `unique (profile_id, fingerprint)`, an `(asset_id, booked_date desc)` index and owner-only RLS. Details in [[CSV-Bank-Uploads|CSV Bank Uploads]]. Hand-typed in `src/types/supabase.ts` too (that file is maintained by hand here).
- **`0023_exotic_assets_category.sql`** — seeds the `Exotic Assets` category (`on conflict (slug) do nothing`). No columns: watch fields live in `assets.metadata` (`src/lib/exotic-assets.ts`). Chrono24 valuations are written to `asset_history` with `source = 'manual'` (provenance is in `metadata.last_price_source`) so no CHECK-constraint change is needed.
- **Both are unapplied** at the time of writing — apply with `supabase db push` or the SQL editor.

## Migration 0024 (2026-10-02, OW10)

- **`0024_startups_category.sql`** — seeds the `Startups` category (`on conflict (slug) do nothing`). No columns: startup fields and funding rounds live in `assets.metadata`, shares in `assets.quantity` — see [[Portfolio-Dashboard|Portfolio Dashboard]]. **Unapplied** at the time of writing (together with 0022/0023).

## Migration 0025 — co-ownership (2026-10-02)

- **`0025_co_ownership.sql`** — `asset_owners`, `asset_change_requests`, `change_approvals`, the `is_asset_member` helper, co-owner read policies on `assets`/`asset_history`, the signup linking trigger and `profile_id_for_email`. Full description in [[Co-Ownership|Co-Ownership]]. **Not applied.**

## Migration 0026 — client knowledge (2026-10-02)

- **`0026_client_knowledge.sql`** — `client_knowledge_documents` (`profile_id` primary key, `data` jsonb, `updated_at`) with own-row select/insert/update/delete RLS. See [[Profile-Settings|Profile & Settings]] for the privacy caveat. **Not applied** at the time of writing.

## Migration 0027 — asset photo bucket (2026-10-02)

- **`0027_asset_photos_bucket.sql`** — creates the public Storage bucket `asset-photos` (3 MB, webp/jpeg) and own-folder insert/update/delete policies on `storage.objects`. `assets.images` (text[]) is unchanged but now holds URLs. See [[Portfolio-Dashboard|Portfolio Dashboard]]. **Apply before the deploy that uploads photos.**

## Migration 0028 — function access hardening (2026-10-02)

- **`0028_harden_function_access.sql`** — after a read-only check of the live project (all of 0022–0027 present, RLS on every table, `asset-photos` bucket and its three own-folder policies in place) the security advisor flagged two of the co-ownership helpers as callable through `/rest/v1/rpc`. `is_asset_member` is now revoked from signed-out visitors but kept for signed-in users (RLS policies need it); `link_pending_co_owners` (a trigger function) is revoked from everyone. Other advisor items left as they are: `bug_reports` has RLS and no policy by design (server only); leaked-password protection is off (an Auth toggle, possibly Pro-only); older functions (`handle_new_user`, `rls_auto_enable`) are outside this change. **Not applied** at the time of writing.

## assets.status and assets.plan (migration 0031, 2026-10-02)

`status` (`active` default / `simulation`) separates live assets from Future Projects simulations; all portfolio queries filter on `active`. `plan` (jsonb) holds a simulation's financing inputs. Index `(profile_id, status)`. See [[Future-Projects|Future Projects]].

## Related
- [[Market-Data-Integration|Market Data Integration]] — design-only ADREC/DARI outline, drafted alongside the Vehicles/Private Equity schema work
- [[Architecture|Architecture]] — verified live-schema snapshot and financial formulas
- [[Authentication-Security|Authentication & Security]] — `profiles` row creation on signup
- [[Portfolio-Dashboard|Portfolio Dashboard]] — `assets` table CRUD
- [[Profile-Settings|Profile & Settings]] — extended `profiles` columns
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `assets.metadata` jsonb

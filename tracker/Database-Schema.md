[[PROJECT_TRACKER|← Project Tracker]]

# Database Schema

**Status:** In progress — Phase 1, Step 4 onward. Supabase/Postgres, migrations not yet applied to the live database.

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

## Related
- [[Authentication-Security|Authentication & Security]] — `profiles` row creation on signup
- [[Portfolio-Dashboard|Portfolio Dashboard]] — `assets` table CRUD
- [[Profile-Settings|Profile & Settings]] — extended `profiles` columns
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `assets.metadata` jsonb

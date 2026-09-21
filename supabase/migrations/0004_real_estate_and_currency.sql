-- 0004_real_estate_and_currency.sql
-- Opes Wealth: multi-currency support and category-specific asset detail
-- (starting with Real Estate) without adding a column per field.

-- `assets.currency` already exists (added in 0001_initial_schema.sql,
-- `text not null default 'USD'`) — this is a no-op guard, kept for
-- idempotency in case this migration runs against a database that only
-- ever had an earlier, stripped-down version of that table.
alter table public.assets
  add column if not exists currency text not null default 'USD';

-- Dynamic, category-specific data (e.g. Real Estate's address, surface
-- area, condition ratings, ownership split, ...) lives here instead of as
-- dozens of category-specific columns on `assets`. Defaults to an empty
-- object so existing rows and the app's `metadata ?? {}` reads stay simple.
alter table public.assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

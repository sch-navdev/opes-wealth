-- 0012_asset_purchase_date.sql
-- Opes Wealth: add a `purchase_date` column to `assets`, so the initial
-- asset_history point (see `syncAssetHistory` in `dashboard/actions.ts`)
-- can be anchored to when the asset was actually acquired instead of
-- always defaulting to the date the row was created. `default current_date`
-- backfills existing rows with today as a placeholder (there's no real
-- purchase-history to recover for them).

alter table public.assets
  add column purchase_date date not null default current_date;

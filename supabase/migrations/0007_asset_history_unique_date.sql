-- 0007_asset_history_unique_date.sql

-- Lets the app upsert on (asset_id, recorded_date) so re-saving an asset's
-- form regenerates its auto-synced timeline points instead of duplicating
-- a row for the same date.
alter table public.asset_history
  drop constraint if exists asset_history_asset_date_unique;

alter table public.asset_history
  add constraint asset_history_asset_date_unique unique (asset_id, recorded_date);

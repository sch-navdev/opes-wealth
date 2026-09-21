-- 0006_asset_images_loans_history.sql

-- Replace the single image_base64 column with a small array of images
-- (multi-image carousel on the asset details page, capped at 3 client-side).
alter table public.assets
  add column if not exists images text[] not null default '{}';

alter table public.assets
  drop column if exists image_base64;

-- Extend asset_history so it can power the Overview tab's graph: each
-- snapshot now records both the raw market valuation (`value`, pre-existing)
-- and the net equity after subtracting any linked loan / off-plan balance,
-- plus where the valuation came from.
alter table public.asset_history
  add column if not exists net_equity numeric;

alter table public.asset_history
  add column if not exists source text not null default 'manual';

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (source in ('manual', 'dari', 'dubailand'));

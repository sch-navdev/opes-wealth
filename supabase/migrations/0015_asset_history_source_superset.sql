-- 0015_asset_history_source_superset.sql
-- Opes Wealth: make `asset_history.source`'s CHECK constraint a superset of
-- every value the app writes AND every value already allowed on the live
-- project.
--
-- Found on the live project (2026-09-30): the constraint had drifted to
--   manual, file_import, dld, adrec, dubailand, yahoo, finnhub, saxo
-- which REJECTS values the app uses — broker_import (Saxo/Sharesight import
-- history), csv_import, coingecko, dari and vehicle_valuation. The broker
-- importer's invested-capital backfill writes source 'broker_import', so every
-- imported holding's history insert failed and the portfolio chart had
-- nothing before today. (The app now also retries a rejected source as
-- 'manual', see `upsertHistoryRows` in dashboard/actions.ts, but the DB should
-- accept the proper values.)
--
-- The union below keeps the extra live values (so no existing row or other
-- consumer breaks) and adds everything from `src/lib/asset-history.ts`.
-- Supersedes 0014 (which only added 'yahoo'). Apply with `supabase db push` or
-- paste into the SQL editor.

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (
    source in (
      -- app values (src/lib/asset-history.ts)
      'manual',
      'dari',
      'dubailand',
      'csv_import',
      'coingecko',
      'finnhub',
      'yahoo',
      'broker_import',
      'vehicle_valuation',
      -- already allowed on the live project; kept so nothing existing breaks
      'file_import',
      'dld',
      'adrec',
      'saxo'
    )
  );

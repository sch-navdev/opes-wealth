-- 0010_market_pricing_sources.sql
-- Opes Wealth: widen `asset_history.source`'s CHECK constraint for the new
-- Equities/Crypto live-pricing feature (Phase 1 Step 9, second half).
--
-- The constraint added in 0006 only allowed ('manual', 'dari', 'dubailand'),
-- but the app-level `AssetHistorySource` union in `src/lib/asset-history.ts`
-- already includes 'csv_import' (added for CSV Bank Uploads) with no
-- migration ever widening the DB constraint to match — confirmed via
-- `pg_constraint` on the live project that the constraint is actually
-- *absent* there entirely (dropped or never applied outside this migrations
-- directory), so this is also the first migration to make the live
-- constraint match what the app has been relying on. Adds 'coingecko' and
-- 'finnhub' for the new `refresh-market-price` Edge Function's two
-- providers (see `tracker/Live-Pricing.md`).

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (source in ('manual', 'dari', 'dubailand', 'csv_import', 'coingecko', 'finnhub'));

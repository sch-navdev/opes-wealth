-- 0014_yahoo_pricing_source.sql
-- Opes Wealth: allow 'yahoo' as an `asset_history.source`.
--
-- The `refresh-market-price` Edge Function now falls back to Yahoo Finance for
-- listings Finnhub's free tier can't quote (Euronext, DFM, ADX, ...), and
-- `persistQuote` (dashboard/actions.ts) records that provider as the history
-- row's source. The live constraint (see 0010/0011/0013) doesn't list it, so
-- without this migration a Yahoo-priced history insert is rejected; the app
-- falls back to 'manual' for that row until this is applied, and
-- `metadata.last_price_source` keeps the true provider either way.
--
-- Apply with `supabase db push` (or paste into the SQL editor).

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (
    source in (
      'manual',
      'dari',
      'dubailand',
      'csv_import',
      'coingecko',
      'finnhub',
      'broker_import',
      'vehicle_valuation',
      'yahoo'
    )
  );

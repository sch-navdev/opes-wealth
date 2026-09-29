-- 0013_vehicle_valuation_source.sql
-- Opes Wealth: widen `asset_history.source`'s CHECK constraint (see
-- `0010_market_pricing_sources.sql`/`0011_broker_import_source.sql`) to add
-- 'vehicle_valuation', for the new French vehicle valuation integration
-- (`src/lib/services/vehicle-valuation-client.ts`) — `refreshVehicleValuation`
-- tags every asset_history row it writes with this source.

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (source in ('manual', 'dari', 'dubailand', 'csv_import', 'coingecko', 'finnhub', 'broker_import', 'vehicle_valuation'));

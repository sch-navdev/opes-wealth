-- 0011_broker_import_source.sql
-- Opes Wealth: widen `asset_history.source`'s CHECK constraint (see
-- `0010_market_pricing_sources.sql`) to add 'broker_import', for Phase 2's
-- Broker Trade Import feature (`tracker/Broker-Trade-Import.md`) — the
-- `importBrokerTrades` server action tags every asset_history row it writes
-- with this source, generically covering any broker in the registry
-- (`src/lib/parsers/broker-registry.ts`), not just Saxo Bank specifically,
-- so adding a second broker later doesn't need another migration.

alter table public.asset_history
  drop constraint if exists asset_history_source_check;

alter table public.asset_history
  add constraint asset_history_source_check
  check (source in ('manual', 'dari', 'dubailand', 'csv_import', 'coingecko', 'finnhub', 'broker_import'));

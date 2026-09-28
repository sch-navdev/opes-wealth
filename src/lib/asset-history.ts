/**
 * Every value `asset_history.source` is ever set to from app code. The live
 * column now has a CHECK constraint listing exactly these values (see
 * migration `0010_market_pricing_sources.sql` — an earlier gap where the DB
 * constraint didn't match this union was closed there), so a typo here would
 * also just fail loudly at the DB layer, but this union still exists to stop
 * that typo from ever being written in the first place.
 */
export type AssetHistorySource =
  | "manual"
  | "dari"
  | "dubailand"
  | "csv_import"
  | "coingecko"
  | "finnhub"
  | "broker_import";

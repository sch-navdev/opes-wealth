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
  | "pdf_import"
  | "coingecko"
  | "finnhub"
  | "yahoo"
  | "broker_import"
  | "vehicle_valuation"
  | "open_finance";

/** `asset_history.source_ref` / `transactions.source_file` are capped at this many characters (migration 0041). */
export const SOURCE_REF_MAX_LENGTH = 200;

/** A file name as stored with imported rows: the base name only (no folders), trimmed and capped; `undefined` when empty. */
export function cleanSourceRef(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f]/g, "").trim().slice(0, SOURCE_REF_MAX_LENGTH);
  return clean || undefined;
}

/**
 * True when a Postgres / PostgREST error says `column` does not exist: `42703` (undefined_column) or
 * `PGRST204` (column missing from the schema cache). Lets the importers keep working before migration 0041
 * (the new `source_ref` / `source_file` columns) is applied.
 */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  return !error.message || error.message.includes(column);
}

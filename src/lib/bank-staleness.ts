/**
 * Stale-balance marker of the Banking tab: a bank balance is only as good as the date it was last
 * refreshed (statement import, sync or manual edit). Pure helpers, no React, no I/O; they reuse the
 * date arithmetic of the Data quality page (`isoDayNumber`), but the threshold is its own: a cash
 * balance older than one month (31 days) is flagged here (Data quality uses 45 days for Cash).
 */
import { isoDayNumber } from "@/lib/data-quality";

/** A balance dated MORE than this many days before today is stale. */
export const BANK_STALE_DAYS = 31;

/** The newest dates we know about for a Cash account, each an ISO date or timestamp (or missing). */
export type BalanceDateSources = {
  /** Newest `asset_history.recorded_date` of the Cash asset. */
  historyDate?: string | null;
  /** Newest `transactions.booked_date` of the account. */
  transactionDate?: string | null;
  /** The asset's own `updated_at` / valuation date. */
  updatedAt?: string | null;
  /** End date of the newest imported statement that covers the account (`metadata.statement_through`), even one with no transaction. */
  statementThrough?: string | null;
  /** `source` of the newest history row (csv_import / pdf_import / manual ...). */
  importSource?: string | null;
};

/**
 * The "as of" date of a balance as `YYYY-MM-DD`: the newest history date, else the newest
 * transaction date, else the asset's updated date. Invalid or missing values are skipped.
 */
export function pickBalanceDate(sources: BalanceDateSources): string | null {
  // A statement covering the account proves the balance as of its end date even when it listed no transaction:
  // the newer of that and the newest history row wins.
  const recorded = [sources.historyDate, sources.statementThrough]
    .filter((d): d is string => isoDayNumber(d) != null)
    .map((d) => d.trim().slice(0, 10))
    .sort();
  if (recorded.length > 0) return recorded[recorded.length - 1];
  for (const candidate of [sources.transactionDate, sources.updatedAt]) {
    if (isoDayNumber(candidate) != null) return String(candidate).trim().slice(0, 10);
  }
  return null;
}

/** How a Cash account's data got in: a bank link, a PDF statement, a CSV file or by hand. */
export type ImportSource = "synced" | "pdf" | "csv" | "manual";

export function importSourceOf(historySource: string | null | undefined, link: unknown): ImportSource {
  if (link) return "synced";
  if (historySource === "pdf_import") return "pdf";
  if (historySource === "csv_import") return "csv";
  return "manual";
}

/** Whole days from `asOf` to `today` (negative for a future date), or null when either is not a valid date. */
export function balanceAgeDays(asOf: string | null | undefined, today: string): number | null {
  const a = isoDayNumber(asOf);
  const t = isoDayNumber(today);
  return a == null || t == null ? null : t - a;
}

/** True when the balance is dated more than `thresholdDays` (default 31) before `today`. Unknown dates are not "stale". */
export function isBalanceStale(
  asOf: string | null | undefined,
  today: string,
  thresholdDays: number = BANK_STALE_DAYS,
): boolean {
  const age = balanceAgeDays(asOf, today);
  return age != null && age > thresholdDays;
}

/** How many of the rows carry a stale balance. */
export function countStaleBalances(rows: readonly { balanceAsOf?: string | null }[], today: string): number {
  return rows.filter((r) => isBalanceStale(r.balanceAsOf, today)).length;
}

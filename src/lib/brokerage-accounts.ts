/**
 * Groups the user's Equities holdings (the "Brokerage Account" category: one asset per holding) by
 * brokerage account, the way the portfolio does it (`metadata.account_name`, see `accountDisplayName`),
 * with each account's open-position value in the Base Currency and the newest quote date.
 * Pure: no React, no I/O.
 */
import { accountDisplayName, isClosedPosition, parseEquityMetadata } from "@/lib/equities";
import { convertAmount } from "@/lib/fx";
import { isoDayNumber } from "@/lib/data-quality";

export type BrokerageHolding = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  ticker_symbol: string | null;
  purchase_date: string;
};

export type BrokerageAccount = {
  /** Stable key: the account name, or `""` for holdings without one. */
  key: string;
  /** Display name, null for holdings without an account name. */
  name: string | null;
  holdings: BrokerageHolding[];
  openCount: number;
  closedCount: number;
  /** Open positions only, in the Base Currency. */
  totalBase: number;
  /** Newest `last_priced_at` of the account as `YYYY-MM-DD`, or null when nothing was priced yet. */
  pricesUpdated: string | null;
};

export type BrokerageSummary = { accounts: BrokerageAccount[]; totalBase: number; holdingCount: number };

export function buildBrokerageAccounts(
  holdings: readonly BrokerageHolding[],
  baseCurrency: string,
  rates: Readonly<Record<string, number>>,
): BrokerageSummary {
  const byAccount = new Map<string, BrokerageAccount>();
  for (const holding of holdings) {
    const metadata = parseEquityMetadata(holding.metadata);
    const name = accountDisplayName(metadata);
    const key = name ?? "";
    let account = byAccount.get(key);
    if (!account) {
      account = { key, name, holdings: [], openCount: 0, closedCount: 0, totalBase: 0, pricesUpdated: null };
      byAccount.set(key, account);
    }
    account.holdings.push(holding);
    if (isClosedPosition(holding.quantity)) {
      account.closedCount += 1;
    } else {
      account.openCount += 1;
      account.totalBase += convertAmount(holding.current_value, holding.currency, baseCurrency, rates);
    }
    if (isoDayNumber(metadata.last_priced_at) != null) {
      const day = String(metadata.last_priced_at).trim().slice(0, 10);
      if (!account.pricesUpdated || day > account.pricesUpdated) account.pricesUpdated = day;
    }
  }
  // Named accounts alphabetically, the unnamed bucket last.
  const accounts = [...byAccount.values()].sort((a, b) =>
    a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name),
  );
  return {
    accounts,
    totalBase: accounts.reduce((sum, a) => sum + a.totalBase, 0),
    holdingCount: accounts.reduce((sum, a) => sum + a.openCount, 0),
  };
}

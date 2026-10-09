"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatIsoDay } from "@/components/balance-as-of";
import { useBankingText } from "@/components/banking-text";
import { BrokerageHoldingsTable } from "@/components/brokerage-holdings-table";
import { CategoryIcon } from "@/components/category-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { buildBrokerageAccounts, type BrokerageHolding } from "@/lib/brokerage-accounts";

/**
 * The Brokerage page: one card per brokerage account (the Equities category grouped by account name)
 * with its holdings table (same component as the dashboard portfolio: per-exchange sections, gains,
 * income, "Refresh prices"), the account total in the Base Currency and the date the prices were last
 * refreshed; a grand total on top. Empty state points at the broker trade import.
 */
export function BrokerageOverview({
  holdings,
  baseCurrency,
  rates,
}: {
  holdings: BrokerageHolding[];
  baseCurrency: string;
  rates: Record<string, number>;
}) {
  const tx = useBankingText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const summary = useMemo(() => buildBrokerageAccounts(holdings, baseCurrency, rates), [holdings, baseCurrency, rates]);
  const money = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });

  if (summary.accounts.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="space-y-2 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{tx("brokerage_page_empty")}</p>
          <p className="text-sm text-muted-foreground">{tx("brokerage_page_empty_hint")}</p>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            {tx("brokerage_page_to_dashboard")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="space-y-1 py-4">
          <p className="text-xs text-muted-foreground">{tx("brokerage_page_total")}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{maskValue(money.format(summary.totalBase))}</p>
          <p className="text-xs text-muted-foreground">{tx("brokerage_page_accounts_count", { n: summary.accounts.length })}</p>
        </CardContent>
      </Card>

      {summary.accounts.map((account) => (
        <Card key={account.key || "no-account"} className="border-border bg-card" data-testid="brokerage-account">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                <CategoryIcon name="Equities" className="size-4" />
                {account.name ?? tx("brokerage_page_other_account")}
                <span className="text-xs font-normal text-muted-foreground">
                  ({tx("brokerage_page_account_holdings", { n: account.openCount })})
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {account.pricesUpdated
                  ? tx("brokerage_page_prices_updated", { date: formatIsoDay(account.pricesUpdated, intlLocale) })
                  : tx("brokerage_page_prices_unknown")}
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {maskValue(money.format(account.totalBase))}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <BrokerageHoldingsTable assets={account.holdings} displayCurrency={baseCurrency} rates={rates} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

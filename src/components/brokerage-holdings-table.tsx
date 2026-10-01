"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { refreshBrokerageQuotes } from "@/app/dashboard/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/category-icon";
import {
  accountDisplayName,
  computeHoldingMetrics,
  holdingDisplayName,
  isClosedPosition,
  parseEquityMetadata,
  summarizeClosedPosition,
} from "@/lib/equities";
import { convertAmount } from "@/lib/fx";
import { cn } from "@/lib/utils";

export type BrokerageAsset = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  ticker_symbol: string | null;
  purchase_date: string;
};

function formatMoneyWithLocale(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

function signedClass(n: number | null) {
  if (n == null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-success" : "text-destructive";
}

/**
 * Sharesight-style holdings table for the Brokerage Account category: one
 * section per exchange (EURONEXT, NASDAQ, NYSE, …, from each holding's
 * normalized \`metadata.exchange\`) with Price, Quantity, Value, Capital
 * Gain, Income, Currency and Return per holding, in each holding's own
 * currency, plus per-exchange and overall subtotals converted into the
 * Base Currency. Capital Gain/Return come from \`computeHoldingMetrics\`
 * (average-cost basis of the open position). "Refresh prices" re-quotes
 * every holding from Finnhub.
 */
export function BrokerageHoldingsTable({
  assets,
  displayCurrency,
  rates,
  selectedIds,
  onToggleAsset,
  onToggleAll,
}: {
  assets: BrokerageAsset[];
  displayCurrency: string;
  rates: Record<string, number>;
  selectedIds?: Set<string>;
  onToggleAsset?: (id: string, checked: boolean) => void;
  onToggleAll?: (ids: string[], checked: boolean) => void;
}) {
  const { t, intlLocale } = useLanguage();
  const formatMoney = (amount: number, currency: string) =>
    formatMoneyWithLocale(amount, currency, intlLocale);
  const { maskValue } = usePrivacy();
  const [isRefreshing, startRefresh] = useTransition();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const rows = useMemo(
    () =>
      assets.map((asset) => {
        const metadata = parseEquityMetadata(asset.metadata);
        const metrics = computeHoldingMetrics({
          quantity: asset.quantity,
          currentValue: asset.current_value,
          metadata,
        });
        const toBase = (n: number) =>
          convertAmount(n, asset.currency, displayCurrency, rates);
        return {
          asset,
          metadata,
          metrics,
          exchange: metadata.exchange || "OTHER",
          account: accountDisplayName(metadata),
          baseValue: toBase(asset.current_value),
          baseGain: metrics.capitalGain != null ? toBase(metrics.capitalGain) : null,
          baseCost: metrics.cost != null ? toBase(metrics.cost) : null,
          baseIncome: toBase(metrics.income),
          closed: isClosedPosition(asset.quantity),
          // Closed positions: lifetime figures from the trade ledger + dividends.
          closedSummary: isClosedPosition(asset.quantity)
            ? summarizeClosedPosition(metadata.trades, metrics.income)
            : null,
        };
      }),
    [assets, displayCurrency, rates],
  );

  // Open positions drive the main table and its totals; fully-sold ones are
  // kept (quantity 0, value 0) for history and dividends and listed below.
  const activeRows = useMemo(() => rows.filter((r) => !r.closed), [rows]);
  const closedRows = useMemo(
    () =>
      rows
        .filter((r) => r.closed)
        .sort((a, b) => (b.closedSummary?.closed ?? "").localeCompare(a.closedSummary?.closed ?? "")),
    [rows],
  );
  const closedIds = closedRows.map((r) => r.asset.id);
  const closedTotals = useMemo(() => {
    const toBase = (n: number, cur: string) => convertAmount(n, cur, displayCurrency, rates);
    let invested = 0;
    let proceeds = 0;
    let income = 0;
    for (const r of closedRows) {
      const s = r.closedSummary!;
      invested += toBase(s.invested, r.asset.currency);
      proceeds += toBase(s.proceeds, r.asset.currency);
      income += toBase(s.income, r.asset.currency);
    }
    const realized = proceeds - invested;
    return {
      invested,
      proceeds,
      realized,
      income,
      returnPct: invested > 0 ? ((realized + income) / invested) * 100 : null,
    };
  }, [closedRows, displayCurrency, rates]);

  // Hierarchy: Brokerage Account (the category header above) → account
  // ("Saxobank Acc. # 10164571") → exchange → holding.
  const accountGroups = useMemo(() => {
    const byAccount = new Map<string | null, typeof rows>();
    for (const row of activeRows) {
      if (!byAccount.has(row.account)) byAccount.set(row.account, []);
      byAccount.get(row.account)!.push(row);
    }
    return Array.from(byAccount.entries())
      .sort(([a], [b]) => (a ?? "\uffff").localeCompare(b ?? "\uffff"))
      .map(([account, accountRows]) => {
        const byExchange = new Map<string, typeof rows>();
        for (const row of accountRows) {
          if (!byExchange.has(row.exchange)) byExchange.set(row.exchange, []);
          byExchange.get(row.exchange)!.push(row);
        }
        return {
          account,
          rows: accountRows,
          exchanges: Array.from(byExchange.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([exchange, list]) => ({
              exchange,
              rows: [...list].sort((a, b) => b.baseValue - a.baseValue),
            })),
        };
      });
  }, [activeRows]);
  const showAccountHeaders = accountGroups.some((g) => g.account !== null);

  const summarize = (list: typeof rows) => {
    const value = list.reduce((s, r) => s + r.baseValue, 0);
    const cost = list.reduce((s, r) => s + (r.baseCost ?? 0), 0);
    const gain = list.reduce((s, r) => s + (r.baseGain ?? 0), 0);
    const income = list.reduce((s, r) => s + r.baseIncome, 0);
    return {
      value,
      gain,
      income,
      returnPct: cost > 0 ? ((gain + income) / cost) * 100 : null,
    };
  };

  const allIds = activeRows.map((r) => r.asset.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds?.has(id));
  const selectable = Boolean(selectedIds && onToggleAsset && onToggleAll);
  const columnCount = selectable ? 9 : 8;

  function handleRefresh() {
    setRefreshMessage(null);
    setRefreshError(false);
    startRefresh(async () => {
      const result = await refreshBrokerageQuotes(allIds);
      if ("error" in result) {
        setRefreshError(true);
        setRefreshMessage(result.error);
        return;
      }
      // `skipped` = Finnhub has no data for that ticker (free tier, non-US
      // listing): neutral, never counted as a failure.
      const failed = result.results.filter((r) => r.status === "error");
      const skipped = result.results.filter((r) => r.status === "skipped");
      setRefreshError(failed.length > 0);
      // A rejected/missing Finnhub key is reported as one clear warning (every
      // ticker fails identically); holdings keep their last price/cost basis.
      const keyProblem = failed.some(
        (r) => r.code === "invalid_api_key" || r.code === "provider_not_configured",
      );
      setRefreshMessage(
        keyProblem
          ? t("brokerage_api_key_warning")
          : t("brokerage_refresh_done", {
              updated: result.results.length - failed.length - skipped.length,
              failed: failed.length,
            }) +
              (failed[0]?.message ? ` — ${failed[0].ticker}: ${failed[0].message}` : "") +
              (skipped.length > 0 ? ` ${t("brokerage_refresh_skipped", { n: skipped.length })}` : ""),
      );
    });
  }

  const total = summarize(activeRows);
  const money = (n: number) => maskValue(formatMoney(n, displayCurrency));
  const pct = (n: number | null) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="text-xs text-muted-foreground">
          {t("brokerage_table_note", { currency: displayCurrency })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || assets.length === 0}
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          {isRefreshing ? t("brokerage_refreshing") : t("brokerage_refresh_prices")}
        </Button>
      </div>
      {refreshMessage && (
        <p
          className={cn(
            "px-4 text-sm",
            refreshError ? "text-destructive" : "text-muted-foreground",
          )}
          role={refreshError ? "alert" : undefined}
        >
          {refreshMessage}
        </p>
      )}

      {activeRows.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">{t("brokerage_no_open")}</p>
      ) : (
      <div role="region" tabIndex={0} className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => onToggleAll!(allIds, c === true)}
                    aria-label={t("select_all")}
                  />
                </TableHead>
              )}
              <TableHead className="text-muted-foreground">{t("brokerage_holding")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_price")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_quantity")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_value")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_capital_gain")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_income")}</TableHead>
              <TableHead className="text-muted-foreground">{t("brokerage_currency")}</TableHead>
              <TableHead className="text-end text-muted-foreground">{t("brokerage_return")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountGroups.map((acct) => {
              const acctSub = summarize(acct.rows);
              return (
                <Fragment key={acct.account ?? "no-account"}>
                  {showAccountHeaders && (
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableCell
                        colSpan={columnCount - 5}
                        className="font-semibold text-foreground"
                      >
                        <span className="inline-flex items-center gap-2">
                          <CategoryIcon name="Equities" className="size-4" />
                          {acct.account ?? t("brokerage_other_holdings")}
                        </span>
                        <span className="ms-2 text-xs font-normal text-muted-foreground">
                          ({acct.rows.length})
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums text-foreground">
                        {money(acctSub.value)}
                      </TableCell>
                      <TableCell className={cn("text-end tabular-nums", signedClass(acctSub.gain))}>
                        {money(acctSub.gain)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {acctSub.income ? money(acctSub.income) : "—"}
                      </TableCell>
                      <TableCell />
                      <TableCell
                        className={cn("text-end tabular-nums", signedClass(acctSub.returnPct))}
                      >
                        {pct(acctSub.returnPct)}
                      </TableCell>
                    </TableRow>
                  )}
                  {acct.exchanges.map((group) => {
              const sub = summarize(group.rows);
              return (
                <Fragment key={group.exchange}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={columnCount - 5}
                      className={cn("font-medium text-foreground", showAccountHeaders && "ps-6")}
                    >
                      {group.exchange}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        ({group.rows.length})
                      </span>
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums text-foreground">
                      {money(sub.value)}
                    </TableCell>
                    <TableCell className={cn("text-end tabular-nums", signedClass(sub.gain))}>
                      {money(sub.gain)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {sub.income ? money(sub.income) : "—"}
                    </TableCell>
                    <TableCell colSpan={1} />
                    <TableCell className={cn("text-end tabular-nums", signedClass(sub.returnPct))}>
                      {pct(sub.returnPct)}
                    </TableCell>
                  </TableRow>
                  {group.rows.map(({ asset, metadata, metrics }) => (
                    <TableRow key={asset.id}>
                      {selectable && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds!.has(asset.id)}
                            onCheckedChange={(c) => onToggleAsset!(asset.id, c === true)}
                            aria-label={asset.name}
                          />
                        </TableCell>
                      )}
                      <TableCell className={cn(showAccountHeaders && "ps-6")}>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm" className="rounded-md">
                            <AvatarFallback className="rounded-md">
                              <CategoryIcon name="Equities" className="size-3.5" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/assets/${asset.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {holdingDisplayName(asset.name, metadata, asset.ticker_symbol)}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {[asset.ticker_symbol, metadata.isin].filter(Boolean).join(" · ") || "—"}
                              {asset.purchase_date &&
                                ` · ${t("brokerage_opened")} ${asset.purchase_date}`}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {metrics.price != null ? maskValue(formatMoney(metrics.price, asset.currency)) : "—"}
                        {metadata.day_change_pct != null && (
                          <p className={cn("text-xs", signedClass(metadata.day_change_pct))}>
                            {pct(metadata.day_change_pct)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(String(asset.quantity))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(formatMoney(asset.current_value, asset.currency))}
                      </TableCell>
                      <TableCell
                        className={cn("text-end tabular-nums", signedClass(metrics.capitalGain))}
                      >
                        {metrics.capitalGain != null
                          ? maskValue(formatMoney(metrics.capitalGain, asset.currency))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {metrics.income ? maskValue(formatMoney(metrics.income, asset.currency)) : "—"}
                        {metrics.income > 0 && metrics.cost != null && metrics.cost > 0 && (
                          <p className="text-xs" title={t("brokerage_income_yield_hint")}>
                            {((metrics.income / metrics.cost) * 100).toFixed(1)}%
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{asset.currency}</TableCell>
                      <TableCell className={cn("text-end tabular-nums", signedClass(metrics.returnPct))}>
                        {pct(metrics.returnPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
                  })}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columnCount - 5} className="font-medium text-foreground">
                {t("breakdown_total")}
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums text-foreground">
                {money(total.value)}
              </TableCell>
              <TableCell className={cn("text-end tabular-nums", signedClass(total.gain))}>
                {money(total.gain)}
              </TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground">
                {total.income ? money(total.income) : "—"}
              </TableCell>
              <TableCell />
              <TableCell className={cn("text-end tabular-nums", signedClass(total.returnPct))}>
                {pct(total.returnPct)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      )}

      {closedRows.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {t("brokerage_closed_positions")}
              <span className="text-xs font-normal text-muted-foreground">
                ({closedRows.length})
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {t("brokerage_closed_note")}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  showClosed && "rotate-180",
                )}
              />
            </span>
          </button>
          {showClosed && (
            <div role="region" tabIndex={0} className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectable && (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={closedIds.length > 0 && closedIds.every((id) => selectedIds?.has(id))}
                          onCheckedChange={(c) => onToggleAll!(closedIds, c === true)}
                          aria-label={t("select_all")}
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-muted-foreground">{t("brokerage_holding")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("brokerage_opened_col")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("brokerage_closed_col")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("brokerage_invested")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("brokerage_proceeds")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("brokerage_realized")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("brokerage_income")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("brokerage_currency")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("brokerage_return")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedRows.map(({ asset, metadata, closedSummary }) => {
                    const s = closedSummary!;
                    const cur = (n: number) => maskValue(formatMoney(n, asset.currency));
                    return (
                      <TableRow key={asset.id}>
                        {selectable && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds!.has(asset.id)}
                              onCheckedChange={(c) => onToggleAsset!(asset.id, c === true)}
                              aria-label={asset.name}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" className="rounded-md">
                              <AvatarFallback className="rounded-md">
                                <CategoryIcon name="Equities" className="size-3.5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <Link
                                href={`/dashboard/assets/${asset.id}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {holdingDisplayName(asset.name, metadata, asset.ticker_symbol)}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {[asset.ticker_symbol, metadata.isin].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.opened ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.closed ?? "—"}</TableCell>
                        <TableCell className="text-end tabular-nums text-foreground">
                          {cur(s.invested)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-foreground">
                          {cur(s.proceeds)}
                        </TableCell>
                        <TableCell className={cn("text-end tabular-nums", signedClass(s.realized))}>
                          {cur(s.realized)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {s.income ? cur(s.income) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{asset.currency}</TableCell>
                        <TableCell className={cn("text-end tabular-nums", signedClass(s.returnPct))}>
                          {pct(s.returnPct)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={selectable ? 4 : 3} className="font-medium text-foreground">
                      {t("breakdown_total")}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-foreground">
                      {money(closedTotals.invested)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-foreground">
                      {money(closedTotals.proceeds)}
                    </TableCell>
                    <TableCell className={cn("text-end tabular-nums", signedClass(closedTotals.realized))}>
                      {money(closedTotals.realized)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {closedTotals.income ? money(closedTotals.income) : "—"}
                    </TableCell>
                    <TableCell />
                    <TableCell
                      className={cn("text-end tabular-nums", signedClass(closedTotals.returnPct))}
                    >
                      {pct(closedTotals.returnPct)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

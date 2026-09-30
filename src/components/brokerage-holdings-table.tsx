"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
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
import { computeHoldingMetrics, parseEquityMetadata } from "@/lib/equities";
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

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
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
  const { t } = useLanguage();
  const { maskValue } = usePrivacy();
  const [isRefreshing, startRefresh] = useTransition();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);

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
          baseValue: toBase(asset.current_value),
          baseGain: metrics.capitalGain != null ? toBase(metrics.capitalGain) : null,
          baseCost: metrics.cost != null ? toBase(metrics.cost) : null,
          baseIncome: toBase(metrics.income),
        };
      }),
    [assets, displayCurrency, rates],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!map.has(row.exchange)) map.set(row.exchange, []);
      map.get(row.exchange)!.push(row);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([exchange, list]) => ({
        exchange,
        rows: [...list].sort((a, b) => b.baseValue - a.baseValue),
      }));
  }, [rows]);

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

  const allIds = assets.map((a) => a.id);
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
      const failed = result.results.filter((r) => r.status === "error");
      setRefreshError(failed.length > 0);
      setRefreshMessage(
        t("brokerage_refresh_done", {
          updated: result.results.length - failed.length,
          failed: failed.length,
        }) + (failed[0]?.message ? ` — ${failed[0].ticker}: ${failed[0].message}` : ""),
      );
    });
  }

  const total = summarize(rows);
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
              <TableHead className="text-right text-muted-foreground">{t("brokerage_price")}</TableHead>
              <TableHead className="text-right text-muted-foreground">{t("brokerage_quantity")}</TableHead>
              <TableHead className="text-right text-muted-foreground">{t("brokerage_value")}</TableHead>
              <TableHead className="text-right text-muted-foreground">{t("brokerage_capital_gain")}</TableHead>
              <TableHead className="text-right text-muted-foreground">{t("brokerage_income")}</TableHead>
              <TableHead className="text-muted-foreground">{t("brokerage_currency")}</TableHead>
              <TableHead className="text-right text-muted-foreground">{t("brokerage_return")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const sub = summarize(group.rows);
              return (
                <Fragment key={group.exchange}>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableCell colSpan={columnCount - 5} className="font-medium text-foreground">
                      {group.exchange}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({group.rows.length})
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {money(sub.value)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", signedClass(sub.gain))}>
                      {money(sub.gain)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {sub.income ? money(sub.income) : "—"}
                    </TableCell>
                    <TableCell colSpan={1} />
                    <TableCell className={cn("text-right tabular-nums", signedClass(sub.returnPct))}>
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
                      <TableCell>
                        <Link
                          href={`/dashboard/assets/${asset.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {asset.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {asset.ticker_symbol ?? "—"}
                          {asset.purchase_date && ` · ${t("brokerage_opened")} ${asset.purchase_date}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {metrics.price != null ? maskValue(formatMoney(metrics.price, asset.currency)) : "—"}
                        {metadata.day_change_pct != null && (
                          <p className={cn("text-xs", signedClass(metadata.day_change_pct))}>
                            {pct(metadata.day_change_pct)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {maskValue(String(asset.quantity))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {maskValue(formatMoney(asset.current_value, asset.currency))}
                      </TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", signedClass(metrics.capitalGain))}
                      >
                        {metrics.capitalGain != null
                          ? maskValue(formatMoney(metrics.capitalGain, asset.currency))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {metrics.income ? maskValue(formatMoney(metrics.income, asset.currency)) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{asset.currency}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", signedClass(metrics.returnPct))}>
                        {pct(metrics.returnPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columnCount - 5} className="font-medium text-foreground">
                {t("breakdown_total")}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-foreground">
                {money(total.value)}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", signedClass(total.gain))}>
                {money(total.gain)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {total.income ? money(total.income) : "—"}
              </TableCell>
              <TableCell />
              <TableCell className={cn("text-right tabular-nums", signedClass(total.returnPct))}>
                {pct(total.returnPct)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

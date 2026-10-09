"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, type CSSProperties } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { MicroSparkline } from "@/components/micro-sparkline";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { AttributionPanelData } from "@/lib/dashboard-attribution";
import { formatPercent } from "@/lib/format-ratio";
import { cn } from "@/lib/utils";

const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-destructive" : "text-foreground");

/**
 * Expert panel: how much of the return on foreign-currency holdings came from
 * price moves (capital) vs exchange rates (currency), in the Base Currency.
 * Rendered only when the server found at least one such holding.
 */
export function DashboardAttributionPanel({
  data,
  baseCurrency,
  className,
  style,
}: {
  data: AttributionPanelData | null;
  baseCurrency: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();

  const money = useMemo(
    () =>
      moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0,
        signDisplay: "exceptZero" }),
    [intlLocale, baseCurrency],
  );
  if (!data) return null;

  const fmtMoney = (n: number) => maskValue(money.format(n));
  const fmtPct = (n: number | null) => (n == null ? "–" : maskValue(formatPercent(n, intlLocale)));
  const totals = data.totals;
  const share = (n: number | null) => (n == null ? "–" : formatPercent(n, intlLocale));
  const signedPct = (n: number) => `${n > 0 ? "+" : ""}${formatPercent(n, intlLocale)}`;

  const rows = totals
    ? [
        { id: "capital", label: t("xattr_capital"), amount: totals.capitalBase, pct: totals.capitalPct, color: "var(--chart-1)" },
        { id: "currency", label: t("xattr_currency"), amount: totals.currencyBase, pct: totals.currencyPct, color: "var(--chart-3)" },
        { id: "total", label: t("xattr_total"), amount: totals.totalBase, pct: totals.totalPct, color: null },
      ]
    : [];

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{t("xattr_title")}</CardTitle>
          <InfoTooltip label={t("xattr_info")} icon={<Info className="size-4" aria-hidden />}>
            <span className="block text-muted-foreground">{t("xattr_def_capital")}</span>
            <span className="mt-1 block text-muted-foreground">{t("xattr_def_currency")}</span>
          </InfoTooltip>
        </div>
        <CardDescription>{t("xattr_desc", { currency: baseCurrency })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {totals ? (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {rows.map((r) => (
                <div key={r.id} className="min-w-0 rounded-xl border border-border bg-background/40 p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {r.color ? (
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    ) : null}
                    {r.label}
                  </dt>
                  <dd className={cn("mt-1 text-xl font-semibold tabular-nums", tone(r.amount))}>{fmtMoney(r.amount)}</dd>
                  <dd className="text-xs tabular-nums text-muted-foreground">
                    {r.pct == null ? "–" : t("xattr_contrib", { pct: fmtPct(r.pct) })}
                  </dd>
                </div>
              ))}
            </dl>

            <div
              role="img"
              aria-label={t("xattr_split", { capital: share(totals.capitalShare), currency: share(totals.currencyShare) })}
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {totals.capitalShare != null && totals.currencyShare != null ? (
                <>
                  <div className="h-full" style={{ width: `${totals.capitalShare * 100}%`, backgroundColor: "var(--chart-1)" }} />
                  <div className="h-full" style={{ width: `${totals.currencyShare * 100}%`, backgroundColor: "var(--chart-3)" }} />
                </>
              ) : null}
            </div>

            {data.top.length > 0 ? (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("xattr_top_title")}</h3>
                <ol className="divide-y divide-border text-sm">
                  {data.top.map((h) => {
                    const trend = data.fxTrends?.[h.currency];
                    const change = trend && trend.length >= 2 && trend[0] > 0 ? trend[trend.length - 1] / trend[0] - 1 : null;
                    const trendText =
                      change == null ? "" : t("xattr_trend_title", { currency: h.currency, base: baseCurrency, change: signedPct(change) });
                    return (
                      <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate" title={h.name}>
                          {h.name} <span className="text-xs text-muted-foreground">{h.currency}</span>
                        </span>
                        {trend && change != null ? (
                          <span data-testid={`fx-trend-${h.currency}`} className="ms-auto flex shrink-0 items-center gap-2" title={trendText}>
                            <MicroSparkline values={trend} width={72} height={22} />
                            <span className={cn("w-14 text-end font-mono text-xs tabular-nums", tone(change))}>{signedPct(change)}</span>
                            <span className="sr-only">{trendText}</span>
                          </span>
                        ) : null}
                        <span className={cn("shrink-0 tabular-nums", tone(h.currencyBase))}>{fmtMoney(h.currencyBase)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {t("xattr_unavailable")}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {t("xattr_coverage", { included: String(data.included), total: String(data.total) })}
        </p>
        <p className="text-xs text-muted-foreground">{t("xattr_note")}</p>
      </CardContent>
    </Card>
  );
}

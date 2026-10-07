"use client";

import { AlertTriangle, Info } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIrrText } from "@/components/irr-compare-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { CompareSideResult } from "@/lib/irr-compare-types";
import {
  formatMoney,
  formatMultiple,
  formatPoints,
  formatRate,
  formatYears,
  horizonsDiffer,
  rateDifferencePp,
} from "@/lib/irr-compare-view";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Series of one side on a "years since its first flow" axis, so different dates line up. */
export function yearsSeries(series: CompareSideResult["series"]): { t: number; value: number }[] {
  if (series.length === 0) return [];
  const start = Date.parse(series[0].date);
  return series.map((p) => ({ t: (Date.parse(p.date) - start) / YEAR_MS, value: p.value }));
}

function Warning({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <li data-testid={id} className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-3 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/** Side-by-side figures, the difference in percentage points and the cumulative-position chart. */
export function IrrComparePanel({ a, b }: { a: CompareSideResult | null; b: CompareSideResult | null }) {
  const tx = useIrrText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();

  const labelA = tx("irr_side_a");
  const labelB = tx("irr_side_b");

  return (
    <Card data-testid="irr-panel">
      <CardHeader>
        <CardTitle className="text-lg">{tx("irr_compare_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!a || !b ? (
          <p data-testid="irr-panel-pending" className="text-sm text-muted-foreground">
            {tx("irr_compare_pending")}
          </p>
        ) : (
          <Body a={a} b={b} labelA={labelA} labelB={labelB} locale={intlLocale} mask={maskValue} />
        )}

        <p data-testid="irr-disclaimer" className="flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{tx("irr_disclaimer")}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Body({
  a,
  b,
  labelA,
  labelB,
  locale,
  mask,
}: {
  a: CompareSideResult;
  b: CompareSideResult;
  labelA: string;
  labelB: string;
  locale: string;
  mask: (v: string | number) => string;
}) {
  const tx = useIrrText();
  const diff = rateDifferencePp(a, b);
  const multipleRoots = a.warnings.includes("multiple_roots") || b.warnings.includes("multiple_roots");
  const differentHorizons = horizonsDiffer(a, b);
  const differentCurrency = a.currency !== b.currency;
  const money = (n: number, side: CompareSideResult) => mask(formatMoney(n, locale, side.currency));
  const rateText = (side: CompareSideResult) => (side.irr.ok ? formatRate(side.irr.rate, locale) : "-");

  const rows: { id: string; label: string; cell: (s: CompareSideResult) => string }[] = [
    { id: "irr", label: tx("irr_row_irr"), cell: rateText },
    { id: "in", label: tx("irr_row_in"), cell: (s) => (s.summary ? money(s.summary.moneyIn, s) : "-") },
    { id: "out", label: tx("irr_row_out"), cell: (s) => (s.summary ? money(s.summary.moneyOut, s) : "-") },
    { id: "gain", label: tx("irr_row_gain"), cell: (s) => (s.summary ? money(s.summary.gain, s) : "-") },
    { id: "multiple", label: tx("irr_row_multiple"), cell: (s) => (s.summary ? formatMultiple(s.summary.multiple, locale) : "-") },
    {
      id: "horizon",
      label: tx("irr_row_horizon"),
      cell: (s) => (s.summary ? tx("irr_years_value", { n: formatYears(s.summary.years, locale) }) : "-"),
    },
  ];

  const seriesA = yearsSeries(a.series);
  const seriesB = yearsSeries(b.series);
  const chartSummary = [
    { label: labelA, side: a, pts: seriesA },
    { label: labelB, side: b, pts: seriesB },
  ]
    .filter((x) => x.pts.length > 0)
    .map((x) =>
      tx("irr_chart_summary", {
        label: x.label,
        start: money(x.pts[0].value, x.side),
        end: money(x.pts[x.pts.length - 1].value, x.side),
        years: formatYears(x.pts[x.pts.length - 1].t, locale),
      }),
    );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{labelA}</p>
          <p data-testid="irr-panel-rate-a" className="truncate text-2xl font-semibold tabular-nums text-foreground">
            {rateText(a)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{labelB}</p>
          <p data-testid="irr-panel-rate-b" className="truncate text-2xl font-semibold tabular-nums text-foreground">
            {rateText(b)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{tx("irr_diff_label")}</p>
          <p data-testid="irr-panel-diff" className="truncate text-2xl font-semibold tabular-nums text-foreground">
            {diff === null ? "-" : tx("irr_diff_value", { value: formatPoints(diff, locale) })}
          </p>
        </div>
      </div>

      {(differentHorizons || differentCurrency || multipleRoots) && (
        <ul className="space-y-2">
          {differentHorizons && a.summary && b.summary && (
            <Warning id="irr-warn-horizon">
              {tx("irr_warn_horizon", { a: formatYears(a.summary.years, locale), b: formatYears(b.summary.years, locale) })}
            </Warning>
          )}
          {differentCurrency && (
            <Warning id="irr-warn-currency">{tx("irr_warn_currency", { a: a.currency, b: b.currency })}</Warning>
          )}
          {multipleRoots && <Warning id="irr-warn-multiple">{tx("irr_warn_multiple")}</Warning>}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table data-testid="irr-table" className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs text-muted-foreground">
              <th scope="col" className="py-2 pe-3 text-start font-normal">
                <span className="sr-only">{tx("irr_compare_title")}</span>
              </th>
              <th scope="col" className="px-3 py-2 text-end font-medium">
                {labelA}
              </th>
              <th scope="col" className="ps-3 py-2 text-end font-medium">
                {labelB}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`irr-row-${row.id}`} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pe-3 text-start font-normal text-muted-foreground">
                  {row.label}
                </th>
                <td data-testid={`irr-row-${row.id}-a`} className="px-3 py-2 text-end tabular-nums text-foreground">
                  {row.cell(a)}
                </td>
                <td data-testid={`irr-row-${row.id}-b`} className="ps-3 py-2 text-end tabular-nums text-foreground">
                  {row.cell(b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figure className="space-y-2" data-testid="irr-chart">
        <figcaption className="text-sm font-medium text-foreground">{tx("irr_chart_title")}</figcaption>
        <div role="img" aria-label={tx("irr_chart_aria")} aria-describedby="irr-chart-summary" className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                type="number"
                dataKey="t"
                domain={[0, "dataMax"]}
                tickFormatter={(v) => formatYears(Number(v), locale)}
                stroke="var(--color-muted-foreground)"
                fontSize={12}
                label={{ value: tx("irr_chart_x"), position: "insideBottom", offset: -2, fontSize: 12, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={12}
                width={72}
                tickFormatter={(v) => mask(new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Number(v)))}
              />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" }}
                labelFormatter={(v) => `${tx("irr_chart_x")}: ${formatYears(Number(v), locale)}`}
                formatter={(value) => mask(formatMoney(Number(value), locale, a.currency))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                data={seriesA}
                dataKey="value"
                name={labelA}
                type="monotone"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                data={seriesB}
                dataKey="value"
                name={labelB}
                type="monotone"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p id="irr-chart-summary" data-testid="irr-chart-summary" className="text-xs text-muted-foreground">
          {chartSummary.join(" ")}
        </p>
      </figure>
    </>
  );
}

"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTierMotion } from "@/components/tier-gate";
import { usePeLiquidityText } from "@/components/pe-liquidity-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import type { PeLiquidityData, PeLiquidityRow, PeUpcomingCall } from "@/lib/pe-liquidity-data";
import { cn } from "@/lib/utils";

/** Missing data is always an en dash, never 0 or NaN. */
const DASH = "–";

const TERMINAL_TABLE = cn(
  "w-full caption-bottom text-xs tabular-nums",
  "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2",
  "[&_thead_th]:border-b [&_thead_th]:border-primary/40",
  "[&_tbody_tr:nth-child(even)]:bg-muted/25 [&_tbody_tr:hover]:bg-primary/10",
);
const num = "whitespace-nowrap text-end font-mono tabular-nums";
const th = "whitespace-nowrap text-start text-xs font-medium uppercase tracking-wide text-muted-foreground [&.num]:text-end";

/** Calendar month key (YYYY-MM) of an ISO day, `delta` months later. */
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

type Bucket = { ym: string; total: number; calls: PeUpcomingCall[] };

/** Overdue calls, then twelve monthly buckets from today's month (anything later is clamped into the last one). */
function bucketCalls(upcoming: PeUpcomingCall[], today: string): { overdue: Bucket; months: Bucket[] } {
  const start = today.slice(0, 7);
  const months: Bucket[] = Array.from({ length: 12 }, (_, i) => ({ ym: addMonths(start, i), total: 0, calls: [] }));
  const overdue: Bucket = { ym: "overdue", total: 0, calls: [] };
  for (const c of upcoming) {
    const idx = months.findIndex((b) => b.ym === c.dueDate.slice(0, 7));
    const bucket = c.overdue ? overdue : months[idx >= 0 ? idx : 11];
    bucket.total += c.amount;
    bucket.calls.push(c);
  }
  return { overdue, months };
}

export function PeLiquidityPanel({
  data,
  baseCurrency,
  className,
  style,
}: {
  data: PeLiquidityData;
  baseCurrency: string;
  className?: string;
  style?: CSSProperties;
}) {
  const pt = usePeLiquidityText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();

  const money = useMemo(
    () => moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const ratio = useMemo(() => new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [intlLocale]);
  const pct = useMemo(() => new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [intlLocale]);
  const monthName = useMemo(() => new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }), [intlLocale]);

  const na = pt("pel_na");
  const dash = (title?: string) => (
    <span aria-label={title ?? na} title={title ?? na}>
      {DASH}
    </span>
  );
  const fmtMoney = (n: number | null) => (n == null ? dash() : maskValue(money.format(n)));
  const fmtRatio = (n: number | null) => (n == null ? dash() : maskValue(`${ratio.format(n)}x`));
  const gapText = (gap: PeLiquidityRow["irrGap"]) =>
    gap === "no_paid_in" ? pt("pel_irr_no_paid_in") : gap === "undated_flows" ? pt("pel_irr_undated_flows") : pt("pel_irr_no_solution");
  const fmtIrr = (n: number | null, gap: PeLiquidityRow["irrGap"]) => (n == null ? dash(gapText(gap ?? "no_solution")) : `${pct.format(n * 100)}%`);

  const { overdue, months } = useMemo(() => bucketCalls(data.upcoming, data.today), [data.upcoming, data.today]);
  const label = pt("pel_title");

  return (
    <Card className={cn("min-w-0 gap-4 border-border bg-card py-5", className)} style={style}>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>{pt("pel_desc", { currency: baseCurrency })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{pt("pel_empty")}</p>
        ) : (
          <>
            <div
              role="region"
              aria-label={label}
              tabIndex={0}
              className="max-h-80 overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <table className={TERMINAL_TABLE}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>{pt("pel_col_fund")}</th>
                    {(["pel_col_paid_in", "pel_col_unfunded", "pel_col_nav", "pel_col_distributed", "pel_col_dpi", "pel_col_rvpi", "pel_col_tvpi", "pel_col_net_irr"] as const).map((k) => (
                      <th key={k} scope="col" className={cn(th, "num")}>{pt(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-48 truncate font-medium" title={r.name}>
                        <Link href={`/dashboard/assets/${r.id}`} className="hover:underline">{r.name}</Link>
                      </td>
                      <td className={num}>{fmtMoney(r.paidIn)}</td>
                      <td className={num}>{fmtMoney(r.unfunded)}</td>
                      <td className={num}>{fmtMoney(r.nav)}</td>
                      <td className={num}>{fmtMoney(r.distributed)}</td>
                      <td className={num}>{fmtRatio(r.dpi)}</td>
                      <td className={num}>{fmtRatio(r.rvpi)}</td>
                      <td className={num}>{fmtRatio(r.tvpi)}</td>
                      <td className={num}>{fmtIrr(r.netIrr, r.irrGap)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-primary/40 font-semibold" data-testid="pel-portfolio-row">
                      <td>{pt("pel_total")}</td>
                      <td className={num}>{fmtMoney(data.portfolio.paidIn)}</td>
                      <td className={num}>{fmtMoney(data.portfolio.unfunded)}</td>
                      <td className={num}>{fmtMoney(data.portfolio.nav)}</td>
                      <td className={num}>{fmtMoney(data.portfolio.distributed)}</td>
                      <td className={num}>{fmtRatio(data.portfolio.dpi)}</td>
                      <td className={num}>{fmtRatio(data.portfolio.rvpi)}</td>
                      <td className={num}>{fmtRatio(data.portfolio.tvpi)}</td>
                      <td className={num}>{fmtIrr(data.portfolio.netIrr, data.portfolio.netIrr == null && data.portfolio.undatedFunds > 0 ? "undated_flows" : "no_solution")}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data.portfolio.undatedFunds > 0 && <p className="text-xs text-muted-foreground">{pt("pel_undated_note", { n: data.portfolio.undatedFunds })}</p>}
          </>
        )}

        <section aria-label={pt("pel_upcoming_title")} className="space-y-2 border-t border-primary/40 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-index text-xs uppercase tracking-widest text-muted-foreground">{pt("pel_upcoming_title")}</h3>
            {data.upcoming.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-foreground">{pt("pel_upcoming_total", { amount: maskValue(money.format(data.upcomingTotal)) })}</span>
            )}
          </div>
          {data.upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">{pt("pel_upcoming_empty")}</p>
          ) : (
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-px bg-border" data-testid="pel-strip">
              {overdue.calls.length > 0 && (
                <li className="bg-card px-2 py-1.5" title={overdue.calls.map((c) => c.fund).join(", ")}>
                  <p className="text-[10px] uppercase tracking-wide text-destructive">{pt("pel_overdue")}</p>
                  <p className="font-mono text-xs tabular-nums text-destructive">{maskValue(money.format(overdue.total))}</p>
                </li>
              )}
              {months.map((b) => {
                const [y, m] = b.ym.split("-").map(Number);
                return (
                  <li key={b.ym} className="bg-card px-2 py-1.5" title={b.calls.map((c) => c.fund).join(", ") || undefined}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {monthName.format(new Date(Date.UTC(y, m - 1, 1)))} {String(y).slice(2)}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-foreground">{b.calls.length > 0 ? maskValue(money.format(b.total)) : DASH}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="text-xs text-muted-foreground">{pt("pel_note")}</p>
      </CardContent>
    </Card>
  );
}

/** The Expert dashboard block (registered as `expertLiquidity` in lib/dashboard-layout.ts). */
export function ExpertLiquidityBlock({ data, baseCurrency }: { data: PeLiquidityData; baseCurrency: string }) {
  const motion = useTierMotion();
  return (
    <PeLiquidityPanel
      data={data}
      baseCurrency={baseCurrency}
      className="h-full animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
      style={tileEntranceStyle(motion, 6)}
    />
  );
}

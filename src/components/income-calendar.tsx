"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import type { IncomeCalendar as IncomeCalendarData } from "@/lib/income-calendar";
import type { PassiveIncomeSource } from "@/lib/passive-income";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SOURCES: { source: PassiveIncomeSource; label: TranslationKey; bar: string }[] = [
  { source: "rental", label: "passive_source_rental", bar: "bg-chart-1" },
  { source: "stocks", label: "passive_source_stocks", bar: "bg-chart-2" },
  { source: "reit", label: "passive_source_reit", bar: "bg-chart-3" },
  { source: "private_equity", label: "passive_source_private_equity", bar: "bg-chart-4" },
];

/**
 * Forward 12-month passive-income calendar (see `lib/income-calendar.ts`): one
 * column per month with a bar scaled to the best month and stacked per source;
 * click a month to list what makes it up. Estimated rows carry a badge.
 */
export function IncomeCalendar({
  calendar,
  baseCurrency,
  className,
}: {
  calendar: IncomeCalendarData;
  baseCurrency: string;
  className?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();
  const [selected, setSelected] = useState<string | null>(null);

  const money = useMemo(
    () => new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency, maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const monthLabel = useMemo(() => {
    const short = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
    const date = (key: string) => new Date(`${key}-01T00:00:00Z`);
    return { short: (k: string) => short.format(date(k)), long: (k: string) => long.format(date(k)) };
  }, [intlLocale]);
  const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

  const max = Math.max(0, ...calendar.months.map((m) => m.total));
  const empty = calendar.annualTotal <= 0;
  const open = calendar.months.find((m) => m.month === selected) ?? null;
  const usedSources = SOURCES.filter((s) => calendar.months.some((m) => m.bySource[s.source] > 0));

  const stats = [
    { label: t("ical_annual"), value: maskValue(money.format(calendar.annualTotal)), tone: "text-success" },
    { label: t("ical_avg"), value: maskValue(money.format(calendar.monthlyAverage)), tone: "text-foreground" },
    {
      label: t("ical_best"),
      value: calendar.peakMonth ? monthLabel.long(calendar.peakMonth) : "—",
      tone: "text-foreground",
    },
    { label: t("ical_yield_cost"), value: pct(calendar.yieldOnCostPct), tone: "text-foreground" },
    { label: t("ical_yield_current"), value: pct(calendar.currentYieldPct), tone: "text-foreground" },
  ];

  return (
    <Card
      className={cn(
        "border-border bg-card animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
        className,
      )}
      style={tileEntranceStyle(motion, 0)}
    >
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-background text-primary">
            <CalendarDays className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-foreground">{t("ical_title")}</h2>
            <p className="text-xs text-muted-foreground">{t("ical_desc", { currency: baseCurrency })}</p>
          </div>
        </div>

        {empty ? (
          <p className="text-sm text-muted-foreground">{t("ical_empty")}</p>
        ) : (
          <>
            <p className="sr-only">
              {t("ical_summary", {
                total: money.format(calendar.annualTotal),
                avg: money.format(calendar.monthlyAverage),
              })}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {stats.map((s) => (
                <div key={s.label} className="rounded-md border border-border bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">{s.label}</dt>
                  <dd className={cn("text-base font-semibold tabular-nums", s.tone)}>{s.value}</dd>
                </div>
              ))}
            </dl>

            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
              {calendar.months.map((m) => {
                const active = selected === m.month;
                const label = t("ical_bar_label", { month: monthLabel.long(m.month), total: money.format(m.total) });
                return (
                  <li key={m.month}>
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={label}
                      onClick={() => setSelected(active ? null : m.month)}
                      className={cn(
                        "flex w-full flex-col items-stretch gap-1.5 rounded-md border p-2 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-primary bg-primary/5" : "border-border bg-background",
                      )}
                    >
                      <span className="text-xs font-medium text-foreground">{monthLabel.short(m.month)}</span>
                      <span
                        role="img"
                        aria-label={label}
                        className="flex h-20 flex-col-reverse overflow-hidden rounded-sm bg-muted"
                      >
                        {SOURCES.map((s) => {
                          const v = m.bySource[s.source];
                          if (!(v > 0) || max <= 0) return null;
                          return (
                            <span
                              key={s.source}
                              data-source={s.source}
                              className={cn("block w-full", s.bar)}
                              style={{ height: `${(v / max) * 100}%` }}
                            />
                          );
                        })}
                      </span>
                      <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">
                        {maskValue(money.format(m.total))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {usedSources.map((s) => (
                <li key={s.source} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", s.bar)} aria-hidden="true" />
                  {t(s.label)}
                </li>
              ))}
            </ul>

            <div aria-live="polite" className="rounded-md border border-border">
              {open ? (
                <div className="space-y-2 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {t("ical_month_detail", { month: monthLabel.long(open.month) })}
                  </p>
                  {open.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("ical_no_items")}</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {open.items.map((item, i) => (
                        <li key={`${item.assetId}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="min-w-0 text-foreground">
                            <span className="truncate">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t(SOURCES.find((s) => s.source === item.source)?.label ?? "passive_source_rental")}
                              {item.date ? ` · ${item.date}` : ""}
                              {item.basis !== "contract" && (
                                <span className="ms-2 rounded border border-border px-1.5 py-0.5">
                                  {t(item.basis === "estimate" ? "ical_basis_estimate" : "ical_basis_history")}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-success">{maskValue(money.format(item.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="p-3 text-xs text-muted-foreground">{t("ical_select_hint")}</p>
              )}
            </div>

            <table className="sr-only">
              <caption>{t("ical_title")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("ical_col_month")}</th>
                  <th scope="col">{t("ical_col_total")}</th>
                </tr>
              </thead>
              <tbody>
                {calendar.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{monthLabel.long(m.month)}</th>
                    <td>{money.format(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
          {t("ical_disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}

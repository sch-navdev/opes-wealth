"use client";

import { moneyFormatter } from "@/lib/money-parts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useCashFlowText } from "@/components/cash-flow-text";
import type { CashFlowKey } from "@/lib/cash-flow-labels";
import type { EarnedGroup } from "@/lib/income-streams";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import type { IncomeCalendar as IncomeCalendarData } from "@/lib/income-calendar";
import type { LiabilityKind } from "@/lib/income-calendar-liabilities";
import type { PassiveIncomeSource } from "@/lib/passive-income";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SOURCES: { source: PassiveIncomeSource; label: TranslationKey; bar: string }[] = [
  { source: "rental", label: "passive_source_rental", bar: "bg-chart-1" },
  { source: "stocks", label: "passive_source_stocks", bar: "bg-chart-2" },
  { source: "reit", label: "passive_source_reit", bar: "bg-chart-3" },
  { source: "private_equity", label: "passive_source_private_equity", bar: "bg-chart-4" },
];

/** Earned-income layer (salary, bonus, other earned): separate legend entries, shown only when the toggle is on. */
const EARNED: { group: EarnedGroup; label: CashFlowKey; bar: string }[] = [
  { group: "salary", label: "cf_cal_salary", bar: "bg-chart-5" },
  { group: "bonus", label: "cf_cal_bonus", bar: "bg-primary" },
  { group: "gratuity", label: "cf_cal_gratuity", bar: "bg-foreground/60" },
  { group: "other", label: "cf_cal_other", bar: "bg-muted-foreground" },
];

type View = "all" | "gross" | "liabilities" | "net";
const VIEWS: { view: Exclude<View, "all">; label: CashFlowKey; tone: string }[] = [
  { view: "gross", label: "cf_cal_view_gross", tone: "text-success" },
  { view: "liabilities", label: "cf_cal_view_liabilities", tone: "text-destructive" },
  { view: "net", label: "cf_cal_view_net", tone: "text-foreground" },
];
const LIABILITY_BARS: { kind: LiabilityKind; label: CashFlowKey; bar: string }[] = [
  { kind: "mortgage", label: "cf_cal_liab_mortgage", bar: "bg-chart-1" },
  { kind: "loan", label: "cf_cal_liab_loan", bar: "bg-chart-2" },
  { kind: "off_plan", label: "cf_cal_liab_off_plan", bar: "bg-chart-3" },
  { kind: "private_equity", label: "cf_cal_liab_private_equity", bar: "bg-chart-4" },
  { kind: "credit_card", label: "cf_cal_liab_credit_card", bar: "bg-chart-5" },
  { kind: "other", label: "cf_cal_liab_other", bar: "bg-muted-foreground" },
];

const earnedSum = (m: IncomeCalendarData["months"][number]) =>
  m.earned ? m.earned.salary + m.earned.bonus + m.earned.gratuity + m.earned.other : 0;

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
  // All three at once (gross, liabilities, net) month by month; a tile focuses on one of them.
  const [view, setView] = useState<View>("all");
  const tt = useCashFlowText();
  // Salary is earned, not passive, but it IS income: it is counted by default (in its own colour) and can be switched off.
  const [includeEarned, setIncludeEarned] = useState(true);
  const hasEarned = calendar.months.some((m) => m.earned !== undefined);
  const showEarned = includeEarned && hasEarned;
  const earnedOf = (m: IncomeCalendarData["months"][number]) => (showEarned ? earnedSum(m) : 0);
  const earnedAnnual = calendar.months.reduce((s, m) => s + earnedSum(m), 0);
  const combined = (m: IncomeCalendarData["months"][number]) => m.total + earnedOf(m);

  const money = useMemo(
    () => moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const monthLabel = useMemo(() => {
    const short = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
    const date = (key: string) => new Date(`${key}-01T00:00:00Z`);
    return { short: (k: string) => short.format(date(k)), long: (k: string) => long.format(date(k)) };
  }, [intlLocale]);
  const pct = (n: number | null) =>
    n == null ? "—" : `${new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;

  const netOf = (m: IncomeCalendarData["months"][number]) => combined(m) - m.liabilityTotal;
  const shown = (m: IncomeCalendarData["months"][number]) =>
    view === "gross" ? combined(m) : view === "liabilities" ? m.liabilityTotal : view === "net" ? Math.abs(netOf(m)) : Math.max(combined(m), m.liabilityTotal, Math.abs(netOf(m)));
  const max = Math.max(0, ...calendar.months.map(shown));
  const grossAnnual = calendar.annualTotal + (showEarned ? earnedAnnual : 0);
  const netAnnual = grossAnnual - calendar.liabilityAnnual;
  const empty = calendar.annualTotal <= 0 && !(showEarned && earnedAnnual > 0) && calendar.liabilityAnnual <= 0;
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
          <div className="flex shrink-0 items-center justify-center text-primary">
            <CalendarDays className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-foreground">
              <Link href="/dashboard/income-calendar" className="hover:underline">
                {t("ical_title")}
              </Link>
              <Link href="/dashboard/income-calendar" className="ms-3 text-xs font-normal text-primary hover:underline">
                {tt("cf_cal_open_full")}
              </Link>
            </h2>
            <p className="text-xs text-muted-foreground">{t("ical_desc", { currency: baseCurrency })}</p>
          </div>
          {hasEarned && (
            <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Switch size="sm" checked={includeEarned} onCheckedChange={setIncludeEarned} aria-label={tt("cf_cal_toggle")} />
              {tt("cf_cal_toggle")}
            </label>
          )}
        </div>
        {showEarned && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {tt("cf_cal_earned_total", { amount: maskValue(money.format(earnedAnnual)) })}
          </p>
        )}

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
            <div role="group" aria-label={tt("cf_cal_view_label")} className="grid grid-cols-3 gap-3">
              {VIEWS.map((v) => {
                const amount = v.view === "gross" ? grossAnnual : v.view === "liabilities" ? calendar.liabilityAnnual : netAnnual;
                return (
                  <button
                    key={v.view}
                    type="button"
                    aria-pressed={view === v.view}
                    onClick={() => setView(view === v.view ? "all" : v.view)}
                    className={cn(
                      "rounded-md border p-3 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      view === v.view ? "border-primary bg-primary/5" : "border-border bg-muted/30",
                    )}
                  >
                    <span className="block text-xs text-muted-foreground">{tt(v.label)}</span>
                    <span className={cn("block text-base font-semibold tabular-nums", v.view === "net" && amount < 0 ? "text-destructive" : v.tone)}>
                      {maskValue(money.format(v.view === "liabilities" ? -amount : amount))}
                    </span>
                  </button>
                );
              })}
            </div>
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
                const label = t("ical_bar_label", { month: monthLabel.long(m.month), total: money.format(view === "net" ? netOf(m) : view === "all" ? combined(m) : shown(m)) });
                return (
                  <li key={m.month} className="group relative">
                    <MonthBreakdown view={view} month={m} showEarned={showEarned} money={money} maskValue={maskValue} tt={tt} t={t} />
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
                        {view === "all" && max > 0 && (
                          <span className="flex h-full w-full items-end gap-0.5" aria-hidden="true">
                            <span className="flex h-full flex-1 flex-col-reverse" data-col="gross">
                              {SOURCES.map((s) => {
                                const v = m.bySource[s.source];
                                return v > 0 ? <span key={s.source} data-source={s.source} className={cn("block w-full", s.bar)} style={{ height: `${(v / max) * 100}%` }} /> : null;
                              })}
                              {showEarned &&
                                EARNED.map((e) => {
                                  const v = m.earned?.[e.group] ?? 0;
                                  return v > 0 ? <span key={e.group} data-earned={e.group} className={cn("block w-full", e.bar)} style={{ height: `${(v / max) * 100}%` }} /> : null;
                                })}
                            </span>
                            <span className="flex h-full flex-1 flex-col-reverse" data-col="liabilities">
                              {m.liabilityTotal > 0 && <span data-liability="total" className="block w-full bg-destructive" style={{ height: `${(m.liabilityTotal / max) * 100}%` }} />}
                            </span>
                            <span className="flex h-full flex-1 flex-col-reverse" data-col="net">
                              {netOf(m) !== 0 && (
                                <span data-net={netOf(m) < 0 ? "negative" : "positive"} className={cn("block w-full", netOf(m) < 0 ? "bg-destructive/60" : "bg-success")} style={{ height: `${(Math.abs(netOf(m)) / max) * 100}%` }} />
                              )}
                            </span>
                          </span>
                        )}
                        {view === "net" && max > 0 && (
                          <span
                            data-net={netOf(m) < 0 ? "negative" : "positive"}
                            className={cn("block w-full", netOf(m) < 0 ? "bg-destructive" : "bg-success")}
                            style={{ height: `${(Math.abs(netOf(m)) / max) * 100}%` }}
                          />
                        )}
                        {view === "liabilities" &&
                          LIABILITY_BARS.map((l) => {
                            const v = m.liabilities[l.kind];
                            if (!(v > 0) || max <= 0) return null;
                            return <span key={l.kind} data-liability={l.kind} className={cn("block w-full", l.bar)} style={{ height: `${(v / max) * 100}%` }} />;
                          })}
                        {view === "gross" && SOURCES.map((s) => {
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
                        {view === "gross" && showEarned &&
                          EARNED.map((e) => {
                            const v = m.earned?.[e.group] ?? 0;
                            if (!(v > 0) || max <= 0) return null;
                            return (
                              <span
                                key={e.group}
                                data-earned={e.group}
                                className={cn("block w-full", e.bar)}
                                style={{ height: `${(v / max) * 100}%` }}
                              />
                            );
                          })}
                      </span>
                      <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">
                        {view === "all" ? (
                          <>
                            <span className="block text-success">{maskValue(money.format(combined(m)))}</span>
                            <span className="block text-destructive">{maskValue(money.format(-m.liabilityTotal))}</span>
                            <span className={cn("block font-medium", netOf(m) < 0 ? "text-destructive" : "text-foreground")}>{maskValue(money.format(netOf(m)))}</span>
                          </>
                        ) : (
                          maskValue(money.format(view === "net" ? netOf(m) : view === "liabilities" ? -m.liabilityTotal : combined(m)))
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {view === "liabilities" &&
                LIABILITY_BARS.filter((l) => calendar.months.some((m) => m.liabilities[l.kind] > 0)).map((l) => (
                  <li key={l.kind} className="flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-sm", l.bar)} aria-hidden="true" />
                    {tt(l.label)}
                  </li>
                ))}
              {(view === "net" || view === "all") && (
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-success" aria-hidden="true" />
                  {tt("cf_cal_net_note")}
                </li>
              )}
              {view === "all" && (
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-destructive" aria-hidden="true" />
                  {tt("cf_cal_view_liabilities")}
                </li>
              )}
              {(view === "gross" || view === "all") && usedSources.map((s) => (
                <li key={s.source} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", s.bar)} aria-hidden="true" />
                  {t(s.label)}
                </li>
              ))}
              {(view === "gross" || view === "all") && showEarned &&
                EARNED.filter((e) => calendar.months.some((m) => (m.earned?.[e.group] ?? 0) > 0)).map((e) => (
                  <li key={e.group} className="flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-sm", e.bar)} aria-hidden="true" />
                    {tt(e.label)}
                  </li>
                ))}
            </ul>

            <div aria-live="polite" className="rounded-md border border-border">
              {open ? (
                <div className="space-y-2 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {t("ical_month_detail", { month: monthLabel.long(open.month) })}
                  </p>
                  {(view === "liabilities" || view === "all") && (
                    open.liabilityItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{tt("cf_cal_liab_none")}</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {open.liabilityItems.map((item, i) => (
                          <li key={`${item.assetId}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                            <span className="min-w-0 text-foreground">
                              <span className="truncate">{item.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {tt(LIABILITY_BARS.find((l) => l.kind === item.kind)?.label ?? "cf_cal_liab_other")}
                                {item.date ? ` · ${item.date}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-destructive">{maskValue(money.format(-item.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                  {(view === "net" || view === "all") && (
                    <p className="text-sm tabular-nums text-foreground">
                      {tt("cf_cal_hover_gross")} {maskValue(money.format(combined(open)))} − {tt("cf_cal_hover_liabilities")} {maskValue(money.format(open.liabilityTotal))} = {maskValue(money.format(netOf(open)))}
                    </p>
                  )}
                  {view !== "liabilities" && showEarned && (open.earnedItems?.length ?? 0) > 0 && (
                    <ul className="divide-y divide-border" aria-label={tt("cf_cal_earned_label")}>
                      {open.earnedItems?.map((item, i) => (
                        <li key={`${item.streamId}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="min-w-0 text-foreground">
                            <span className="truncate">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {tt(EARNED.find((e) => e.group === item.group)?.label ?? "cf_cal_other")} · {item.date}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-success">{maskValue(money.format(item.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {view === "liabilities" ? null : open.items.length === 0 && !(showEarned && (open.earnedItems?.length ?? 0) > 0) ? (
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
                    <td>{money.format(combined(m))}</td>
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

/**
 * Hover / keyboard-focus breakdown of one month, for the selected view. Gross: earned income (each group as ONE
 * line with its employers under it) apart from passive income (one line per source). Liabilities: one line per
 * kind (mortgage, loan, off-plan, capital calls, cards...) with the items under it. Net: gross minus liabilities.
 * Purely visual (aria-hidden): the month's button carries its total and clicking it opens the full list.
 */
function MonthBreakdown({
  view,
  month,
  showEarned,
  money,
  maskValue,
  tt,
  t,
}: {
  view: View;
  month: IncomeCalendarData["months"][number];
  showEarned: boolean;
  money: { format: (n: number) => string };
  maskValue: (v: string) => string;
  tt: (key: CashFlowKey) => string;
  t: (key: TranslationKey) => string;
}) {
  const m = (n: number) => maskValue(money.format(n));
  const earnedGroups = showEarned
    ? EARNED.flatMap((e) => {
        const total = month.earned?.[e.group] ?? 0;
        if (!(total > 0)) return [];
        // One line per employer (several payments from the same employer in a month are added up).
        const byEmployer = new Map<string, number>();
        for (const i of (month.earnedItems ?? []).filter((x) => x.group === e.group)) {
          byEmployer.set(i.source || i.name, (byEmployer.get(i.source || i.name) ?? 0) + i.amount);
        }
        return [{ group: e.group, bar: e.bar, total, employers: [...byEmployer.entries()] }];
      })
    : [];
  const earnedTotal = earnedGroups.reduce((s, g) => s + g.total, 0);
  const passive = SOURCES.filter((s) => month.bySource[s.source] > 0);
  const liabilities = LIABILITY_BARS.filter((l) => month.liabilities[l.kind] > 0);
  const gross = month.total + earnedTotal;
  if (gross <= 0 && month.liabilityTotal <= 0) return null;

  const row = (label: string, amount: number, bar?: string, strong = false) => (
    <p className={cn("flex items-center justify-between gap-2", strong && "font-medium")}>
      <span className="flex items-center gap-1.5">
        {bar && <span className={cn("size-2 rounded-sm", bar)} />}
        {label}
      </span>
      <span className="tabular-nums">{m(amount)}</span>
    </p>
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible absolute bottom-full start-1/2 z-20 mb-1 w-60 -translate-x-1/2 space-y-1.5 border border-border bg-popover p-2 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 rtl:translate-x-1/2"
    >
      {view !== "liabilities" && (
        <>
          {earnedGroups.length > 0 && (
            <div className="space-y-1">
              {row(tt("cf_cal_hover_earned"), earnedTotal, undefined, true)}
              {earnedGroups.map((g) => (
                <div key={g.group}>
                  {row(tt(EARNED.find((e) => e.group === g.group)?.label ?? "cf_cal_other"), g.total, g.bar)}
                  {g.employers.length > 1 || (g.employers.length === 1 && g.employers[0][0]) ? (
                    <ul className="ms-3.5 text-muted-foreground">
                      {g.employers.map(([name, amount]) => (
                        <li key={name} className="flex justify-between gap-2">
                          <span className="truncate">{name}</span>
                          <span className="tabular-nums">{m(amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {month.total > 0 && (
            <div className="space-y-1">
              {row(tt("cf_cal_hover_passive"), month.total, undefined, true)}
              {passive.map((s) => (
                <div key={s.source}>{row(t(s.label), month.bySource[s.source], s.bar)}</div>
              ))}
            </div>
          )}
          {(view === "gross" || view === "all") && row(tt("cf_cal_hover_gross"), gross, undefined, true)}
        </>
      )}
      {(view === "liabilities" || view === "net" || view === "all") && month.liabilityTotal > 0 && (
        <div className="space-y-1">
          {view !== "liabilities" ? row(tt("cf_cal_hover_liabilities"), -month.liabilityTotal, undefined, true) : null}
          {liabilities.map((l) => (
            <div key={l.kind}>
              {row(tt(l.label), -month.liabilities[l.kind], l.bar)}
              <ul className="ms-3.5 text-muted-foreground">
                {month.liabilityItems
                  .filter((i) => i.kind === l.kind)
                  .map((i, k) => (
                    <li key={`${i.assetId}-${k}`} className="flex justify-between gap-2">
                      <span className="truncate">{i.name}</span>
                      <span className="tabular-nums">{m(-i.amount)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {view === "liabilities" && row(tt("cf_cal_hover_liabilities"), -month.liabilityTotal, undefined, true)}
        </div>
      )}
      {(view === "net" || view === "all") && row(tt("cf_cal_hover_net"), gross - month.liabilityTotal, undefined, true)}
    </div>
  );
}

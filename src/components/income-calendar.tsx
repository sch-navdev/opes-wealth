"use client";

import { moneyFormatter } from "@/lib/money-parts";
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

  const max = Math.max(0, ...calendar.months.map(combined));
  const empty = calendar.annualTotal <= 0 && !(showEarned && earnedAnnual > 0);
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
            <h2 className="text-sm font-medium text-foreground">{t("ical_title")}</h2>
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
                const label = t("ical_bar_label", { month: monthLabel.long(m.month), total: money.format(combined(m)) });
                return (
                  <li key={m.month} className="group relative">
                    <MonthBreakdown month={m} showEarned={showEarned} money={money} maskValue={maskValue} earnedLabel={(g) => tt(EARNED.find((e) => e.group === g)?.label ?? "cf_cal_other")} passiveLabel={tt("cf_cal_hover_passive")} />
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
                        {showEarned &&
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
                        {maskValue(money.format(combined(m)))}
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
              {showEarned &&
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
                  {showEarned && (open.earnedItems?.length ?? 0) > 0 && (
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
                  {open.items.length === 0 && !(showEarned && (open.earnedItems?.length ?? 0) > 0) ? (
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
 * Hover / keyboard-focus breakdown of one month: each earned group (salary, bonus, gratuity...) as ONE line
 * with the employers that make it up listed under it, then the passive total. Purely visual (aria-hidden):
 * the month's button carries its total, and clicking the month opens the full list below the chart.
 */
function MonthBreakdown({
  month,
  showEarned,
  money,
  maskValue,
  earnedLabel,
  passiveLabel,
}: {
  month: IncomeCalendarData["months"][number];
  showEarned: boolean;
  money: { format: (n: number) => string };
  maskValue: (v: string) => string;
  earnedLabel: (group: EarnedGroup) => string;
  passiveLabel: string;
}) {
  const earnedGroups = showEarned
    ? EARNED.flatMap((e) => {
        const items = (month.earnedItems ?? []).filter((i) => i.group === e.group);
        const total = month.earned?.[e.group] ?? 0;
        if (!(total > 0)) return [];
        // One line per employer (several payments from the same employer in a month are added up).
        const byEmployer = new Map<string, number>();
        for (const i of items) byEmployer.set(i.source || i.name, (byEmployer.get(i.source || i.name) ?? 0) + i.amount);
        return [{ group: e.group, bar: e.bar, total, employers: [...byEmployer.entries()] }];
      })
    : [];
  if (earnedGroups.length === 0 && !(month.total > 0)) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible absolute bottom-full start-1/2 z-20 mb-1 w-56 -translate-x-1/2 border border-border bg-popover p-2 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 rtl:translate-x-1/2"
    >
      {earnedGroups.map((g) => (
        <div key={g.group} className="mb-1.5">
          <p className="flex items-center justify-between gap-2 font-medium">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-sm", g.bar)} />
              {earnedLabel(g.group)}
            </span>
            <span className="tabular-nums">{maskValue(money.format(g.total))}</span>
          </p>
          {g.employers.length > 1 || (g.employers.length === 1 && g.employers[0][0]) ? (
            <ul className="ms-3.5 text-muted-foreground">
              {g.employers.map(([name, amount]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="tabular-nums">{maskValue(money.format(amount))}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {month.total > 0 && (
        <p className="flex items-center justify-between gap-2 font-medium">
          <span>{passiveLabel}</span>
          <span className="tabular-nums">{maskValue(money.format(month.total))}</span>
        </p>
      )}
    </div>
  );
}

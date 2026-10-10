"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCashFlowText } from "@/components/cash-flow-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { IncomeCalendarDays } from "@/components/income-calendar-days";
import { IncomeCalendarSimulator, type SimAsset } from "@/components/income-calendar-simulator";
import { buildDays } from "@/lib/income-calendar-daily";
import { SIM_STORAGE_KEY, expandSimulations, parseSimEntries, type SimEntry } from "@/lib/income-calendar-simulation";
import { analyseIncomeCalendar } from "@/lib/income-calendar-analysis";
import type { IncomeCalendar } from "@/lib/income-calendar";
import { LIABILITY_KINDS, type LiabilityKind } from "@/lib/income-calendar-liabilities";
import type { PassiveIncomeSource } from "@/lib/passive-income";
import { moneyFormatter } from "@/lib/money-parts";
import type { CashFlowKey } from "@/lib/cash-flow-labels";
import { cn } from "@/lib/utils";

const PRESETS = [12, 24, 36, 60, 120] as const;

const SOURCE_LABEL: Record<PassiveIncomeSource | "earned" | "simulated", string> = {
  simulated: "What-if income",
  earned: "Earned income (salary, bonus...)",
  rental: "Rental income",
  stocks: "Stocks & ETFs",
  reit: "SCPI / REIT",
  private_equity: "Private equity",
};
const SOURCE_COLOR: Record<PassiveIncomeSource | "earned" | "simulated", string> = {
  simulated: "var(--color-primary)",
  earned: "var(--color-chart-5)",
  rental: "var(--color-chart-1)",
  stocks: "var(--color-chart-2)",
  reit: "var(--color-chart-3)",
  private_equity: "var(--color-chart-4)",
};
const KIND_LABEL: Record<LiabilityKind, CashFlowKey> = {
  mortgage: "cf_cal_liab_mortgage",
  loan: "cf_cal_liab_loan",
  off_plan: "cf_cal_liab_off_plan",
  private_equity: "cf_cal_liab_private_equity",
  credit_card: "cf_cal_liab_credit_card",
  other: "cf_cal_liab_other",
};
const KIND_COLOR: Record<LiabilityKind, string> = {
  mortgage: "var(--color-chart-1)",
  loan: "var(--color-chart-2)",
  off_plan: "var(--color-chart-3)",
  private_equity: "var(--color-chart-4)",
  credit_card: "var(--color-chart-5)",
  other: "var(--color-muted-foreground)",
};

/**
 * Full-page income calendar: any start month and length (1 to 10 years), gross income / liabilities / net month by
 * month in one chart, the running net, composition of the income and of the payments, a year-by-year table, a
 * few plain findings and the full monthly table. The calendar is built by the page for the chosen window
 * (`?from=YYYY-MM&months=N`); earned income is switched on or off here.
 */
export function IncomeCalendarExplorer({
  calendar,
  baseCurrency,
  from,
  months,
  hasEarned,
  backHref,
  openingCash = 0,
  assets = [],
  selectedMonth,
}: {
  calendar: IncomeCalendar;
  baseCurrency: string;
  from: string;
  months: number;
  hasEarned: boolean;
  backHref: string;
  /** Cash on hand today (Base Currency): the starting point of the position line. */
  openingCash?: number;
  /** Assets a what-if entry can be linked to. */
  assets?: SimAsset[];
  /** Month ("YYYY-MM") to open in the day-by-day view. */
  selectedMonth?: string;
}) {
  const router = useRouter();
  const tt = useCashFlowText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [includeEarned, setIncludeEarned] = useState(true);
  const [includeCash, setIncludeCash] = useState(openingCash > 0);
  const [sims, setSims] = useState<SimEntry[]>([]);
  const [showSims, setShowSims] = useState(true);
  const [pickedMonth, setPickedMonth] = useState<string>(
    selectedMonth && calendar.months.some((x) => x.month === selectedMonth) ? selectedMonth : calendar.months[0].month,
  );
  // What-ifs live on this device only.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSims(parseSimEntries(JSON.parse(window.localStorage.getItem(SIM_STORAGE_KEY) ?? "[]")));
    } catch {
      /* none saved */
    }
  }, []);
  const changeSims = (next: SimEntry[]) => {
    setSims(next);
    try {
      window.localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  const [customFrom, setCustomFrom] = useState(from);
  const [customMonths, setCustomMonths] = useState(String(months));

  const money = useMemo(() => moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }), [intlLocale, baseCurrency]);
  const compact = useMemo(() => new Intl.NumberFormat(intlLocale, { notation: "compact", maximumFractionDigits: 1 }), [intlLocale]);
  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" });
    return (key: string) => fmt.format(new Date(`${key}-01T00:00:00Z`));
  }, [intlLocale]);
  const longMonth = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
    return (key: string) => fmt.format(new Date(`${key}-01T00:00:00Z`));
  }, [intlLocale]);
  const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
  const m = (n: number) => maskValue(money.format(n));

  const simByMonth = useMemo(() => expandSimulations(showSims ? sims : [], calendar.months.map((x) => x.month)), [sims, showSims, calendar]);
  const startCash = includeCash ? openingCash : 0;
  const a = useMemo(
    () => analyseIncomeCalendar(calendar, includeEarned && hasEarned, { sims: simByMonth, openingCash: startCash }),
    [calendar, includeEarned, hasEarned, simByMonth, startCash],
  );
  const pickedIndex = Math.max(0, calendar.months.findIndex((x) => x.month === pickedMonth));
  const days = useMemo(
    () =>
      buildDays(calendar.months[pickedIndex], {
        includeEarned: includeEarned && hasEarned,
        sims: simByMonth[pickedIndex],
        startPosition: pickedIndex === 0 ? startCash : a.rows[pickedIndex - 1].position,
      }),
    [calendar, pickedIndex, includeEarned, hasEarned, simByMonth, startCash, a],
  );

  const chartData = a.rows.map((r) => ({
    label: monthLabel(r.month),
    month: r.month,
    earned: r.earned,
    rental: r.bySource.rental,
    stocks: r.bySource.stocks,
    reit: r.bySource.reit,
    private_equity: r.bySource.private_equity,
    simulated: r.simIncome,
    l_sim: -r.simPayments,
    position: r.position,
    // Liabilities hang below the axis.
    ...Object.fromEntries(LIABILITY_KINDS.map((k) => [`l_${k}`, -r.byKind[k]])),
    net: r.net,
    cumulative: r.cumulative,
  }));

  function go(nextFrom: string, nextMonths: number) {
    const params = new URLSearchParams({ from: nextFrom, months: String(nextMonths) });
    router.push(`?${params.toString()}`);
  }
  const customValid = /^\d{4}-\d{2}$/.test(customFrom) && Number(customMonths) >= 1 && Number(customMonths) <= 120;

  const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 12 };
  const tick = { fill: "var(--color-muted-foreground)", fontSize: 11 };
  const usedKinds = LIABILITY_KINDS.filter((k) => a.byKind[k] > 0);
  const usedSources = (Object.keys(SOURCE_LABEL) as (PassiveIncomeSource | "earned" | "simulated")[]).filter((s) => a.bySource[s] > 0);
  const empty = a.totals.gross <= 0 && a.totals.liabilities <= 0;

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Dashboard
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <CalendarDays className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Income calendar</h1>
          <p className="text-sm text-muted-foreground">
            {longMonth(calendar.months[0].month)} to {longMonth(calendar.months[calendar.months.length - 1].month)} ({months} months), in {baseCurrency}.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button key={p} type="button" size="sm" variant={months === p ? "default" : "outline"} aria-pressed={months === p} onClick={() => go(from, p)}>
                {p < 24 ? "12 months" : `${p / 12} years`}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Start month
              <Input type="month" className="h-8 w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Months (1 to 120)
              <Input type="number" min={1} max={120} className="h-8 w-28" value={customMonths} onChange={(e) => setCustomMonths(e.target.value)} />
            </label>
            <Button type="button" size="sm" disabled={!customValid} onClick={() => go(customFrom, Math.round(Number(customMonths)))}>
              Apply
            </Button>
          </div>
          {openingCash > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch size="sm" checked={includeCash} onCheckedChange={setIncludeCash} aria-label="Start from the cash I hold today" />
              Start from the cash I hold today ({m(openingCash)})
            </label>
          )}
          {hasEarned && (
            <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Switch size="sm" checked={includeEarned} onCheckedChange={setIncludeEarned} aria-label={tt("cf_cal_toggle")} />
              {tt("cf_cal_toggle")}
            </label>
          )}
        </CardContent>
      </Card>

      <IncomeCalendarSimulator
        entries={sims}
        onChange={changeSims}
        assets={assets}
        defaultStart={from}
        baseCurrency={baseCurrency}
        show={showSims}
        onShow={setShowSims}
      />

      {empty ? (
        <p className="text-sm text-muted-foreground">Nothing is projected in this period. Add tenancy contracts, income streams or liabilities with a payment, or choose another period.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label={tt("cf_cal_view_gross")} value={m(a.totals.gross)} tone="text-success" sub={`${m(a.monthlyAverage.gross)} / month`} />
            <Tile label={tt("cf_cal_view_liabilities")} value={m(-a.totals.liabilities)} tone="text-destructive" sub={`${m(a.monthlyAverage.liabilities)} / month`} />
            <Tile label={tt("cf_cal_view_net")} value={m(a.totals.net)} tone={a.totals.net < 0 ? "text-destructive" : "text-foreground"} sub={`${m(a.monthlyAverage.net)} / month`} />
            <Tile label="Net margin" value={pct(a.netMarginPct)} tone="text-foreground" sub="net as a share of gross" />
            <Tile label="Position at the end" value={m(a.endPosition)} tone={a.endPosition < 0 ? "text-destructive" : "text-foreground"} sub={a.lowestPosition ? `lowest ${m(a.lowestPosition.value)} in ${longMonth(a.lowestPosition.month)}` : ""} />
            <Tile label="Income covers liabilities" value={a.coverage == null ? "—" : `${a.coverage.toFixed(2)}×`} tone="text-foreground" sub={a.coverage == null ? "no payment due" : a.coverage >= 1 ? "gross exceeds payments" : "payments exceed gross"} />
          </dl>

          <Card className="border-border bg-card">
            <CardContent className="space-y-2 py-4">
              <h2 className="text-sm font-medium text-foreground">Month by month: gross income above, liabilities below, net as the line, your position on the right axis</h2>
              <p className="text-xs text-muted-foreground">Click a month on the chart to see it day by day.</p>
              <div className="h-80 w-full" role="img" aria-label="Monthly gross income, liabilities and net income">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    stackOffset="sign"
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    onClick={(state: unknown) => {
                      const i = Number((state as { activeTooltipIndex?: number | string } | null)?.activeTooltipIndex);
                      if (Number.isInteger(i) && calendar.months[i]) setPickedMonth(calendar.months[i].month);
                    }}
                  >
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={tick} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis yAxisId="flow" tick={tick} tickFormatter={(v: number) => compact.format(v)} width={56} />
                    <YAxis yAxisId="pos" orientation="right" tick={tick} tickFormatter={(v: number) => compact.format(v)} width={56} />
                    <ReferenceLine yAxisId="flow" y={0} stroke="var(--color-muted-foreground)" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => m(Number(v))} labelFormatter={(_l, p) => longMonth(String(p?.[0]?.payload?.month ?? ""))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {includeEarned && hasEarned && <Bar yAxisId="flow" dataKey="earned" name={SOURCE_LABEL.earned} stackId="s" fill={SOURCE_COLOR.earned} />}
                    {a.simulated.income > 0 && <Bar yAxisId="flow" dataKey="simulated" name={SOURCE_LABEL.simulated} stackId="s" fill={SOURCE_COLOR.simulated} fillOpacity={0.6} />}
                    {a.simulated.payments > 0 && <Bar yAxisId="flow" dataKey="l_sim" name="What-if payments" stackId="s" fill="var(--color-destructive)" fillOpacity={0.35} />}
                    {(["rental", "stocks", "reit", "private_equity"] as const).map((s) => (
                      <Bar key={s} yAxisId="flow" dataKey={s} name={SOURCE_LABEL[s]} stackId="s" fill={SOURCE_COLOR[s]} />
                    ))}
                    {usedKinds.map((k) => (
                      <Bar key={k} yAxisId="flow" dataKey={`l_${k}`} name={tt(KIND_LABEL[k])} stackId="s" fill={KIND_COLOR[k]} fillOpacity={0.55} />
                    ))}
                    <Line yAxisId="flow" dataKey="net" name={tt("cf_cal_view_net")} stroke="var(--color-foreground)" strokeWidth={2} dot={false} />
                    <Line yAxisId="pos" dataKey="position" name="Position (right axis)" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card" data-testid="income-day-card">
            <CardContent className="space-y-3 py-4">
              <h2 className="text-sm font-medium text-foreground">Day by day: {longMonth(pickedMonth)}</h2>
              <div role="group" aria-label="Month" className="flex flex-wrap gap-1">
                {calendar.months.map((x) => (
                  <Button key={x.month} type="button" size="xs" variant={x.month === pickedMonth ? "default" : "outline"} aria-pressed={x.month === pickedMonth} onClick={() => setPickedMonth(x.month)}>
                    {monthLabel(x.month)}
                  </Button>
                ))}
              </div>
              <IncomeCalendarDays days={days} monthLabel={longMonth(pickedMonth)} money={money} mask={maskValue} startPosition={pickedIndex === 0 ? startCash : a.rows[pickedIndex - 1].position} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardContent className="space-y-2 py-4">
                <h2 className="text-sm font-medium text-foreground">Your position (cumulative cash flow)</h2>
                <p className="text-xs text-muted-foreground">
                  {a.firstShortfall ? `The running net goes below zero in ${longMonth(a.firstShortfall)}: payments outrun income from then on unless something changes.` : "The running net stays at or above zero over this period."}
                </p>
                <div className="h-64 w-full" role="img" aria-label="Running net income">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={tick} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis tick={tick} tickFormatter={(v: number) => compact.format(v)} width={56} />
                      <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => m(Number(v))} labelFormatter={(_l, p) => longMonth(String(p?.[0]?.payload?.month ?? ""))} />
                      <Area dataKey="position" name="Position" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="space-y-4 py-4">
                <h2 className="text-sm font-medium text-foreground">What it is made of</h2>
                <Share title={tt("cf_cal_view_gross")} total={a.totals.gross} items={usedSources.map((s) => ({ key: s, label: SOURCE_LABEL[s], value: a.bySource[s], color: SOURCE_COLOR[s] }))} m={m} />
                <Share title={tt("cf_cal_view_liabilities")} total={a.totals.liabilities} items={usedKinds.map((k) => ({ key: k, label: tt(KIND_LABEL[k]), value: a.byKind[k], color: KIND_COLOR[k] }))} m={m} />
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardContent className="space-y-3 py-4">
              <h2 className="text-sm font-medium text-foreground">Analysis</h2>
              <ul className="list-disc space-y-1.5 ps-5 text-sm text-foreground">
                <li>
                  Over {months} months you receive {m(a.totals.gross)} and pay out {m(a.totals.liabilities)}: {a.totals.net >= 0 ? "a surplus" : "a shortfall"} of {m(Math.abs(a.totals.net))}.
                </li>
                {a.negativeMonths > 0 ? (
                  <li>
                    {a.negativeMonths} of {a.rows.length} months end below zero; the weakest is {a.worstMonth ? `${longMonth(a.worstMonth.month)} (${m(a.worstMonth.net)})` : "—"}.
                  </li>
                ) : (
                  <li>No month ends below zero.</li>
                )}
                {a.bestMonth && <li>The strongest month is {longMonth(a.bestMonth.month)} ({m(a.bestMonth.net)}).</li>}
                {a.topLiability && (
                  <li>
                    The largest outgoing is {tt(KIND_LABEL[a.topLiability.kind]).toLowerCase()}: {pct(a.topLiability.sharePct)} of all payments ({m(a.topLiability.amount)}).
                  </li>
                )}
                {a.topSource && a.totals.gross > 0 && (
                  <li>
                    {SOURCE_LABEL[a.topSource.source]} is the main source of income: {pct(a.topSource.sharePct)} of gross.
                    {a.topSource.sharePct >= 70 ? " Your income depends heavily on this one source." : ""}
                  </li>
                )}
                {a.earnedSharePct != null && hasEarned && includeEarned && <li>Earned income is {pct(a.earnedSharePct)} of gross; passive income is {pct(100 - a.earnedSharePct)}.</li>}
                {a.lowestPosition && (
                  <li>
                    Your position is lowest in {longMonth(a.lowestPosition.month)} ({m(a.lowestPosition.value)}){a.lowestPosition.value < 0 ? ": you would need to cover that gap." : "."}
                  </li>
                )}
                {(a.simulated.income > 0 || a.simulated.payments > 0) && (
                  <li>
                    The what-if entries add {m(a.simulated.income)} of income and {m(a.simulated.payments)} of payments; they are included in every figure on this page.
                  </li>
                )}
                {a.firstShortfall && <li>The running net first drops below zero in {longMonth(a.firstShortfall)}.</li>}
              </ul>
              <p className="text-xs text-muted-foreground">
                Gross income is before tax and living expenses. Liabilities are the payments due: mortgage and loan instalments, off-plan milestones, private-equity capital calls and credit cards. Illustrative, not a forecast or advice.
              </p>
            </CardContent>
          </Card>

          {a.years.length > 1 && (
            <Card className="border-border bg-card">
              <CardContent className="space-y-2 py-4">
                <h2 className="text-sm font-medium text-foreground">Year by year</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-start text-xs text-muted-foreground">
                        <th className="py-1 pe-3 text-start font-normal">Year</th>
                        <th className="py-1 pe-3 text-end font-normal">{tt("cf_cal_view_gross")}</th>
                        <th className="py-1 pe-3 text-end font-normal">{tt("cf_cal_view_liabilities")}</th>
                        <th className="py-1 text-end font-normal">{tt("cf_cal_view_net")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {a.years.map((y) => (
                        <tr key={y.year}>
                          <th scope="row" className="py-1.5 pe-3 text-start font-medium">
                            {y.year}
                            {y.months < 12 ? <span className="ms-1 text-xs font-normal text-muted-foreground">({y.months} months)</span> : null}
                          </th>
                          <td className="py-1.5 pe-3 text-end text-success">{m(y.gross)}</td>
                          <td className="py-1.5 pe-3 text-end text-destructive">{m(-y.liabilities)}</td>
                          <td className={cn("py-1.5 text-end font-medium", y.net < 0 && "text-destructive")}>{m(y.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border bg-card">
            <CardContent className="space-y-2 py-4">
              <h2 className="text-sm font-medium text-foreground">Every month</h2>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pe-3 text-start font-normal">Month</th>
                      <th className="py-1 pe-3 text-end font-normal">{tt("cf_cal_view_gross")}</th>
                      <th className="py-1 pe-3 text-end font-normal">{tt("cf_cal_view_liabilities")}</th>
                      <th className="py-1 pe-3 text-end font-normal">{tt("cf_cal_view_net")}</th>
                      <th className="py-1 text-end font-normal">Running net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {a.rows.map((r) => (
                      <tr key={r.month} className="cursor-pointer hover:bg-muted/40" onClick={() => setPickedMonth(r.month)}>
                        <th scope="row" className="py-1.5 pe-3 text-start font-normal">{longMonth(r.month)}</th>
                        <td className="py-1.5 pe-3 text-end text-success">{m(r.gross)}</td>
                        <td className="py-1.5 pe-3 text-end text-destructive">{m(-r.liabilities)}</td>
                        <td className={cn("py-1.5 pe-3 text-end", r.net < 0 && "text-destructive")}>{m(r.net)}</td>
                        <td className={cn("py-1.5 text-end text-muted-foreground", r.cumulative < 0 && "text-destructive")}>{m(r.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone, sub }: { label: string; value: string; tone: string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-base font-semibold tabular-nums", tone)}>{value}</dd>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Share({ title, total, items, m }: { title: string; total: number; items: { key: string; label: string; value: number; color: string }[]; m: (n: number) => string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {items
        .slice()
        .sort((x, y) => y.value - x.value)
        .map((i) => (
          <div key={i.key} className="space-y-0.5">
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground">{i.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {m(i.value)} · {total > 0 ? ((i.value / total) * 100).toFixed(1) : "0.0"}%
              </span>
            </p>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? (i.value / total) * 100 : 0}%`, background: i.color }} />
            </div>
          </div>
        ))}
    </div>
  );
}

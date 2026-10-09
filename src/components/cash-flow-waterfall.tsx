"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useWaterfallText } from "@/components/cash-flow-waterfall-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import {
  buildCashFlowWaterfall,
  classifyExpense,
  EXCLUSION_TOGGLES,
  normalizeSettings,
  REASON_TOGGLE,
  type CashFlowSettings,
  type CashFlowWaterfall as Waterfall,
  type ExpenseClass,
  type ExclusionToggle,
  type SeriesPoint,
  type WaterfallCashAccount,
  type WaterfallLiability,
  type WaterfallStep,
  type WaterfallTransaction,
} from "@/lib/cash-flow-waterfall";
import type { WaterfallKey } from "@/lib/cash-flow-waterfall-labels";
import { clearSettings, parseSettings, readSettingsRaw, subscribeSettings, writeSettings } from "@/lib/cash-flow-settings-local";
import type { IncomeStream } from "@/lib/income-streams";
import { cn } from "@/lib/utils";

const DASH = "–";
const num = "text-end tabular-nums whitespace-nowrap font-mono";
const fieldClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Amount formatter: base currency, no decimals, masked in Privacy Mode, en dash for unknown. */
function useAmountFormat(currency: string) {
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const nf = useMemo(() => {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 0 });
    } catch {
      return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
    }
  }, [intlLocale, currency]);
  return (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? DASH : maskValue(nf.format(n)));
}

/** The waterfall steps as a horizontal bar ladder: totals are gold bars from zero, deductions float from the running total. */
function Ladder({ wf, fmt }: { wf: Waterfall; fmt: (n: number | null) => string }) {
  const tt = useWaterfallText();
  const { isPrivate } = usePrivacy();
  const scale = Math.max(wf.income, 1);
  const run = [wf.income, wf.income - wf.liabilities];
  const exp = wf.expenses.monthlyTotal ?? 0;
  const spans: Record<string, [number, number]> = {
    income: [0, wf.income],
    liabilities: [run[1], run[0]],
    expenses: [run[1] - exp, run[1]],
    net: [0, Math.max(0, wf.net ?? 0)],
    diversion: [(wf.net ?? 0) - (wf.emergency.diversion ?? 0), wf.net ?? 0],
    free: [0, wf.emergency.freeToInvest ?? 0],
  };
  const reason = (s: WaterfallStep): string | null => {
    if (s.value !== null) return null;
    if (s.id === "income") return tt("cfw_why_no_income");
    if (s.id === "expenses") return tt("cfw_why_no_expenses", { n: wf.expenses.windowMonths.length });
    return tt("cfw_why_no_net");
  };
  return (
    <ol className="space-y-1" aria-label={tt("cfw_ladder_title", { currency: wf.base })}>
      {wf.steps.map((s) => {
        const [a, b] = spans[s.id];
        const left = Math.min(100, Math.max(0, (Math.min(a, b) / scale) * 100));
        const width = Math.min(100 - left, Math.max(0, (Math.abs(b - a) / scale) * 100));
        const why = reason(s);
        const total = s.kind === "total";
        const negative = s.id === "net" && (wf.net ?? 0) < 0;
        return (
          <li key={s.id} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 text-xs">
            <span className={cn("truncate", total ? "font-medium text-foreground" : "text-muted-foreground")}>
              {s.kind === "minus" ? "− " : s.id === "net" || s.id === "free" ? "= " : ""}
              {tt(`cfw_step_${s.id}` as WaterfallKey)}
            </span>
            <span className="relative h-3 rounded-sm bg-muted/40" aria-hidden="true">
              {s.value !== null && !isPrivate && (
                <span
                  className={cn("absolute inset-y-0 rounded-sm", total ? (negative ? "bg-destructive/70" : "bg-primary") : "bg-muted-foreground/50")}
                  style={{ left: `${left}%`, width: `${Math.max(width, s.value === 0 ? 0 : 0.5)}%` }}
                />
              )}
            </span>
            <span className={cn(num, total ? "font-medium text-foreground" : "text-muted-foreground", negative && "text-destructive")} title={why ?? undefined}>
              {s.value === null ? DASH : fmt(s.kind === "minus" ? -s.value : s.value)}
              {why && <span className="sr-only"> ({why})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Thin gold velocity line of the monthly net investable cash with a scrub readout (pointer or arrow keys). */
function Velocity({ series, base, fmt }: { series: SeriesPoint[]; base: string; fmt: (n: number | null) => string }) {
  const tt = useWaterfallText();
  const { intlLocale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 72;
  const pad = 4;
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" }), [intlLocale]);
  const label = (m: string) => monthFmt.format(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)));
  const known = series.filter((p) => p.net !== null);
  if (known.length < 2) {
    return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{tt("cfw_velocity_empty")}</p>;
  }
  const vals = known.map((p) => p.net as number);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = max - min || 1;
  const x = (i: number) => pad + ((W - pad * 2) * i) / (series.length - 1);
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / range);
  // Segments: a month without transactions breaks the line.
  const segments: string[] = [];
  let cur = "";
  series.forEach((p, i) => {
    if (p.net === null) {
      if (cur) segments.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.net).toFixed(1)} `;
  });
  if (cur) segments.push(cur);
  const move = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    setActive(Math.min(series.length - 1, Math.max(0, Math.round(ratio * (series.length - 1)))));
  };
  const a = active === null ? null : series[active];
  const first = label(series[0].month);
  const last = label(series[series.length - 1].month);
  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[72px] w-full touch-none overflow-visible text-primary"
        role="img"
        aria-label={tt("cfw_velocity_alt", { first, last })}
        tabIndex={0}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((c) => Math.max(0, (c ?? series.length) - 1));
          else if (e.key === "ArrowRight") setActive((c) => Math.min(series.length - 1, (c ?? -1) + 1));
          else if (e.key === "Escape") setActive(null);
        }}
      >
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        {!isPrivate &&
          segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={pad} y2={H - pad} stroke="currentColor" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        )}
        {!isPrivate && a && a.net !== null && <circle cx={x(active as number)} cy={y(a.net)} r={2.5} fill="currentColor" />}
      </svg>
      <div className="flex min-h-8 flex-wrap items-baseline justify-between gap-x-4 text-[11px] text-muted-foreground">
        {a ? (
          <>
            <span className="font-medium text-foreground">{label(a.month)}</span>
            <span>{tt("cfw_ro_income")} <span className="font-mono text-foreground">{fmt(a.income)}</span></span>
            <span>{tt("cfw_ro_liabilities")} <span className="font-mono text-foreground">{fmt(a.liabilities)}</span></span>
            <span>{tt("cfw_ro_expenses")} <span className="font-mono text-foreground">{fmt(a.expenses)}</span></span>
            <span>{tt("cfw_ro_net")} <span className="font-mono text-foreground">{fmt(a.net)}</span></span>
          </>
        ) : (
          <>
            <span>{first}</span>
            <span className="font-index tracking-[0.12em]">{base}</span>
            <span>{last}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Coverage ruler: 0 to 6 months of (essential + liabilities), ticks at 3 and 6, gold fill, target marker. */
function CoverageBar({ coverage, targetMonths, label }: { coverage: number | null; targetMonths: number; label: string }) {
  const tt = useWaterfallText();
  const { isPrivate } = usePrivacy();
  const pos = (m: number) => `${(m / 6) * 100}%`;
  const fill = coverage === null || isPrivate ? 0 : Math.min(6, Math.max(0, coverage));
  return (
    <div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={coverage === null || isPrivate ? undefined : Math.round(fill * 10) / 10}
        className="relative h-3 rounded-sm bg-muted/40"
      >
        <span className="absolute inset-y-0 start-0 rounded-sm bg-primary" style={{ width: pos(fill) }} />
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-foreground" style={{ insetInlineStart: pos(targetMonths) }} aria-hidden="true" />
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((m) => (
          <span key={m} className="absolute top-0 flex -translate-x-1/2 flex-col items-center rtl:translate-x-1/2" style={{ insetInlineStart: pos(m) }}>
            <span className={cn("block w-px bg-border", m === 3 || m === 6 ? "h-2" : "h-1")} />
            {(m === 3 || m === 6) && <span className="font-mono">{tt("cfw_months_unit", { n: m })}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CashFlowWaterfall({
  streams,
  liabilities,
  accounts,
  transactions,
  baseCurrency,
  rates,
  asOf,
}: {
  streams: IncomeStream[];
  liabilities: WaterfallLiability[];
  accounts: WaterfallCashAccount[];
  transactions: WaterfallTransaction[];
  baseCurrency: string;
  rates: Record<string, number>;
  /** YYYY-MM-DD, "today" on the server. */
  asOf: string;
}) {
  const tt = useWaterfallText();
  const fmt = useAmountFormat(baseCurrency);
  const raw = useSyncExternalStore(subscribeSettings, readSettingsRaw, () => null);
  const settings = useMemo(() => parseSettings(raw), [raw]);
  const ids = useId();
  const [saveFailed, setSaveFailed] = useState(false);

  const update = (patch: Partial<CashFlowSettings>) => setSaveFailed(!writeSettings(normalizeSettings({ ...settings, ...patch })));
  const toggleExclusion = (k: ExclusionToggle, on: boolean) => update({ exclusions: { ...settings.exclusions, [k]: on } });
  const setOverride = (key: string, value: ExpenseClass | "auto") => {
    const next = { ...settings.overrides };
    if (value === "auto") delete next[key];
    else next[key] = value;
    update({ overrides: next });
  };
  const toggleAccount = (id: string, on: boolean) => {
    const set = new Set(settings.emergencyAccountIds);
    if (on) set.add(id);
    else set.delete(id);
    update({ emergencyAccountIds: [...set] });
  };

  const wf = useMemo(
    () => buildCashFlowWaterfall({ streams, liabilities, transactions, accounts, settings, base: baseCurrency, rates, asOf }),
    [streams, liabilities, transactions, accounts, settings, baseCurrency, rates, asOf],
  );
  const ef = wf.emergency;
  const noData = !wf.hasIncome && !wf.expenses.hasTransactions && wf.expenses.source === "none";

  const exclusionRows = EXCLUSION_TOGGLES.map((k) => {
    const rows = wf.expenses.exclusions.filter((e) => REASON_TOGGLE[e.reason] === k);
    return { k, count: rows.reduce((s, r) => s + r.count, 0), monthlyAvg: rows.reduce((s, r) => s + r.monthlyAvg, 0) };
  });
  const essentialShare =
    wf.expenses.monthlyTotal && wf.expenses.monthlyTotal > 0 ? (wf.expenses.monthlyEssential ?? 0) / wf.expenses.monthlyTotal : null;

  return (
    <section className="space-y-4 rounded-md border border-border p-4" aria-labelledby={`${ids}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={`${ids}-title`} className="text-base font-medium text-foreground">{tt("cfw_title")}</h2>
          <p className="text-xs text-muted-foreground">{tt("cfw_subtitle")} {tt("cfw_informational")}</p>
        </div>
        <button type="button" onClick={() => { clearSettings(); setSaveFailed(false); }} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {tt("cfw_reset")}
        </button>
      </div>

      {noData && <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">{tt("cfw_empty")}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="font-index text-[11px] uppercase tracking-[0.14em] text-primary">{tt("cfw_ladder_title", { currency: baseCurrency })}</h3>
            <Ladder wf={wf} fmt={fmt} />
            {wf.oneOffNext12 > 0 && <p className="text-[11px] text-muted-foreground">{tt("cfw_oneoff_note", { amount: fmt(wf.oneOffNext12) })}</p>}
          </div>
          <div className="space-y-2">
            <h3 className="font-index text-[11px] uppercase tracking-[0.14em] text-primary">{tt("cfw_velocity_title")}</h3>
            <Velocity series={wf.series} base={baseCurrency} fmt={fmt} />
          </div>
        </div>

        <fieldset className="space-y-3 text-xs">
          <legend className="font-index text-[11px] uppercase tracking-[0.14em] text-primary">{tt("cfw_settings_title")}</legend>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{tt("cfw_set_lookback")}</span>
            <select className={fieldClass} value={settings.lookback} onChange={(e) => update({ lookback: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{tt("cfw_set_months")}</span>
            <select className={fieldClass} value={settings.emergencyMonths} onChange={(e) => update({ emergencyMonths: Number(e.target.value) })}>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">{tt("cfw_set_pct", { pct: settings.divertPct })}</span>
            <input type="range" min={10} max={20} step={1} value={settings.divertPct} onChange={(e) => update({ divertPct: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
          </label>
          {!wf.expenses.hasTransactions && (
            <div className="space-y-2 rounded-md border border-border/60 p-2">
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{tt("cfw_set_manual", { currency: baseCurrency })}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={cn(fieldClass, "w-28 text-end font-mono")}
                  value={settings.manualMonthlyExpenses ?? ""}
                  onChange={(e) => update({ manualMonthlyExpenses: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </label>
              <p className="text-[11px] text-muted-foreground">{tt("cfw_set_manual_hint")}</p>
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{tt("cfw_set_essential_pct")}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={cn(fieldClass, "w-20 text-end font-mono")}
                  value={settings.fallbackEssentialPct}
                  onChange={(e) => update({ fallbackEssentialPct: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{saveFailed ? DASH : tt("cfw_stored_note")}</p>
        </fieldset>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-index text-[11px] uppercase tracking-[0.14em] text-primary">{tt("cfw_expenses_title")}</h3>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted-foreground">{tt("cfw_exp_total")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(wf.expenses.monthlyTotal)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_exp_essential")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(wf.expenses.monthlyEssential)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_exp_discretionary")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(wf.expenses.monthlyDiscretionary)}</dd></div>
          </dl>
          {essentialShare !== null && (
            <div className="flex h-2 overflow-hidden rounded-sm bg-muted/40" aria-hidden="true">
              <span className="bg-primary" style={{ width: `${Math.round(essentialShare * 100)}%` }} />
              <span className="bg-muted-foreground/40" style={{ width: `${100 - Math.round(essentialShare * 100)}%` }} />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {wf.expenses.source === "transactions"
              ? tt("cfw_exp_basis", { used: wf.expenses.monthsWithData, total: wf.expenses.windowMonths.length })
              : wf.expenses.source === "manual"
                ? tt("cfw_exp_basis_manual")
                : tt("cfw_why_no_expenses", { n: wf.expenses.windowMonths.length })}
          </p>

          <h4 className="pt-1 text-xs font-medium text-foreground">{tt("cfw_excl_title")}</h4>
          <p className="text-[11px] text-muted-foreground">{tt("cfw_excl_hint")}</p>
          <ul className="space-y-1.5">
            {exclusionRows.map(({ k, count, monthlyAvg }) => (
              <li key={k} className="text-xs">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 size-3.5 accent-[var(--primary)]" checked={settings.exclusions[k]} onChange={(e) => toggleExclusion(k, e.target.checked)} />
                  <span className="space-y-0.5">
                    <span className="block text-foreground">{tt(`cfw_excl_${k}` as WaterfallKey)}</span>
                    <span className="block text-[11px] text-muted-foreground">{tt(`cfw_excl_desc_${k}` as WaterfallKey)}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{tt("cfw_excl_count", { count, amount: fmt(monthlyAvg) })}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {wf.expenses.merchants.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full caption-bottom text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2 [&_th]:text-start [&_th]:font-medium [&_thead_th]:border-b [&_thead_th]:border-primary/40 [&_tbody_tr]:border-b [&_tbody_tr]:border-border/60">
                <caption className="sr-only">{tt("cfw_merchants_title")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{tt("cfw_col_merchant")}</th>
                    <th scope="col" className="text-end">{tt("cfw_col_monthly")}</th>
                    <th scope="col">{tt("cfw_col_class")}</th>
                  </tr>
                </thead>
                <tbody>
                  {wf.expenses.merchants.slice(0, 8).map((m) => (
                    <tr key={m.key}>
                      <td className="max-w-[10rem] truncate">{m.key}</td>
                      <td className={num}>{fmt(m.monthlyAvg)}</td>
                      <td>
                        <select
                          className={cn(fieldClass, "h-7")}
                          aria-label={tt("cfw_merchant_override", { merchant: m.key })}
                          value={settings.overrides[m.key] ?? "auto"}
                          onChange={(e) => setOverride(m.key, e.target.value as ExpenseClass | "auto")}
                        >
                          <option value="auto">{tt("cfw_class_auto")} ({tt(classifyExpense(m.key).class === "essential" ? "cfw_class_essential" : "cfw_class_discretionary")})</option>
                          <option value="essential">{tt("cfw_class_essential")}</option>
                          <option value="discretionary">{tt("cfw_class_discretionary")}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-index text-[11px] uppercase tracking-[0.14em] text-primary">{tt("cfw_ef_title")}</h3>
          <p className="text-[11px] text-muted-foreground">{tt("cfw_ef_guidance")}</p>
          <CoverageBar coverage={ef.coverageMonths} targetMonths={ef.months} label={tt("cfw_ef_bar_label")} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div><dt className="text-muted-foreground">{tt("cfw_ef_target", { months: ef.months })}</dt><dd className={cn(num, "text-start text-foreground")} title={ef.target === null ? tt("cfw_why_no_target") : undefined}>{fmt(ef.target)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_ef_current")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(ef.current)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_ef_gap")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(ef.gap)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_ef_need")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(ef.monthlyNeed)}</dd></div>
            <div><dt className="text-muted-foreground">{tt("cfw_ef_diversion")}</dt><dd className={cn(num, "text-start text-foreground")}>{fmt(ef.diversion)}</dd></div>
            <div>
              <dt className="text-muted-foreground">{tt("cfw_ef_months_to_fund")}</dt>
              <dd className={cn(num, "text-start text-foreground")} title={ef.monthsToFund === null ? tt("cfw_ef_why_no_months") : undefined}>
                {ef.monthsToFund === null ? DASH : tt("cfw_months_unit", { n: ef.monthsToFund })}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-foreground" aria-live="polite">
            {ef.progress === null ? tt("cfw_why_no_target") : ef.funded ? tt("cfw_ef_funded") : tt("cfw_ef_progress", { pct: Math.round(ef.progress * 100) })}
          </p>
          {ef.coverageMonths !== null && <p className="text-[11px] text-muted-foreground">{tt("cfw_ef_coverage", { n: ef.coverageMonths.toFixed(1) })}</p>}

          <h4 className="pt-1 text-xs font-medium text-foreground">{tt("cfw_ef_accounts")}</h4>
          {ef.accounts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{tt("cfw_ef_no_accounts")}</p>
          ) : (
            <ul className="space-y-1">
              {ef.accounts.map((a) => {
                const marked = settings.emergencyAccountIds.includes(a.id) || a.reason !== "not_marked";
                return (
                  <li key={a.id}>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--primary)]"
                        checked={marked}
                        aria-label={tt("cfw_ef_account_mark", { name: a.name })}
                        onChange={(e) => toggleAccount(a.id, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">{a.name}</span>
                      {a.reason === "not_liquid" && <span className="text-[11px] text-muted-foreground">{tt("cfw_ef_not_liquid")}</span>}
                      <span className={cn(num, a.counted ? "text-foreground" : "text-muted-foreground")}>{fmt(a.baseBalance)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {ef.accounts.length > 0 && !ef.accounts.some((a) => a.counted) && <p className="text-[11px] text-muted-foreground">{tt("cfw_ef_none_marked")}</p>}
        </div>
      </div>
    </section>
  );
}

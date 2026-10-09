"use client";

import type { ReactNode } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Money } from "@/components/money";
import { MicroSparkline } from "@/components/micro-sparkline";
import { useUiTier } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { moneyFormatter } from "@/lib/money-parts";
import { cn } from "@/lib/utils";
import { tierRank, type ExpertiseLevel } from "@/stores/useUiTierStore";
import { useAnalysisText } from "./text";

export const DASH = "–";

/** True when the active UI tier is at least `min`. Basic is treated like Standard in the Analysis tab (key cards only). */
export function useAtLeastTier(min: ExpertiseLevel): boolean {
  return tierRank(useUiTier()) >= tierRank(min);
}

/** Renders `children` from the given tier up (UI preference, not access control). */
export function MinTier({ min, children }: { min: ExpertiseLevel; children: ReactNode }) {
  return useAtLeastTier(min) ? <>{children}</> : null;
}

/** Number / percentage / date formatting for the Analysis cards; null and non-finite values render as an en dash. */
export function useAnalysisFormat(currency: string) {
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const money0 = moneyFormatter(intlLocale, currency, { maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" });
  const ok = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
  return {
    ok,
    /** Whole-unit amount, masked in Privacy Mode. */
    money: (n: number | null | undefined) => (ok(n) ? maskValue(money0.format(n)) : DASH),
    /** Amount with two decimals (unit prices). */
    money2: (n: number | null | undefined) => (ok(n) ? maskValue(moneyFormatter(intlLocale, currency, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)) : DASH),
    /** Fraction as a percentage ("12.5 %"). */
    pct: (n: number | null | undefined, digits = 1, signed = false) =>
      ok(n)
        ? new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: 0, signDisplay: signed ? "exceptZero" : "auto" }).format(n)
        : DASH,
    num: (n: number | null | undefined, digits = 2) =>
      ok(n) ? new Intl.NumberFormat(intlLocale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n) : DASH,
    /** Multiple of money, "1.40x". */
    multiple: (n: number | null | undefined) => (ok(n) ? `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)}x` : DASH),
    date: (iso: string | null | undefined) => {
      if (!iso) return DASH;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
    },
    month: (key: string) => {
      const d = new Date(`${key}-01T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? key : monthFmt.format(d);
    },
    ts: (ts: unknown) => (Number.isFinite(Number(ts)) ? dateFmt.format(new Date(Number(ts))) : ""),
    axisMoney: (v: number) => maskValue(money0.format(v)),
  };
}

/** Tone of a signed figure: gains success, losses destructive. */
export function toneOf(n: number | null | undefined): "positive" | "negative" | "neutral" {
  return typeof n === "number" && Number.isFinite(n) ? (n > 0 ? "positive" : n < 0 ? "negative" : "neutral") : "neutral";
}

const TONE_CLASS = { positive: "text-success", negative: "text-destructive", neutral: "text-foreground" } as const;

/** A dense key figure: small gold-index label, tabular value, optional hint and sparkline (pattern: 21st.dev KPI stat cards). */
export function Stat({
  label,
  value,
  money,
  currency,
  hint,
  tone = "neutral",
  spark,
  testId,
}: {
  label: string;
  /** Preformatted text; `DASH` or null shows an en dash. */
  value?: string | null;
  /** An amount shown with the house `Money` figure (currency label, privacy mask). */
  money?: number | null;
  currency?: string;
  hint?: ReactNode;
  tone?: "positive" | "negative" | "neutral";
  spark?: number[];
  testId?: string;
}) {
  const hasMoney = typeof money === "number" && Number.isFinite(money) && currency;
  return (
    <div className="min-w-0 bg-card p-3" data-testid={testId}>
      <p className="font-index text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={cn("min-w-0 truncate text-base font-medium tabular-nums", TONE_CLASS[tone])}>
          {hasMoney ? <Money value={money as number} currency={currency as string} decimals="hide" animate={false} /> : value || DASH}
        </p>
        {spark && spark.length >= 2 && <MicroSparkline values={spark} />}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Flat grid of `Stat`s separated by one-pixel rules (no heavy card chrome). */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</div>;
}

/** A titled block of the Analysis tab. */
export function AnalysisCard({
  title,
  description,
  children,
  testId,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3 border border-border bg-card p-4", className)} aria-label={title} data-testid={testId}>
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

/** Graceful empty state: what data is missing and how to add it. Never a bare 0 or NaN. */
export function EmptyNote({ missing, how }: { missing: string; how?: string }) {
  return (
    <div className="border border-dashed border-border p-3 text-xs text-muted-foreground" data-testid="analysis-empty">
      <p className="text-foreground">{missing}</p>
      {how && <p className="mt-1">{how}</p>}
    </div>
  );
}

/** One-line informational disclaimer shown under analysis blocks that compute returns. */
export function InfoNote() {
  const at = useAnalysisText();
  return <p className="text-xs text-muted-foreground">{at("an_info_only")}</p>;
}

export type ChartSeries = {
  key: string;
  name: string;
  /** CSS colour (a chart token by default). */
  color?: string;
  dash?: string;
  /** Draw as a step line carried forward. */
  step?: boolean;
  /** Dot on every real point. */
  dots?: boolean;
};

const PALETTE = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

/** A compact multi-line time chart on the house chart tokens; amounts are masked in Privacy Mode. */
export function AnalysisChart({
  rows,
  series,
  currency,
  valueFormat = "money",
  heightClassName = "h-56",
  zeroLine = false,
  label,
}: {
  rows: ({ date: string } & Record<string, number | string | null>)[];
  series: ChartSeries[];
  currency: string;
  valueFormat?: "money" | "percent";
  heightClassName?: string;
  zeroLine?: boolean;
  label: string;
}) {
  const f = useAnalysisFormat(currency);
  const data = rows.map((r) => ({ ...r, ts: new Date(r.date).getTime() }));
  const fmt = (v: unknown) => (valueFormat === "percent" ? f.pct(Number(v), 1) : f.money(Number(v)));
  return (
    <div className={cn("w-full", heightClassName)} role="img" aria-label={label} data-testid="analysis-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={f.ts} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={valueFormat === "percent" ? 56 : 80} tickFormatter={(v) => (valueFormat === "percent" ? f.pct(v, 0) : f.axisMoney(v))} />
          <Tooltip
            contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 12 }}
            labelFormatter={f.ts}
            formatter={(v) => fmt(v)}
          />
          {zeroLine && <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type={s.step ? "stepAfter" : "monotone"}
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              strokeDasharray={s.dash}
              dot={s.dots ? { r: 3 } : false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Wrapper that stacks the cards of one asset class. */
export function AnalysisStack({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="space-y-4" data-testid={testId}>
      {children}
    </div>
  );
}

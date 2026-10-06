"use client";

import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { CategoryIcon } from "@/components/category-icon";
import { NumberTicker } from "@/components/number-ticker";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useTierMotion } from "@/components/tier-gate";
import { MicroSparkline } from "@/components/micro-sparkline";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle, type AllocationSlice, type AmountRow } from "@/lib/dashboard-tiers";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const ENTER = "animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none";

/**
 * Basic-tier dashboard body: a plain net worth number, a simple allocation
 * donut with a text legend (the percentage is printed, so colour is never the
 * only cue) and the largest holdings. No IRR, sparkline or amortization.
 * Semantic tokens only, so it follows light/dark; figures go through Privacy Mode.
 */
export function DashboardBasicOverview({
  netWorth,
  baseCurrency,
  allocation,
  top,
  addAction,
  sparklines,
}: {
  netWorth: number;
  baseCurrency: string;
  allocation: AllocationSlice[];
  top: AmountRow[];
  addAction?: ReactNode;
  /** Per-asset trend values (asset id -> ~24 points). Absent or short = no sparkline. */
  sparklines?: Record<string, number[]>;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();
  const formatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  const categoryLabel = (category: string) => {
    const key = CATEGORY_NAME_KEYS[category];
    return key ? t(key) : category;
  };
  const isEmpty = allocation.length === 0 && top.length === 0;

  return (
    <section aria-label={t("dash_basic_aria")} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className={`${ENTER} gap-3 border-border bg-card py-5 lg:col-span-2`} style={tileEntranceStyle(motion, 0)}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("net_worth")} · {baseCurrency}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
              <NumberTicker value={netWorth} format={(v) => maskValue(formatter.format(v))} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("dash_basic_networth_caption")}</p>
          </div>
          {addAction}
        </div>
      </Card>

      {isEmpty ? (
        <Card
          className={`${ENTER} items-center gap-2 border-border bg-card px-5 py-10 text-center lg:col-span-2`}
          style={tileEntranceStyle(motion, 1)}
        >
          <p className="text-sm font-medium text-foreground">{t("dash_basic_empty_title")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("dash_basic_empty_desc")}</p>
          {addAction && <div className="mt-2">{addAction}</div>}
        </Card>
      ) : (
        <>
          <Card className={`${ENTER} gap-4 border-border bg-card py-5`} style={tileEntranceStyle(motion, 1)}>
            <h2 className="px-5 text-sm font-medium text-foreground">{t("dash_basic_alloc_title")}</h2>
            <div
              role="group"
              aria-label={t("dash_basic_alloc_aria")}
              className="flex flex-col items-center gap-4 px-5 min-[520px]:flex-row lg:flex-col xl:flex-row"
            >
              <div className="h-40 w-40 shrink-0" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius="62%"
                      outerRadius="100%"
                      paddingAngle={allocation.length > 1 ? 2 : 0}
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {allocation.map((slice, i) => (
                        <Cell key={slice.category} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-2">
                {allocation.map((slice, i) => (
                  <li key={slice.category} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span
                        className="line-clamp-2 min-w-0 break-words text-foreground"
                        title={categoryLabel(slice.category)}
                      >
                        {categoryLabel(slice.category)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                      {percent.format(slice.share)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className={`${ENTER} gap-4 border-border bg-card py-5`} style={tileEntranceStyle(motion, 2)}>
            <h2 className="px-5 text-sm font-medium text-foreground">{t("dash_basic_top_title")}</h2>
            <ul className="divide-y divide-border px-5">
              {top.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-background text-primary">
                      <CategoryIcon name={asset.category} className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{categoryLabel(asset.category)}</p>
                    </div>
                  </div>
                  <MicroSparkline values={sparklines?.[asset.id] ?? []} className="ms-auto hidden min-[360px]:block" />
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {maskValue(formatter.format(asset.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}

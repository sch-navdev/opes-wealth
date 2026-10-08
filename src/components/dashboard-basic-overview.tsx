"use client";

import type { ReactNode } from "react";
import { AllocationCard } from "@/components/allocation-card";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useTierMotion } from "@/components/tier-gate";
import { MicroSparkline } from "@/components/micro-sparkline";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle, type AllocationSlice, type AmountRow } from "@/lib/dashboard-tiers";

const ENTER = "animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none";

/**
 * Basic-tier dashboard body: a plain net worth number, an allocation
 * dial with a text legend (the percentage is printed, so colour is never the
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
              <Money value={netWorth} currency={baseCurrency} />
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
          <AllocationCard allocation={allocation} entranceIndex={1} />

          <Card className={`${ENTER} gap-4 border-border bg-card py-5`} style={tileEntranceStyle(motion, 2)}>
            <h2 className="px-5 text-sm font-medium text-foreground">{t("dash_basic_top_title")}</h2>
            <ul className="divide-y divide-border px-5">
              {top.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex shrink-0 items-center justify-center text-primary">
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

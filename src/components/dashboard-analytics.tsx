"use client";

import { useState } from "react";
import { CategoryCards } from "@/components/category-cards";
import { CategoryExplorerPanel } from "@/components/category-explorer-panel";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import type { AssetLineInput, PortfolioPerformanceSeries } from "@/lib/portfolio-performance";

/**
 * Category cards + the Portfolio Performance chart, sharing one copy of the
 * per-asset data (so the server only serialises it once) and the one piece of
 * state that ties them together: which category card's inline explorer is open.
 */
export function DashboardAnalytics({
  series,
  assets,
  currency,
  today,
}: {
  series: PortfolioPerformanceSeries;
  assets: AssetLineInput[];
  currency: string;
  /** Server-rendered ISO date, so projections can't hydrate-mismatch around midnight. */
  today: string;
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  return (
    <>
      <CategoryCards
        assets={assets}
        currency={currency}
        selected={openCategory}
        // Clicking the open category again collapses its panel.
        onSelect={(category) => setOpenCategory((prev) => (prev === category ? null : category))}
      />

      {openCategory && (
        <CategoryExplorerPanel
          key={openCategory}
          category={openCategory}
          assets={assets.filter((a) => a.category === openCategory)}
          currency={currency}
          today={today}
          onClose={() => setOpenCategory(null)}
        />
      )}

      <PortfolioPerformanceChart
        series={series}
        assets={assets}
        currency={currency}
        today={today}
      />
    </>
  );
}

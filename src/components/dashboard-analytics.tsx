"use client";

import { useEffect, useState } from "react";
import { CategoryCards } from "@/components/category-cards";
import { CategoryExplorerPanel } from "@/components/category-explorer-panel";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { OPEN_CATEGORY_EVENT } from "@/lib/category-events";
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

  // The allocation dial asks for a category explorer by event (it is a separate dashboard block).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const category = (e as CustomEvent<unknown>).detail;
      if (typeof category !== "string" || !assets.some((a) => a.category === category)) return;
      setOpenCategory(category);
      requestAnimationFrame(() => document.getElementById("category-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(OPEN_CATEGORY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CATEGORY_EVENT, onOpen);
  }, [assets]);

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

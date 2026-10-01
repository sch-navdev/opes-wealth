"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssetLinesChart } from "@/components/asset-lines-chart";
import {
  InvestedToggle,
  ProjectionControls,
  RangeSelector,
  TimelineToggle,
  parseGrowthInput,
} from "@/components/chart-toggles";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useLanguage } from "@/context/language-context";
import {
  AGGREGATE_LINE_KEY,
  PORTFOLIO_PERFORMANCE_TOTAL_KEY,
  buildChartSeries,
  type AssetLineInput,
  type ChartWindow,
  DEFAULT_CHART_WINDOW,
  type LineSeries,
  type PortfolioPerformanceSeries,
  type TimelineMode,
} from "@/lib/portfolio-performance";
import type { TranslationKey } from "@/lib/i18n";

export function PortfolioPerformanceChart({
  series,
  assets,
  currency,
  today,
}: {
  /** Full-resolution Net Worth series (Total + per category) — the historical curve. */
  series: PortfolioPerformanceSeries;
  /** Per-asset data, used for the projection and the invested-capital overlay. */
  assets: AssetLineInput[];
  currency: string;
  today: string;
}) {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<string>(PORTFOLIO_PERFORMANCE_TOTAL_KEY);
  const [timeline, setTimeline] = useState<TimelineMode>("historical");
  const [dateWindow, setDateWindow] = useState<ChartWindow>(DEFAULT_CHART_WINDOW);
  const [showInvested, setShowInvested] = useState(true);
  const [horizonYears, setHorizonYears] = useState(10);
  const [growthInput, setGrowthInput] = useState("");

  function categoryLabel(category: string): string {
    const key = CATEGORY_NAME_KEYS[category] as TranslationKey | undefined;
    return key ? t(key) : category;
  }

  const activeKey = series.categories.includes(activeFilter)
    ? activeFilter
    : PORTFOLIO_PERFORMANCE_TOTAL_KEY;
  const isTotal = activeKey === PORTFOLIO_PERFORMANCE_TOTAL_KEY;
  const activeLabel = isTotal ? t("net_worth") : categoryLabel(activeKey);
  const activeAssets = useMemo(
    () => (isTotal ? assets : assets.filter((a) => a.category === activeKey)),
    [assets, activeKey, isTotal],
  );
  // Invested capital only makes sense against a category that tracks its own
  // cost (Equities, Real Estate, Vehicles) — against total Net Worth it would
  // compare capital for a few assets with the value of all of them.
  const hasInvestedData =
    !isTotal && activeAssets.some((a) => a.invested && a.invested.length > 0);
  const growthOverride = parseGrowthInput(growthInput);

  // The recorded curve comes from the full-resolution server series. A
  // category's axis starts at ITS first history row (e.g. your first Real
  // Estate purchase), not the portfolio's — otherwise selecting it leaves
  // years of zeros from brokerage trades made before you owned any of it.
  const historicalOverride = useMemo<LineSeries>(() => {
    const start = isTotal ? undefined : series.categoryStart[activeKey];
    return {
      lines: [{ key: AGGREGATE_LINE_KEY, label: "", assetId: null }],
      points: series.points
        .filter((p) => !start || p.date >= start)
        .map((p) => ({
          date: p.date,
          ts: new Date(p.date).getTime(),
          [AGGREGATE_LINE_KEY]: p[activeKey],
        })),
    };
  }, [series, activeKey, isTotal]);

  const chartSeries = useMemo(
    () =>
      buildChartSeries(activeAssets, {
        mode: "aggregate",
        timeline,
        window: dateWindow,
        showInvested: showInvested && hasInvestedData,
        today,
        horizonYears,
        growthOverride,
        historicalOverride,
      }),
    [
      activeAssets,
      timeline,
      dateWindow,
      showInvested,
      hasInvestedData,
      today,
      horizonYears,
      growthOverride,
      historicalOverride,
    ],
  );

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-foreground">
          {t("portfolio_performance_title")}
        </CardTitle>
        <TimelineToggle value={timeline} onChange={setTimeline} />
      </CardHeader>
      <CardContent className="space-y-4">
        {series.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isTotal ? "default" : "outline"}
              onClick={() => setActiveFilter(PORTFOLIO_PERFORMANCE_TOTAL_KEY)}
            >
              {t("portfolio_performance_filter_all")}
            </Button>
            {series.categories.map((category) => (
              <Button
                key={category}
                type="button"
                size="sm"
                variant={activeKey === category ? "default" : "outline"}
                onClick={() => setActiveFilter(category)}
              >
                {categoryLabel(category)}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {timeline !== "projection" && <RangeSelector value={dateWindow} onChange={setDateWindow} />}
          {hasInvestedData && timeline !== "projection" && (
            <InvestedToggle checked={showInvested} onChange={setShowInvested} idPrefix="portfolio" />
          )}
          {timeline !== "historical" && (
            <ProjectionControls
              horizonYears={horizonYears}
              onHorizonChange={setHorizonYears}
              growthInput={growthInput}
              onGrowthInputChange={setGrowthInput}
              idPrefix="portfolio"
            />
          )}
        </div>

        {series.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("portfolio_performance_empty")}
          </p>
        ) : (
          <>
            <AssetLinesChart
              series={chartSeries}
              currency={currency}
              aggregateLabel={activeLabel}
            />
            {hasInvestedData && showInvested && timeline !== "projection" && (
              <p className="text-xs text-muted-foreground">{t("projection_invested_note")}</p>
            )}
            {timeline !== "historical" && (
              <p className="text-xs text-muted-foreground">{t("projection_dashboard_note")}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

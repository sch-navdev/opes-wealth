"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { AssetLinesChart, lineColor } from "@/components/asset-lines-chart";
import {
  InvestedToggle,
  ProjectionControls,
  RangeSelector,
  TimelineToggle,
  ViewModeToggle,
  parseGrowthInput,
} from "@/components/chart-toggles";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import {
  DEFAULT_CHART_WINDOW,
  buildChartSeries,
  type AssetLineInput,
  type ChartWindow,
  type LineViewMode,
  type TimelineMode,
} from "@/lib/portfolio-performance";
import { cn } from "@/lib/utils";

/**
 * Inline category explorer, rendered directly under the category cards and
 * above (never instead of) the main Portfolio Performance chart. Same card
 * shell and chart size as that chart, so the two line up: pick any subset of
 * the category's assets, Grouped vs Individual lines, Historical /
 * Projection / Combined, a date window and the invested-capital overlay.
 * Mounted with `key={category}` so each category starts fresh.
 */
export function CategoryExplorerPanel({
  category,
  assets,
  currency,
  today,
  onClose,
}: {
  category: string;
  assets: AssetLineInput[];
  currency: string;
  today: string;
  onClose: () => void;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();

  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => Math.abs(b.currentValue) - Math.abs(a.currentValue)),
    [assets],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(assets.map((a) => a.id)),
  );
  const [viewMode, setViewMode] = useState<LineViewMode>("aggregate");
  const [timeline, setTimeline] = useState<TimelineMode>("historical");
  const [horizonYears, setHorizonYears] = useState(10);
  const [growthInput, setGrowthInput] = useState("");
  const [dateWindow, setDateWindow] = useState<ChartWindow>(DEFAULT_CHART_WINDOW);
  const [showInvested, setShowInvested] = useState(true);

  const formatter = useMemo(
    () => new Intl.NumberFormat(intlLocale, { style: "currency", currency }),
    [intlLocale, currency],
  );
  const money = (n: number) => maskValue(formatter.format(n));

  const selectedAssets = sortedAssets.filter((a) => selectedIds.has(a.id));
  const growthOverride = parseGrowthInput(growthInput);
  const hasInvestedData = selectedAssets.some((a) => a.invested && a.invested.length > 0);

  const series = useMemo(() => {
    const chosen = sortedAssets.filter((a) => selectedIds.has(a.id));
    return buildChartSeries(chosen, {
      mode: viewMode,
      timeline,
      window: dateWindow,
      showInvested,
      today,
      horizonYears,
      growthOverride,
    });
  }, [sortedAssets, selectedIds, viewMode, timeline, dateWindow, showInvested, horizonYears, growthOverride, today]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const labelKey = CATEGORY_NAME_KEYS[category];
  const categoryLabel = labelKey ? t(labelKey) : category;
  const selectedTotal = selectedAssets.reduce((sum, a) => sum + a.currentValue, 0);
  const allSelected = selectedIds.size === sortedAssets.length;

  return (
    <Card id="category-explorer" className="scroll-mt-4 border-border bg-card" aria-label={categoryLabel}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <span className="text-primary">
            <CategoryIcon name={category} />
          </span>
          {categoryLabel}
          <span className="text-xs font-normal text-muted-foreground">
            {t("explorer_selected_total")}: {money(selectedTotal)}
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <TimelineToggle value={timeline} onChange={setTimeline} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {t("explorer_assets_heading", {
                selected: selectedIds.size,
                total: sortedAssets.length,
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelectedIds(allSelected ? new Set() : new Set(sortedAssets.map((a) => a.id)))
              }
            >
              {allSelected ? t("explorer_clear") : t("explorer_select_all")}
            </Button>
          </div>
          <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {sortedAssets.map((asset) => {
              const checked = selectedIds.has(asset.id);
              const line = series.lines.find((l) => l.assetId === asset.id && l.group != null);
              return (
                <li key={asset.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 border border-border px-2 py-1 text-sm hover:bg-muted",
                      !checked && "text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggle(asset.id, value === true)}
                      aria-label={asset.name}
                    />
                    {viewMode === "individual" && checked && line && (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: lineColor(line.group!) }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="max-w-48 truncate">{asset.name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {money(asset.currentValue)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          {timeline !== "projection" && <RangeSelector value={dateWindow} onChange={setDateWindow} />}
          {hasInvestedData && timeline !== "projection" && (
            <InvestedToggle checked={showInvested} onChange={setShowInvested} idPrefix="explorer" />
          )}
          {timeline !== "historical" && (
            <ProjectionControls
              horizonYears={horizonYears}
              onHorizonChange={setHorizonYears}
              growthInput={growthInput}
              onGrowthInputChange={setGrowthInput}
              idPrefix="explorer"
            />
          )}
        </div>

        {selectedAssets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("explorer_pick_one")}</p>
        ) : (
          <AssetLinesChart
            series={series}
            currency={currency}
            aggregateLabel={
              selectedAssets.length === sortedAssets.length
                ? categoryLabel
                : t("explorer_selection_label", { n: selectedAssets.length })
            }
          />
        )}
        {hasInvestedData && showInvested && timeline !== "projection" && (
          <p className="text-xs text-muted-foreground">{t("projection_invested_note")}</p>
        )}
        {timeline !== "historical" && (
          <p className="text-xs text-muted-foreground">{t("projection_dashboard_note")}</p>
        )}
      </CardContent>
    </Card>
  );
}

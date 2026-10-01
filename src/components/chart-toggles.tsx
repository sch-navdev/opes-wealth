"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/context/language-context";
import {
  CHART_RANGES,
  DEFAULT_CHART_WINDOW,
  isCustomWindow,
  type ChartRange,
  type ChartWindow,
  type LineViewMode,
  type TimelineMode,
} from "@/lib/portfolio-performance";

export const PROJECTION_HORIZONS = [5, 10, 20] as const;

/** Historical Valuation ⇄ Forward-Looking Projections. */
export function TimelineToggle({
  value,
  onChange,
}: {
  value: TimelineMode;
  onChange: (next: TimelineMode) => void;
}) {
  const { t } = useLanguage();
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as TimelineMode)}>
      <TabsList>
        <TabsTrigger value="historical">{t("timeline_historical")}</TabsTrigger>
        <TabsTrigger value="projection">{t("timeline_projection")}</TabsTrigger>
        <TabsTrigger value="combined">{t("timeline_combined")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * 1M / 6M / 1Y / 5Y / All presets plus exact custom From / To dates. Typing
 * either date switches to a custom window (no preset highlighted); picking a
 * preset clears the custom dates.
 */
export function RangeSelector({
  value,
  onChange,
}: {
  value: ChartWindow;
  onChange: (next: ChartWindow) => void;
}) {
  const { t } = useLanguage();
  const custom = isCustomWindow(value);
  const reversed = value.from !== "" && value.to !== "" && value.from > value.to;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        value={custom ? "custom" : value.range}
        onValueChange={(next) =>
          onChange({ range: next as ChartRange, from: "", to: "" })
        }
      >
        <TabsList aria-label={t("range_label")}>
          {CHART_RANGES.map((range) => (
            <TabsTrigger key={range} value={range}>
              {range === "all" ? t("range_all") : range}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">
          {t("range_from")}
          <Input
            type="date"
            className="ms-2 inline-block h-8 w-36"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label={t("range_from")}
          />
        </Label>
        <Label className="text-xs text-muted-foreground">
          {t("range_to")}
          <Input
            type="date"
            className="ms-2 inline-block h-8 w-36"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label={t("range_to")}
          />
        </Label>
        {custom && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_CHART_WINDOW)}
          >
            {t("range_reset")}
          </Button>
        )}
        {reversed && (
          <span className="text-xs text-muted-foreground">{t("range_swapped")}</span>
        )}
      </div>
    </div>
  );
}

/** "Show invested capital" switch (cumulative capital vs current valuation). */
export function InvestedToggle({
  checked,
  onChange,
  idPrefix,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  idPrefix: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <Switch id={`${idPrefix}-invested`} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={`${idPrefix}-invested`} className="text-xs text-muted-foreground">
        {t("chart_show_invested")}
      </Label>
    </div>
  );
}

/** Grouped Aggregate Line ⇄ Individual Asset Lines. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: LineViewMode;
  onChange: (next: LineViewMode) => void;
}) {
  const { t } = useLanguage();
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as LineViewMode)}>
      <TabsList>
        <TabsTrigger value="aggregate">{t("view_aggregate")}</TabsTrigger>
        <TabsTrigger value="individual">{t("view_individual")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** Horizon picker + optional blanket growth-rate override for projection mode. */
export function ProjectionControls({
  horizonYears,
  onHorizonChange,
  growthInput,
  onGrowthInputChange,
  idPrefix,
}: {
  horizonYears: number;
  onHorizonChange: (years: number) => void;
  growthInput: string;
  onGrowthInputChange: (value: string) => void;
  idPrefix: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs
        value={String(horizonYears)}
        onValueChange={(next) => onHorizonChange(Number(next))}
      >
        <TabsList>
          {PROJECTION_HORIZONS.map((years) => (
            <TabsTrigger key={years} value={String(years)}>
              {t("projection_horizon_years", { n: years })}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-growth`} className="text-xs text-muted-foreground">
          {t("projection_growth_override")}
        </Label>
        <Input
          id={`${idPrefix}-growth`}
          type="number"
          step="0.1"
          className="h-8 w-20"
          placeholder={t("projection_growth_auto")}
          value={growthInput}
          onChange={(e) => onGrowthInputChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/** Parses the growth input (a percentage) into a fraction, or `null` when blank/invalid. */
export function parseGrowthInput(input: string): number | null {
  if (input.trim() === "") return null;
  const n = Number(input);
  return Number.isFinite(n) ? n / 100 : null;
}

"use client";

import { useMemo } from "react";
import { PartitionBar } from "@/components/partition-bar";
import { VehicleValuationChart } from "@/components/vehicle-valuation-chart";
import { vehicleAnalysis, vehicleCurveRows, type VehicleAnalysisInput } from "@/lib/asset-analysis/vehicle";
import { convertAmount } from "@/lib/fx";
import { parseVehicleMetadata } from "@/lib/vehicles";
import { PositionStats } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Vehicles: depreciation curve against the Blue Book and the purchase price, residual value, cost of ownership. */
export function VehicleAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseVehicleMetadata(p.asset.metadata), [p.asset.metadata]);
  const input = useMemo<VehicleAnalysisInput>(
    () => ({
      metadata: md,
      currentValue: p.asset.current_value,
      purchaseDate: p.asset.purchase_date,
      today: p.today,
      market: p.history.map((h) => ({ recorded_date: h.recorded_date, value: Number(h.value) })),
      guide: md.blue_book_log.map((e) => ({ date: e.date, value: convertAmount(e.amount, e.currency || p.asset.currency, p.asset.currency, p.ratesFromUsd) })),
    }),
    [md, p.asset.current_value, p.asset.purchase_date, p.asset.currency, p.today, p.history, p.ratesFromUsd],
  );
  const a = useMemo(() => vehicleAnalysis(input), [input]);
  const rows = useMemo(() => vehicleCurveRows(input), [input]);
  const noPrice = a.purchasePrice == null;
  const parts = a.valueLost != null ? [{ key: "dep", share: Math.max(0, a.valueLost), color: "var(--color-chart-4)" }, { key: "run", share: a.runningCosts, color: "var(--color-chart-2)" }] : [];

  return (
    <AnalysisStack testId="analysis-vehicle">
      <AnalysisCard title={at("an_vehicle_curve")} description={at("an_vehicle_curve_desc")} testId="an-vehicle-curve">
        {rows.length === 0 ? (
          <EmptyNote missing={at("an_vehicle_curve_missing")} how={at("an_vehicle_curve_how")} />
        ) : (
          <VehicleValuationChart rows={rows} currency={p.asset.currency} heightClassName="h-64" showModel />
        )}
      </AnalysisCard>

      <AnalysisCard title={at("an_vehicle_residual")} testId="an-vehicle-residual">
        <StatGrid>
          <Stat label={at("an_vehicle_residual_pct")} value={f.pct(a.residualPct, 1)} hint={noPrice ? at("an_vehicle_price_missing") : at("an_vehicle_residual_hint")} testId="an-vehicle-residual-pct" />
          <Stat label={at("an_vehicle_value_lost")} value={f.money(a.valueLost)} tone={a.valueLost != null ? toneOf(-a.valueLost) : "neutral"} />
          <Stat label={at("an_vehicle_lost_month")} value={f.money(a.valueLostPerMonth)} hint={a.ownershipMonths != null ? at("an_vehicle_months", { n: f.num(a.ownershipMonths, 1) }) : at("an_vehicle_date_missing")} />
          <Stat label={at("an_vehicle_vs_bb")} value={f.money(a.marketVsBlueBook)} tone={toneOf(a.marketVsBlueBook)} hint={a.latestBlueBook == null ? at("an_vehicle_bb_missing") : undefined} />
        </StatGrid>
        <InfoNote />
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_vehicle_tco")} description={at("an_vehicle_tco_desc")} testId="an-vehicle-tco">
          <StatGrid>
            <Stat label={at("an_vehicle_tco_total")} value={f.money(a.totalCostOfOwnership)} hint={noPrice ? at("an_vehicle_price_missing") : undefined} />
            <Stat label={at("an_vehicle_tco_month")} value={f.money(a.tcoPerMonth)} />
            <Stat label={at("an_vehicle_tco_km")} value={f.money2(a.tcoPerKm)} hint={a.tcoPerKm == null ? at("an_vehicle_km_missing") : at("an_vehicle_km_hint")} />
            <Stat label={at("an_vehicle_running")} value={f.money(a.runningCosts)} hint={a.ledgerCosts === 0 ? at("an_vehicle_expenses_hint") : undefined} />
            <PositionStats p={p} />
          </StatGrid>
          {parts.length > 0 && parts[0].share + parts[1].share > 0 && (
            <div className="space-y-1">
              <PartitionBar segments={parts} />
              <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span>{at("an_vehicle_legend_dep", { share: f.pct(a.depreciationShare, 0) })}</span>
                <span>{at("an_vehicle_legend_run", { amount: f.money(a.runningCosts) })}</span>
              </p>
            </div>
          )}
        </AnalysisCard>

        <AnalysisCard title={at("an_vehicle_by_category")} testId="an-vehicle-categories">
          {a.costsByCategory.length === 0 ? (
            <EmptyNote missing={at("an_vehicle_expenses_missing")} how={at("an_vehicle_expenses_how")} />
          ) : (
            <ul className="divide-y divide-border border border-border text-sm">
              {a.costsByCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 p-2">
                  <span className="min-w-0 truncate capitalize text-foreground">{c.category}</span>
                  <span className="text-xs text-muted-foreground">{at("an_vehicle_entries", { n: c.count })}</span>
                  <span className="tabular-nums text-foreground">{f.money(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

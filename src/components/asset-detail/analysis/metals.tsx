"use client";

import { useMemo } from "react";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { metalAnalysis } from "@/lib/asset-analysis/metals";
import { parsePreciousMetalMetadata } from "@/lib/precious-metals";
import { PositionStats } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, Stat, useAtLeastTier, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Precious metals: weight, spot against value, premium over spot, change since the first record, share of portfolio. */
export function MetalsAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const pro = useAtLeastTier("professional");
  const f = useAnalysisFormat(p.asset.currency);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const md = useMemo(() => parsePreciousMetalMetadata(p.asset.metadata), [p.asset.metadata]);
  const a = useMemo(() => metalAnalysis({ metadata: md, quantity: p.asset.quantity, currentValue: p.asset.current_value, history }), [md, p.asset.quantity, p.asset.current_value, history]);
  const metal = at(`an_metal_${md.metal}` as "an_metal_gold");

  return (
    <AnalysisStack testId="analysis-metals">
      <AnalysisCard title={at("an_metal_spot")} description={at("an_metal_spot_desc", { metal })} testId="an-metal-spot">
        {a.fineOunces == null ? (
          <EmptyNote missing={at("an_metal_weight_missing")} how={at("an_metal_weight_how")} />
        ) : (
          <StatGrid>
            <Stat label={at("an_metal_weight")} value={`${f.num(a.grossGrams, 1)} g`} hint={at("an_metal_fine", { n: f.num(a.fineOunces, 3) })} />
            <Stat label={at("an_metal_spot_price")} value={f.money2(a.spot)} hint={a.spot == null ? at("an_metal_spot_missing") : at("an_metal_per_oz")} />
            <Stat label={at("an_metal_spot_value")} value={f.money(a.spotValue)} />
            <Stat label={at("an_current_value")} money={p.asset.current_value} currency={p.asset.currency} />
            <Stat label={at("an_metal_premium")} value={f.money(a.premiumAmount)} tone={toneOf(a.premiumAmount)} hint={a.premiumPct != null ? f.pct(a.premiumPct, 1, true) : at("an_metal_spot_missing")} testId="an-metal-premium" />
            <Stat label={at("an_metal_premium_stated")} value={f.pct(a.statedPremiumPct, 1)} />
            <Stat label={at("an_metal_price_oz")} value={f.money2(a.pricePerFineOunce)} />
            <Stat label={at("an_metal_cost")} value={undefined} hint={at("an_metal_cost_missing")} />
            {pro && <PositionStats p={p} />}
          </StatGrid>
        )}
        <InfoNote />
      </AnalysisCard>

      <AnalysisCard title={at("an_metal_value_history")} testId="an-metal-history">
        {history.length < 2 ? (
          <EmptyNote missing={at("an_empty_history_missing")} how={at("an_empty_history_how")} />
        ) : (
          <>
            <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <Stat label={at("an_change_first")} value={f.money(a.sinceFirstRecord?.amount)} tone={toneOf(a.sinceFirstRecord?.amount)} hint={f.pct(a.sinceFirstRecord?.pct, 1, true)} />
            </StatGrid>
            <AnalysisChart rows={history.map((h) => ({ date: h.date, value: h.value }))} series={[{ key: "value", name: at("an_current_value") }]} currency={p.asset.currency} label={at("an_metal_value_history")} />
          </>
        )}
      </AnalysisCard>
    </AnalysisStack>
  );
}

"use client";

import { useMemo } from "react";
import { exoticAnalysis } from "@/lib/asset-analysis/exotic";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { parseExoticMetadata } from "@/lib/exotic-assets";
import { PositionStats } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Exotic assets (watches, wine, art): appraisal history, gain against purchase, holding period, insured against market value. */
export function ExoticAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseExoticMetadata(p.asset.metadata), [p.asset.metadata]);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const a = useMemo(
    () => exoticAnalysis({ metadata: md, rawMetadata: p.asset.metadata, marketValue: p.asset.current_value, purchaseDate: p.asset.purchase_date, history, today: p.today }),
    [md, p.asset.metadata, p.asset.current_value, p.asset.purchase_date, history, p.today],
  );

  return (
    <AnalysisStack testId="analysis-exotic">
      <AnalysisCard title={at("an_ex_appraisals")} description={at("an_ex_appraisals_desc")} testId="an-ex-appraisals">
        {a.appraisals.length < 2 ? (
          <EmptyNote missing={at("an_ex_appraisals_missing")} how={at("an_ex_appraisals_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_current_value")} money={p.asset.current_value} currency={p.asset.currency} />
              <Stat label={at("an_ex_purchase")} value={f.money(a.purchasePrice)} hint={a.purchasePrice == null ? at("an_ex_purchase_missing") : undefined} />
              <Stat label={at("an_ex_gain")} value={f.money(a.gain?.amount)} tone={toneOf(a.gain?.amount)} hint={a.gain?.percent != null ? f.pct(a.gain.percent / 100, 1, true) : undefined} testId="an-ex-gain" />
              <Stat label={at("an_ex_cagr")} value={f.pct(a.annualisedGrowth, 1, true)} tone={toneOf(a.annualisedGrowth)} hint={at("an_ex_cagr_hint")} />
            </StatGrid>
            <AnalysisChart rows={a.appraisals.map((h) => ({ date: h.date, value: h.value }))} series={[{ key: "value", name: at("an_ex_appraisal_line"), step: true, dots: true }]} currency={p.asset.currency} label={at("an_ex_appraisals")} />
          </>
        )}
        <InfoNote />
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_ex_cover")} testId="an-ex-cover">
          <StatGrid>
            <Stat label={at("an_ex_insured")} value={f.money(a.insuredValue)} hint={a.insuredValue == null ? at("an_ex_insured_missing") : undefined} testId="an-ex-insured" />
            <Stat label={at("an_ex_insured_gap")} value={f.money(a.insuredGap)} tone={toneOf(a.insuredGap)} hint={at("an_ex_insured_gap_hint")} />
            <Stat label={at("an_ex_held")} value={a.holdingYears != null ? at("an_years_n", { n: f.num(a.holdingYears, 1) }) : undefined} hint={a.holdingYears == null ? at("an_ex_date_missing") : undefined} />
            <PositionStats p={p} />
          </StatGrid>
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

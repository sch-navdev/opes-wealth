"use client";

import { useMemo } from "react";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { genericAnalysis } from "@/lib/asset-analysis/generic";
import { positionShare } from "@/lib/asset-analysis/portfolio";
import { AnalysisCard, AnalysisChart, EmptyNote, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import { useAnalysisText } from "./text";
import type { AssetAnalysisProps } from "./types";

/** Share of the portfolio and of the asset class (en dash while the portfolio figures are not loaded). */
export function PositionStats({ p }: { p: AssetAnalysisProps }) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const s = positionShare({ value: p.asset.current_value, currency: p.asset.currency, portfolio: p.portfolio, ratesFromUsd: p.ratesFromUsd });
  return (
    <>
      <Stat label={at("an_share_portfolio")} value={f.pct(s.ofPortfolio, 1)} hint={s.ofPortfolio == null ? at("an_share_unavailable") : undefined} testId="an-share-portfolio" />
      <Stat label={at("an_share_class")} value={f.pct(s.ofCategory, 1)} />
    </>
  );
}

/** Recorded value over time with change, high and low: the generic view and the base of several classes. */
export function ValueHistoryCard({ p, title }: { p: AssetAnalysisProps; title?: string }) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const series = useMemo(() => historyToSeries(p.history), [p.history]);
  const g = useMemo(() => genericAnalysis(series), [series]);
  return (
    <AnalysisCard title={title ?? at("an_value_history")} testId="an-value-history">
      {series.length < 2 ? (
        <EmptyNote missing={at("an_empty_history_missing")} how={at("an_empty_history_how")} />
      ) : (
        <>
          <StatGrid>
            <Stat label={at("an_current_value")} money={p.asset.current_value} currency={p.asset.currency} />
            <Stat label={at("an_change_first")} value={f.money(g.change?.amount)} tone={toneOf(g.change?.amount)} hint={g.change?.pct != null ? f.pct(g.change.pct, 1, true) : undefined} />
            <Stat label={at("an_high")} value={f.money(g.high?.value)} hint={f.date(g.high?.date)} />
            <Stat label={at("an_low")} value={f.money(g.low?.value)} hint={f.date(g.low?.date)} />
          </StatGrid>
          <AnalysisChart rows={series.map((s) => ({ date: s.date, value: s.value }))} series={[{ key: "value", name: at("an_current_value") }]} currency={p.asset.currency} label={at("an_value_history")} />
        </>
      )}
    </AnalysisCard>
  );
}

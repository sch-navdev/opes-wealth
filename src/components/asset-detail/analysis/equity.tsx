"use client";

import { useMemo } from "react";
import { TaxLotsCard } from "@/components/tax-lots-card";
import { annualisedVolatility, historyToSeries, maxDrawdown } from "@/lib/asset-analysis/common";
import { costValueRows, equityIncome, equityPerformance, equityXirr } from "@/lib/asset-analysis/equity";
import { parseEquityMetadata } from "@/lib/equities";
import { PositionStats, ValueHistoryCard } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";
import type { AnalysisKey } from "@/lib/asset-analysis/labels";

const XIRR_GAP: Record<string, AnalysisKey> = {
  no_trades: "an_eq_xirr_no_trades",
  mixed_currency: "an_eq_xirr_mixed",
  no_solution: "an_eq_xirr_no_solution",
  too_short: "an_eq_xirr_short",
};

/** Equities: performance against cost, money-weighted return, income, risk and position share, plus the tax lots. */
export function EquityAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseEquityMetadata(p.asset.metadata), [p.asset.metadata]);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const perf = useMemo(() => equityPerformance({ quantity: p.asset.quantity, currentValue: p.asset.current_value, metadata: md }), [p.asset.quantity, p.asset.current_value, md]);
  const irr = useMemo(
    () => equityXirr({ metadata: md, currency: p.asset.currency, quantity: p.asset.quantity, currentValue: p.asset.current_value, today: p.today }),
    [md, p.asset.currency, p.asset.quantity, p.asset.current_value, p.today],
  );
  const income = useMemo(() => equityIncome(md, p.asset.current_value, perf.cost, p.today), [md, p.asset.current_value, perf.cost, p.today]);
  const rows = useMemo(() => costValueRows(md, history), [md, history]);
  const dd = useMemo(() => maxDrawdown(history), [history]);
  const vol = useMemo(() => annualisedVolatility(history), [history]);
  const hasTrades = md.trades.length > 0;

  return (
    <AnalysisStack testId="analysis-equity">
      <AnalysisCard title={at("an_eq_perf")} description={at("an_eq_perf_desc")} testId="an-eq-perf">
        {perf.cost == null ? (
          <EmptyNote missing={at("an_eq_perf_missing")} how={at("an_eq_perf_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_eq_cost")} value={f.money(perf.cost)} />
              <Stat label={at("an_current_value")} money={perf.value} currency={p.asset.currency} />
              <Stat label={at("an_eq_gain")} value={f.money(perf.gain)} tone={toneOf(perf.gain)} hint={f.pct(perf.gainPct, 1, true)} testId="an-eq-gain" />
              <Stat label={at("an_eq_total_return")} value={f.pct(perf.totalReturnPct, 1, true)} tone={toneOf(perf.totalReturnPct)} hint={at("an_eq_total_return_hint")} />
            </StatGrid>
            {rows.length >= 2 && (
              <AnalysisChart
                rows={rows}
                series={[
                  { key: "value", name: at("an_current_value") },
                  { key: "cost", name: at("an_eq_cost"), step: true, dash: "6 4", color: "var(--color-muted-foreground)" },
                ]}
                currency={p.asset.currency}
                label={at("an_eq_perf")}
              />
            )}
          </>
        )}
      </AnalysisCard>

      <AnalysisCard title={at("an_eq_xirr")} description={at("an_eq_xirr_desc")} testId="an-eq-xirr">
        <StatGrid>
          <Stat label={at("an_eq_xirr_rate")} value={irr.ok ? f.pct(irr.rate, 1, true) : undefined} tone={irr.ok ? toneOf(irr.rate) : "neutral"} hint={irr.ok ? at("an_eq_xirr_flows", { n: irr.flows }) : at(XIRR_GAP[irr.reason])} testId="an-eq-xirr-rate" />
          <Stat label={at("an_eq_income_12m")} value={income ? f.money(income.trailing12m) : undefined} hint={income ? at("an_eq_income_total", { amount: f.money(income.total) }) : at("an_eq_income_missing")} />
          <Stat label={at("an_eq_yield_value")} value={f.pct(income?.yieldOnValue, 2)} />
          <Stat label={at("an_eq_yield_cost")} value={f.pct(income?.yieldOnCost, 2)} />
        </StatGrid>
        <InfoNote />
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_eq_risk")} testId="an-eq-risk">
          <StatGrid>
            <Stat label={at("an_max_drawdown")} value={f.pct(dd?.pct, 1)} tone={dd && dd.pct < 0 ? "negative" : "neutral"} hint={dd ? `${f.date(dd.peak.date)} – ${f.date(dd.trough.date)}` : at("an_needs_history")} />
            <Stat label={at("an_drawdown_now")} value={f.pct(dd?.current, 1)} />
            <Stat label={at("an_volatility")} value={f.pct(vol, 1)} hint={vol == null ? at("an_needs_history") : at("an_volatility_hint")} />
            <PositionStats p={p} />
          </StatGrid>
        </AnalysisCard>
        {!hasTrades && <ValueHistoryCard p={p} />}
      </MinTier>

      {hasTrades && <TaxLotsCard asset={p.rawAsset} ownerFactor={p.ownerFactor} />}
    </AnalysisStack>
  );
}

"use client";

import { useMemo } from "react";
import { realEstateExtras } from "@/lib/asset-analysis/real-estate";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/**
 * Real Estate: only what the existing Analysis cards (market performance, gross / net share, off-plan status) do
 * not show: yield on cost, equity build-up and loan to value through time.
 */
export function RealEstateAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseRealEstateMetadata(p.asset.metadata), [p.asset.metadata]);
  const marketValue = md.market_valuation ?? p.asset.current_value;
  const x = useMemo(
    () => realEstateExtras({ metadata: md, marketValue, history: p.history.map((h) => ({ recorded_date: h.recorded_date, value: Number(h.value) })), today: p.today }),
    [md, marketValue, p.history, p.today],
  );

  return (
    <AnalysisStack testId="analysis-real-estate">
      <AnalysisCard title={at("an_re_yield")} description={at("an_re_yield_desc")} testId="an-re-yield">
        {x.annualRent == null ? (
          <EmptyNote missing={at("an_re_rent_missing")} how={at("an_re_rent_how")} />
        ) : (
          <StatGrid>
            <Stat label={at("an_re_rent_annual")} value={f.money(x.annualRent)} />
            <Stat label={at("an_re_yield_gross")} value={f.pct(x.grossYieldOnCost, 2)} hint={at("an_re_on_cost", { amount: f.money(x.totalCost) })} testId="an-re-yield-gross" />
            <Stat label={at("an_re_yield_net")} value={f.pct(x.netYieldOnCost, 2)} hint={at("an_re_net_hint", { amount: f.money(x.expenses12m) })} />
            <Stat label={at("an_re_yield_value")} value={f.pct(x.yieldOnValue, 2)} />
          </StatGrid>
        )}
        <InfoNote />
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_re_equity")} description={at("an_re_equity_desc")} testId="an-re-equity">
          {x.series.length < 2 ? (
            <EmptyNote missing={at("an_re_series_missing")} how={at("an_re_series_how")} />
          ) : (
            <>
              <StatGrid>
                <Stat label={at("an_re_equity_now")} value={f.money(x.equityNow)} />
                <Stat label={at("an_re_build_up")} value={f.money(x.equityBuildUp)} tone={toneOf(x.equityBuildUp)} hint={at("an_re_build_hint", { date: f.date(x.series[0].date) })} />
                <Stat label={at("an_re_loan_now")} value={x.hasLoan ? f.money(x.loanNow) : undefined} hint={x.hasLoan ? undefined : at("an_re_no_loan")} />
                <Stat label={at("an_re_ltv_now")} value={f.pct(x.ltvNow, 1)} />
              </StatGrid>
              <AnalysisChart
                rows={x.series.map((s) => ({ date: s.date, market: s.market, loan: s.loan, equity: s.equity }))}
                series={[
                  { key: "market", name: at("an_re_market") },
                  { key: "equity", name: at("an_re_equity_line"), color: "var(--color-success)" },
                  ...(x.hasLoan ? [{ key: "loan", name: at("an_re_loan_line"), color: "var(--color-destructive)", dash: "4 4" }] : []),
                ]}
                currency={p.asset.currency}
                label={at("an_re_equity")}
              />
              {x.hasLoan && (
                <AnalysisChart
                  rows={x.series.map((s) => ({ date: s.date, ltv: s.ltv }))}
                  series={[{ key: "ltv", name: at("an_re_ltv_line"), color: "var(--color-chart-4)", step: true }]}
                  currency={p.asset.currency}
                  valueFormat="percent"
                  heightClassName="h-40"
                  label={at("an_re_ltv_line")}
                />
              )}
            </>
          )}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

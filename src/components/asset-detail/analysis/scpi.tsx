"use client";

import { useMemo } from "react";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { scpiAnalysis } from "@/lib/asset-analysis/scpi";
import { parseScpiMetadata } from "@/lib/scpi";
import { PositionStats } from "./common-cards";
import { ScpiIndicatorsSlot } from "./scpi-indicators-slot";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** SCPI: value against capital invested, withdrawal against subscription, distribution rate by year, per-share value. */
export function ScpiAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const md = useMemo(() => parseScpiMetadata(p.asset.metadata), [p.asset.metadata]);
  const a = useMemo(() => scpiAnalysis({ metadata: md, shares: p.asset.quantity, currentValue: p.asset.current_value, history, today: p.today }), [md, p.asset.quantity, p.asset.current_value, history, p.today]);

  return (
    <AnalysisStack testId="analysis-scpi">
      <ScpiIndicatorsSlot p={p} />

      <AnalysisCard title={at("an_scpi_value")} description={at("an_scpi_value_desc")} testId="an-scpi-value">
        {!(a.invested > 0) ? (
          <EmptyNote missing={at("an_scpi_price_missing")} how={at("an_scpi_price_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_scpi_invested")} value={f.money(a.invested)} hint={at("an_scpi_fees", { amount: f.money(a.entryFees) })} />
              <Stat label={at("an_current_value")} money={a.value} currency={p.asset.currency} />
              <Stat label={at("an_scpi_gap")} value={f.money(a.valueVsInvested)} tone={toneOf(a.valueVsInvested)} hint={f.pct(a.valueVsInvestedPct, 1, true)} testId="an-scpi-gap" />
              <Stat label={at("an_scpi_withdrawal_gap")} value={f.pct(a.withdrawalGapPct, 1, true)} tone={toneOf(a.withdrawalGapPct)} hint={a.withdrawalPrice != null && a.subscriptionPrice != null ? at("an_scpi_prices", { sub: f.money2(a.subscriptionPrice), wd: f.money2(a.withdrawalPrice) }) : at("an_scpi_withdrawal_missing")} />
            </StatGrid>
            <InfoNote />
          </>
        )}
      </AnalysisCard>

      <AnalysisCard title={at("an_scpi_distribution")} description={at("an_scpi_distribution_desc")} testId="an-scpi-years">
        {a.years.length === 0 ? (
          <EmptyNote missing={at("an_scpi_dividends_missing")} how={at("an_scpi_dividends_how")} />
        ) : (
          <>
            <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <Stat label={at("an_scpi_received")} value={f.money(a.totalReceived)} />
              <Stat label={at("an_scpi_total_return")} value={f.pct(a.totalReturnPct, 1, true)} tone={toneOf(a.totalReturnPct)} hint={at("an_scpi_total_return_hint")} />
              <MinTier min="professional">
                <PositionStats p={p} />
              </MinTier>
            </StatGrid>
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-normal">{at("an_year")}</th>
                    <th className="p-2 text-end font-normal">{at("an_scpi_received")}</th>
                    <th className="p-2 text-end font-normal">{at("an_scpi_realised_rate")}</th>
                    <th className="p-2 text-end font-normal">{at("an_scpi_stated_rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.years.map((y) => (
                    <tr key={y.year} className="border-b border-border last:border-0">
                      <td className="p-2 text-start tabular-nums">
                        {y.year}
                        {y.partial && <span className="ms-1 text-xs text-muted-foreground">{at("an_scpi_partial")}</span>}
                      </td>
                      <td className="p-2 text-end tabular-nums">{f.money(y.received)}</td>
                      <td className="p-2 text-end tabular-nums">{f.pct(y.realisedRate, 2)}</td>
                      <td className="p-2 text-end tabular-nums">{f.pct(y.statedRate, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_scpi_share_history")} testId="an-scpi-share-history">
          {a.perShareHistory.length < 2 ? (
            <EmptyNote missing={at("an_scpi_share_missing")} how={at("an_scpi_share_how")} />
          ) : (
            <AnalysisChart rows={a.perShareHistory.map((h) => ({ date: h.date, share: h.value }))} series={[{ key: "share", name: at("an_scpi_share_line"), step: true, dots: true }]} currency={p.asset.currency} label={at("an_scpi_share_history")} />
          )}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

"use client";

import { useMemo } from "react";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { cryptoAnalysis } from "@/lib/asset-analysis/crypto";
import { parseCryptoMetadata } from "@/lib/crypto";
import { PositionStats, ValueHistoryCard } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Crypto: value against the first record, drawdown and volatility from the history. No purchase price is stored. */
export function CryptoAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const a = useMemo(
    () => cryptoAnalysis({ quantity: p.asset.quantity, currentValue: p.asset.current_value, metadata: parseCryptoMetadata(p.asset.metadata), history, purchaseDate: p.asset.purchase_date, today: p.today }),
    [p.asset.quantity, p.asset.current_value, p.asset.metadata, p.asset.purchase_date, history, p.today],
  );

  return (
    <AnalysisStack testId="analysis-crypto">
      <AnalysisCard title={at("an_crypto_value_cost")} description={at("an_crypto_value_cost_desc")} testId="an-crypto-pl">
        <StatGrid>
          <Stat label={at("an_current_value")} money={p.asset.current_value} currency={p.asset.currency} />
          <Stat label={at("an_crypto_unit_price")} value={f.money2(a.unitPrice)} hint={at("an_crypto_units", { n: f.num(p.asset.quantity, 6) })} />
          <Stat label={at("an_crypto_cost_basis")} value={undefined} hint={at("an_crypto_cost_missing")} testId="an-crypto-cost" />
          <Stat label={at("an_change_first")} value={f.money(a.sinceFirstRecord?.amount)} tone={toneOf(a.sinceFirstRecord?.amount)} hint={a.sinceFirstRecord?.pct != null ? f.pct(a.sinceFirstRecord.pct, 1, true) : at("an_needs_history")} />
        </StatGrid>
        {a.sinceFirstRecord == null && <EmptyNote missing={at("an_empty_history_missing")} how={at("an_empty_history_how")} />}
        {history.length >= 2 && (
          <AnalysisChart rows={history.map((h) => ({ date: h.date, value: h.value }))} series={[{ key: "value", name: at("an_current_value") }]} currency={p.asset.currency} label={at("an_crypto_value_cost")} />
        )}
        <InfoNote />
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_crypto_risk")} testId="an-crypto-risk">
          <StatGrid>
            <Stat label={at("an_max_drawdown")} value={f.pct(a.drawdown?.pct, 1)} tone={a.drawdown && a.drawdown.pct < 0 ? "negative" : "neutral"} hint={a.drawdown ? `${f.date(a.drawdown.peak.date)} – ${f.date(a.drawdown.trough.date)}` : at("an_needs_history")} />
            <Stat label={at("an_drawdown_now")} value={f.pct(a.drawdown?.current, 1)} />
            <Stat label={at("an_volatility")} value={f.pct(a.volatility, 1)} hint={a.volatility == null ? at("an_needs_history") : at("an_volatility_hint")} />
            <Stat label={at("an_crypto_held")} value={a.daysHeld != null ? at("an_days", { n: a.daysHeld }) : undefined} />
            <Stat label={at("an_high")} value={f.money(a.high?.value)} hint={f.date(a.high?.date)} />
            <Stat label={at("an_low")} value={f.money(a.low?.value)} hint={f.date(a.low?.date)} />
            <PositionStats p={p} />
          </StatGrid>
        </AnalysisCard>
        {history.length < 2 && <ValueHistoryCard p={p} />}
      </MinTier>
    </AnalysisStack>
  );
}

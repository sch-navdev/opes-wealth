"use client";

import { useMemo } from "react";
import { companyAnalysis } from "@/lib/asset-analysis/company";
import { parseCompanyMetadata } from "@/lib/companies";
import { convertAmount } from "@/lib/fx";
import { ProgressBar } from "@/components/asset-detail/shared";
import { PositionStats, ValueHistoryCard } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Companies: valuation history, ownership, linked bank accounts. Dividends are not tracked for companies yet. */
export function CompanyAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseCompanyMetadata(p.asset.metadata), [p.asset.metadata]);
  const history = useMemo(() => p.history.map((h) => ({ date: h.recorded_date, value: Number(h.value) })), [p.history]);
  // Linked accounts arrive in the portfolio currency: show them in the company's own currency.
  const linked = useMemo(() => {
    const list = p.portfolio?.linkedAccounts;
    if (!list || !p.portfolio) return null;
    return list.map((a) => ({ value: convertAmount(a.value, p.portfolio!.currency, p.asset.currency, p.ratesFromUsd) }));
  }, [p.portfolio, p.asset.currency, p.ratesFromUsd]);
  const a = useMemo(() => companyAnalysis({ metadata: md, history, today: p.today, linkedAccounts: linked }), [md, history, p.today, linked]);

  return (
    <AnalysisStack testId="analysis-company">
      <AnalysisCard title={at("an_co_stake")} description={at("an_co_stake_desc")} testId="an-co-stake">
        {a.ownership == null && a.companyValue == null ? (
          <EmptyNote missing={at("an_co_stake_missing")} how={at("an_co_stake_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_co_ownership")} value={f.pct(a.ownership, 1)} hint={a.ownership == null ? at("an_co_ownership_missing") : undefined} testId="an-co-ownership" />
              <Stat label={at("an_co_value")} value={f.money(a.companyValue)} hint={a.valuationMethod || undefined} />
              <Stat label={at("an_co_stake_value")} money={a.stakeValue} currency={p.asset.currency} value={f.money(a.stakeValue)} />
              <Stat label={at("an_co_valuation_date")} value={f.date(a.valuationDate)} hint={a.valuationAgeDays != null ? at("an_co_age", { n: a.valuationAgeDays }) : at("an_co_date_missing")} tone={a.valuationAgeDays != null && a.valuationAgeDays > 365 ? "negative" : "neutral"} />
            </StatGrid>
            {a.ownership != null && <ProgressBar percent={a.ownership * 100} colorClassName="bg-primary" />}
            <InfoNote />
          </>
        )}
      </AnalysisCard>

      <ValueHistoryCard p={p} title={at("an_co_valuation_history")} />

      <MinTier min="professional">
        <AnalysisCard title={at("an_co_more")} testId="an-co-more">
          <StatGrid>
            <Stat label={at("an_co_change")} value={f.money(a.change?.amount)} tone={toneOf(a.change?.amount)} hint={a.change?.pct != null ? f.pct(a.change.pct, 1, true) : at("an_needs_history")} />
            <Stat label={at("an_co_held_assets")} value={String(a.heldAssets)} />
            <Stat
              label={at("an_co_accounts")}
              value={a.linkedAccounts ? String(a.linkedAccounts.count) : undefined}
              hint={a.linkedAccounts ? at("an_co_accounts_total", { amount: f.money(a.linkedAccounts.total) }) : at("an_co_accounts_missing")}
              testId="an-co-accounts"
            />
            <Stat label={at("an_co_dividends")} value={undefined} hint={at("an_co_dividends_missing")} />
            <PositionStats p={p} />
          </StatGrid>
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

"use client";

import { useMemo } from "react";
import { AllocationBar } from "@/components/assurance-vie-cards";
import { ProgressBar } from "@/components/asset-detail/shared";
import { assuranceVieAnalysis } from "@/lib/asset-analysis/assurance-vie";
import { ASSURANCE_VIE_CONFIG, parseAssuranceVieMetadata } from "@/lib/assurance-vie";
import { ValueHistoryCard } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/**
 * Assurance-Vie: premiums against value and the milestone timeline. The contract cards of the Overview tab
 * (allocation split, milestone status, beneficiaries) are reused, not repeated: only a compact allocation bar is shown here.
 */
export function AssuranceVieAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseAssuranceVieMetadata(p.asset.metadata), [p.asset.metadata]);
  const a = useMemo(() => assuranceVieAnalysis({ metadata: md, value: p.asset.current_value, today: p.today }), [md, p.asset.current_value, p.today]);
  const t = a.timeline;

  return (
    <AnalysisStack testId="analysis-assurance-vie">
      <AnalysisCard title={at("an_av_premiums")} description={at("an_av_premiums_desc")} testId="an-av-premiums">
        {a.premiumsPaid == null ? (
          <EmptyNote missing={at("an_av_premiums_missing")} how={at("an_av_premiums_how")} />
        ) : (
          <StatGrid>
            <Stat label={at("an_av_paid")} value={f.money(a.premiumsPaid)} />
            <Stat label={at("an_current_value")} money={a.value} currency={p.asset.currency} />
            <Stat label={at("an_av_difference")} value={f.money(a.difference)} tone={toneOf(a.difference)} hint={f.pct(a.differencePct, 1, true)} testId="an-av-difference" />
            <Stat label={at("an_av_scheduled")} value={f.money(a.scheduledAnnual)} hint={a.scheduledAnnual == null ? at("an_av_scheduled_missing") : at("an_av_scheduled_hint")} />
          </StatGrid>
        )}
        <InfoNote />
      </AnalysisCard>

      <AnalysisCard title={at("an_av_timeline", { years: ASSURANCE_VIE_CONFIG.milestoneYears })} testId="an-av-timeline">
        {!t ? (
          <EmptyNote missing={at("an_av_opened_missing")} how={at("an_av_opened_how")} />
        ) : (
          <div className="space-y-2">
            <ProgressBar percent={t.elapsed * 100} colorClassName={t.reached ? "bg-success" : "bg-primary"} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{at("an_av_opened", { date: f.date(t.opened) })}</span>
              <span>{at("an_av_target", { date: f.date(t.target) })}</span>
            </div>
            <p className="text-sm text-foreground" data-testid="an-av-status">
              {t.reached ? at("an_av_reached", { n: t.daysSince ?? 0 }) : at("an_av_remaining", { n: t.daysRemaining ?? 0, pct: f.pct(t.elapsed, 0) })}
            </p>
          </div>
        )}
      </AnalysisCard>

      <MinTier min="professional">
        <ValueHistoryCard p={p} />
        <AnalysisCard title={at("an_av_allocation")} testId="an-av-allocation">
          <AllocationBar euroPct={a.statedAllocation.euro} ucPct={a.statedAllocation.uc} />
          <p className="text-xs text-muted-foreground">{a.holdings.length > 0 ? at("an_av_holdings_note", { n: a.holdings.length }) : at("an_av_holdings_missing")}</p>
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

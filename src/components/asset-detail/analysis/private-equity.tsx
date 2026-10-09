"use client";

import { useMemo } from "react";
import { privateEquityAnalysis } from "@/lib/asset-analysis/private-equity";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import { ProgressBar } from "@/components/asset-detail/shared";
import { PositionStats } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Private equity: J-curve of actual net cash flow, DPI / RVPI / TVPI / net IRR, and the unfunded commitment timeline. */
export function PrivateEquityAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parsePrivateEquityMetadata(p.asset.metadata), [p.asset.metadata]);
  const a = useMemo(() => privateEquityAnalysis(md, p.asset.current_value, p.today), [md, p.asset.current_value, p.today]);
  const l = a.ledger;
  const noPaid = !(l.paidIn > 0);

  return (
    <AnalysisStack testId="analysis-private-equity">
      <AnalysisCard title={at("an_pe_multiples")} description={at("an_pe_multiples_desc")} testId="an-pe-multiples">
        {noPaid ? (
          <EmptyNote missing={at("an_pe_paid_missing")} how={at("an_pe_paid_how")} />
        ) : (
          <StatGrid>
            <Stat label="DPI" value={f.multiple(l.dpi)} hint={at("an_pe_dpi_hint")} testId="an-pe-dpi" />
            <Stat label="RVPI" value={f.multiple(l.rvpi)} hint={at("an_pe_rvpi_hint")} />
            <Stat label="TVPI" value={f.multiple(l.tvpi)} hint={at("an_pe_tvpi_hint")} />
            <Stat label={at("an_pe_irr")} value={f.pct(l.netIrr, 1, true)} tone={toneOf(l.netIrr)} hint={l.netIrrGap ? at(`an_pe_irr_${l.netIrrGap}` as "an_pe_irr_undated_flows") : at("an_pe_irr_hint")} testId="an-pe-irr" />
          </StatGrid>
        )}
        <InfoNote />
      </AnalysisCard>

      <AnalysisCard title={at("an_pe_jcurve")} description={at("an_pe_jcurve_desc")} testId="an-pe-jcurve">
        {a.jCurve.length < 2 ? (
          <EmptyNote missing={at("an_pe_ledger_missing")} how={at("an_pe_ledger_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_pe_paid_in")} money={l.paidIn} currency={p.asset.currency} />
              <Stat label={at("an_pe_distributed")} value={f.money(l.distributed)} />
              <Stat label={at("an_pe_trough")} value={f.money(a.trough?.cumulative)} tone={toneOf(a.trough?.cumulative)} hint={f.date(a.trough?.date)} />
              <Stat label={at("an_pe_with_nav")} value={f.money(a.cumulativeWithNav)} tone={toneOf(a.cumulativeWithNav)} hint={at("an_pe_with_nav_hint")} />
            </StatGrid>
            <AnalysisChart
              rows={a.jCurve.map((j) => ({ date: j.date, cumulative: j.cumulative }))}
              series={[{ key: "cumulative", name: at("an_pe_cumulative"), step: true, dots: true }]}
              currency={p.asset.currency}
              zeroLine
              label={at("an_pe_jcurve")}
            />
          </>
        )}
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_pe_unfunded")} description={at("an_pe_unfunded_desc")} testId="an-pe-unfunded">
          {l.commitment == null && a.unfunded.length === 0 ? (
            <EmptyNote missing={at("an_pe_commitment_missing")} how={at("an_pe_commitment_how")} />
          ) : (
            <>
              <StatGrid>
                <Stat label={at("an_pe_commitment")} value={f.money(l.commitment)} />
                <Stat label={at("an_pe_unfunded_total")} value={f.money(l.unfunded)} />
                <Stat label={at("an_pe_called_share")} value={f.pct(a.calledShare, 0)} />
                <Stat label={at("an_pe_unscheduled")} value={f.money(a.unscheduled)} hint={at("an_pe_unscheduled_hint")} />
                <PositionStats p={p} />
              </StatGrid>
              {a.calledShare != null && <ProgressBar percent={a.calledShare * 100} colorClassName="bg-primary" />}
              {a.unfunded.length === 0 ? (
                <p className="text-xs text-muted-foreground">{at("an_pe_no_pending")}</p>
              ) : (
                <ul className="divide-y divide-border border border-border text-sm">
                  {a.unfunded.map((u) => (
                    <li key={u.callId} className="flex flex-wrap items-center justify-between gap-2 p-2">
                      <span className="tabular-nums text-foreground">{f.date(u.date)}</span>
                      {u.overdue && <span className="text-xs text-destructive">{at("an_pe_overdue")}</span>}
                      <span className="tabular-nums text-foreground">{f.money(u.amount)}</span>
                      <span className="text-xs text-muted-foreground">{at("an_pe_left_after", { amount: f.money(u.remainingAfter) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

"use client";

import { useMemo } from "react";
import { PartitionBar } from "@/components/partition-bar";
import { ProgressBar } from "@/components/asset-detail/shared";
import { historyToSeries } from "@/lib/asset-analysis/common";
import { liabilityAnalysis } from "@/lib/asset-analysis/liability";
import { parseLiabilityMetadata } from "@/lib/liability";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

const GAP_KEY = {
  no_payment: "an_li_gap_no_payment",
  no_rate: "an_li_gap_no_rate",
  never_amortises: "an_li_gap_never",
  no_balance: "an_li_gap_no_balance",
} as const;

/** Liabilities (loans, cards): remaining schedule, interest, payoff date and the share of payments that is interest. */
export function LiabilityAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseLiabilityMetadata(p.asset.metadata), [p.asset.metadata]);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const a = useMemo(() => liabilityAnalysis({ metadata: md, balance: p.asset.current_value, history, today: p.today }), [md, p.asset.current_value, history, p.today]);
  const isCard = md.liability_type === "credit_card";
  const yearly = useMemo(() => a.schedule.filter((r, i) => i === 0 || r.n % 12 === 0 || i === a.schedule.length - 1), [a.schedule]);

  return (
    <AnalysisStack testId="analysis-liability">
      <AnalysisCard title={at("an_li_payoff")} description={at("an_li_payoff_desc")} testId="an-li-payoff">
        <StatGrid>
          <Stat label={at("an_li_balance")} value={f.money(a.balance)} hint={md.lender_name || undefined} />
          <Stat label={at("an_li_months_left")} value={a.monthsLeft != null ? String(a.monthsLeft) : undefined} hint={a.gap ? at(GAP_KEY[a.gap]) : undefined} testId="an-li-months" />
          <Stat label={at("an_li_payoff_date")} value={f.date(a.payoffDate)} />
          <Stat label={at("an_li_interest_left")} value={f.money(a.interestRemaining)} tone={a.interestRemaining ? "negative" : "neutral"} />
        </StatGrid>
        {a.gap && a.schedule.length === 0 && <EmptyNote missing={at(GAP_KEY[a.gap])} how={at("an_li_how")} />}
        {a.utilisation != null && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{at("an_li_utilisation", { pct: f.pct(a.utilisation, 0) })}</p>
            <ProgressBar percent={a.utilisation * 100} colorClassName={a.utilisation > 0.7 ? "bg-destructive" : "bg-primary"} />
          </div>
        )}
        <InfoNote />
      </AnalysisCard>

      {!isCard || a.schedule.length > 0 ? (
        <AnalysisCard title={at("an_li_schedule")} description={at("an_li_schedule_desc")} testId="an-li-schedule">
          {a.schedule.length === 0 ? (
            <EmptyNote missing={at("an_li_schedule_missing")} how={at("an_li_how")} />
          ) : (
            <>
              <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
                <Stat label={at("an_li_interest_share")} value={f.pct(a.interestShare, 1)} hint={at("an_li_interest_share_hint")} testId="an-li-share" />
                <Stat label={at("an_li_interest_next")} value={f.pct(a.interestShareNext, 1)} hint={at("an_li_interest_next_hint")} />
                <Stat label={at("an_li_paid_estimate")} value={f.money(a.interestPaidEstimate)} hint={a.interestPaidEstimate == null ? at("an_li_paid_missing") : at("an_li_paid_hint")} />
              </StatGrid>
              <PartitionBar
                segments={[
                  { key: "p", share: a.balance, color: "var(--color-chart-2)" },
                  { key: "i", share: a.interestRemaining ?? 0, color: "var(--color-destructive)" },
                ]}
              />
              <AnalysisChart rows={a.schedule.map((r) => ({ date: r.date, balance: r.balance }))} series={[{ key: "balance", name: at("an_li_balance_line") }]} currency={p.asset.currency} heightClassName="h-44" label={at("an_li_schedule")} />
              <MinTier min="professional">
                <div className="max-h-64 overflow-auto border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="p-2 text-start font-normal">#</th>
                        <th className="p-2 text-start font-normal">{at("an_date")}</th>
                        <th className="p-2 text-end font-normal">{at("an_li_col_payment")}</th>
                        <th className="p-2 text-end font-normal">{at("an_li_col_interest")}</th>
                        <th className="p-2 text-end font-normal">{at("an_li_col_principal")}</th>
                        <th className="p-2 text-end font-normal">{at("an_li_col_balance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearly.map((r) => (
                        <tr key={r.n} className="border-b border-border last:border-0">
                          <td className="p-2 text-start tabular-nums">{r.n}</td>
                          <td className="p-2 text-start tabular-nums">{f.date(r.date)}</td>
                          <td className="p-2 text-end tabular-nums">{f.money(r.payment)}</td>
                          <td className="p-2 text-end tabular-nums">{f.money(r.interest)}</td>
                          <td className="p-2 text-end tabular-nums">{f.money(r.principal)}</td>
                          <td className="p-2 text-end tabular-nums">{f.money(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MinTier>
            </>
          )}
        </AnalysisCard>
      ) : null}

      <AnalysisCard title={at("an_li_history")} testId="an-li-history">
        {history.length < 2 ? (
          <EmptyNote missing={at("an_empty_history_missing")} how={at("an_empty_history_how")} />
        ) : (
          <>
            <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <Stat label={at("an_li_repaid")} value={f.money(a.balanceChange ? -a.balanceChange.amount : null)} tone={a.balanceChange ? toneOf(-a.balanceChange.amount) : "neutral"} hint={at("an_li_repaid_hint", { date: f.date(a.balanceChange?.from.date) })} />
            </StatGrid>
            <AnalysisChart rows={history.map((h) => ({ date: h.date, balance: h.value }))} series={[{ key: "balance", name: at("an_li_balance_line") }]} currency={p.asset.currency} heightClassName="h-44" label={at("an_li_history")} />
          </>
        )}
      </AnalysisCard>
    </AnalysisStack>
  );
}

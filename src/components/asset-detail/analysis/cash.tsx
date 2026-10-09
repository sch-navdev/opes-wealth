"use client";

import { useMemo } from "react";
import { changeOver, historyToSeries } from "@/lib/asset-analysis/common";
import { cashRunway, monthlyFlows, statementInfo, toCashTxs, topSpend } from "@/lib/asset-analysis/cash";
import { ProgressBar } from "@/components/asset-detail/shared";
import { ValueHistoryCard } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Cash / bank account: balance history, monthly flows from imported transactions, top spending, runway, statement date. */
export function CashAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const history = useMemo(() => historyToSeries(p.history), [p.history]);
  const txs = useMemo(() => toCashTxs(p.transactions), [p.transactions]);
  const flows = useMemo(() => monthlyFlows(txs, 12), [txs]);
  const spend = useMemo(() => topSpend(txs, 6), [txs]);
  const runway = useMemo(() => cashRunway(p.asset.current_value, txs, p.today, 3), [p.asset.current_value, txs, p.today]);
  const info = useMemo(() => statementInfo(txs, history, p.today), [txs, history, p.today]);
  const change = changeOver(history);

  const recent = flows.slice(-3);
  const avg = (pick: (m: (typeof flows)[number]) => number) => (recent.length > 0 ? recent.reduce((s, m) => s + pick(m), 0) / recent.length : null);

  return (
    <AnalysisStack testId="analysis-cash">
      <ValueHistoryCard p={p} title={at("an_cash_balance_history")} />

      <AnalysisCard title={at("an_cash_flows")} description={txs.length > 0 ? at("an_cash_flows_scope", { n: txs.length }) : undefined} testId="an-cash-flows">
        {flows.length === 0 ? (
          <EmptyNote missing={at("an_cash_flows_missing")} how={at("an_cash_flows_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_cash_avg_in")} value={f.money(avg((m) => m.inflow))} hint={at("an_cash_avg_hint", { n: recent.length })} />
              <Stat label={at("an_cash_avg_out")} value={f.money(avg((m) => m.outflow))} />
              <Stat label={at("an_cash_avg_net")} value={f.money(avg((m) => m.net))} tone={toneOf(avg((m) => m.net))} />
              <Stat
                label={at("an_cash_runway")}
                value={runway ? at("an_cash_runway_months", { n: f.num(runway.months, 1) }) : undefined}
                hint={runway ? at("an_cash_runway_hint", { n: runway.monthsUsed }) : at("an_cash_runway_missing")}
                testId="an-cash-runway"
              />
            </StatGrid>
            <AnalysisChart
              rows={flows.map((m) => ({ date: `${m.month}-01`, inflow: m.inflow, outflow: m.outflow, net: m.net }))}
              series={[
                { key: "inflow", name: at("an_cash_inflow"), color: "var(--color-success)" },
                { key: "outflow", name: at("an_cash_outflow"), color: "var(--color-destructive)" },
                { key: "net", name: at("an_cash_net"), color: "var(--color-primary)", dash: "6 4" },
              ]}
              currency={p.asset.currency}
              zeroLine
              label={at("an_cash_flows")}
            />
          </>
        )}
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_cash_top_spend")} description={at("an_cash_top_spend_desc")} testId="an-cash-spend">
          {!spend ? (
            <EmptyNote missing={at("an_cash_spend_missing")} how={at("an_cash_flows_how")} />
          ) : (
            <>
              <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
                <Stat label={at("an_cash_spend_total")} value={f.money(spend.total)} />
                <Stat label={at("an_cash_essential")} value={f.money(spend.essential)} hint={f.pct(spend.essential / spend.total, 0)} />
                <Stat label={at("an_cash_discretionary")} value={f.money(spend.discretionary)} hint={f.pct(spend.discretionary / spend.total, 0)} />
              </StatGrid>
              <ul className="divide-y divide-border border border-border text-sm">
                {spend.rows.map((r) => (
                  <li key={r.key || "rest"} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-2">
                    <span className="min-w-0 truncate text-foreground">{r.key || at("an_cash_other")}</span>
                    <span className="text-end tabular-nums text-foreground">{f.money(r.total)}</span>
                    <span className="flex items-center gap-2">
                      <span className="w-24 shrink-0">
                        <ProgressBar percent={r.share * 100} colorClassName={r.class === "essential" ? "bg-primary" : "bg-muted-foreground"} />
                      </span>
                      <span className="text-xs text-muted-foreground">{r.class === "essential" ? at("an_cash_essential") : at("an_cash_discretionary")}</span>
                    </span>
                    <span className="text-end text-xs tabular-nums text-muted-foreground">{f.pct(r.share, 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </AnalysisCard>

        <AnalysisCard title={at("an_cash_statement")} testId="an-cash-statement">
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <Stat label={at("an_cash_last_tx")} value={f.date(info.lastTransaction)} hint={info.lastTransaction == null ? at("an_cash_last_tx_missing") : undefined} />
            <Stat label={at("an_cash_balance_asof")} value={f.date(info.balanceAsOf)} />
            <Stat label={at("an_cash_age")} value={info.ageDays != null ? at("an_days", { n: info.ageDays }) : undefined} tone={info.ageDays != null && info.ageDays > 31 ? "negative" : "neutral"} hint={info.ageDays != null && info.ageDays > 31 ? at("an_cash_stale") : undefined} />
          </StatGrid>
          {change && <p className="text-xs text-muted-foreground">{at("an_cash_balance_note", { from: f.date(change.from.date) })}</p>}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

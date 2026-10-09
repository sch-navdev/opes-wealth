"use client";

import { useMemo } from "react";
import { startupAnalysis } from "@/lib/asset-analysis/startup";
import { parseStartupMetadata } from "@/lib/startups";
import { PositionStats } from "./common-cards";
import { useAnalysisText } from "./text";
import { AnalysisCard, AnalysisChart, AnalysisStack, EmptyNote, InfoNote, MinTier, Stat, StatGrid, toneOf, useAnalysisFormat } from "./ui";
import type { AssetAnalysisProps } from "./types";

/** Startups: round history, price step-ups, multiple on cost, ownership and dilution where post-money valuations exist. */
export function StartupAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  const f = useAnalysisFormat(p.asset.currency);
  const md = useMemo(() => parseStartupMetadata(p.asset.metadata), [p.asset.metadata]);
  const a = useMemo(() => startupAnalysis(md, p.asset.quantity), [md, p.asset.quantity]);

  return (
    <AnalysisStack testId="analysis-startup">
      <AnalysisCard title={at("an_su_rounds")} description={at("an_su_rounds_desc")} testId="an-su-rounds">
        {a.rounds.length === 0 ? (
          <EmptyNote missing={at("an_su_rounds_missing")} how={at("an_su_rounds_how")} />
        ) : (
          <>
            <StatGrid>
              <Stat label={at("an_su_cost")} value={f.money(a.costBasis)} hint={a.costBasis > 0 ? undefined : at("an_su_cost_missing")} />
              <Stat label={at("an_current_value")} money={a.value} currency={p.asset.currency} />
              <Stat label={at("an_su_multiple")} value={f.multiple(a.multiple)} tone={a.multiple != null ? toneOf(a.multiple - 1) : "neutral"} hint={at("an_su_multiple_hint")} testId="an-su-multiple" />
              <Stat label={at("an_su_post_money")} value={f.money(a.latestPostMoney)} hint={a.latestPostMoney == null ? at("an_su_post_missing") : undefined} />
            </StatGrid>
            {a.rounds.length >= 1 && (
              <AnalysisChart
                rows={a.rounds.map((r) => ({ date: r.date, price: r.pricePerShare }))}
                series={[{ key: "price", name: at("an_su_price_line"), step: true, dots: true }]}
                currency={p.asset.currency}
                heightClassName="h-44"
                label={at("an_su_rounds")}
              />
            )}
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-normal">{at("an_su_round")}</th>
                    <th className="p-2 text-end font-normal">{at("an_su_price")}</th>
                    <th className="p-2 text-end font-normal">{at("an_su_step_up")}</th>
                    <th className="p-2 text-end font-normal">{at("an_su_post_money")}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.rounds.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="p-2 text-start">
                        {r.name} <span className="text-xs text-muted-foreground">{f.date(r.date)}</span>
                      </td>
                      <td className="p-2 text-end tabular-nums">{f.money2(r.pricePerShare)}</td>
                      <td className="p-2 text-end tabular-nums">{f.multiple(r.stepUp)}</td>
                      <td className="p-2 text-end tabular-nums">{f.money(r.postMoney)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InfoNote />
          </>
        )}
      </AnalysisCard>

      <MinTier min="professional">
        <AnalysisCard title={at("an_su_dilution")} description={at("an_su_dilution_desc")} testId="an-su-dilution">
          {a.dilution == null ? (
            <EmptyNote missing={at("an_su_dilution_missing")} how={at("an_su_dilution_how")} />
          ) : (
            <StatGrid>
              <Stat label={at("an_su_own_first")} value={f.pct(a.rounds.find((r) => r.ownership != null)?.ownership, 4)} />
              <Stat label={at("an_su_own_last")} value={f.pct([...a.rounds].reverse().find((r) => r.ownership != null)?.ownership, 4)} />
              <Stat label={at("an_su_dilution_change")} value={f.pct(a.dilution, 1, true)} tone={toneOf(a.dilution)} />
              <PositionStats p={p} />
            </StatGrid>
          )}
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}

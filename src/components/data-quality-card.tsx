"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, ListChecks, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { describeIssue, issueHref, KIND_LABEL_KEYS, SEVERITY_LABEL_KEYS } from "@/components/data-quality-text";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import { DATA_QUALITY_SEVERITIES, type DataQualityIssue, type DataQualityReport } from "@/lib/data-quality";
import { cn } from "@/lib/utils";

export const DATA_QUALITY_CARD_LIMIT = 3;

export const SEVERITY_BADGE_CLASS = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-primary/40 bg-primary/10 text-foreground",
  low: "border-border bg-muted text-muted-foreground",
} as const;

/** Formats a money amount in its own currency, routed through Privacy Mode. */
export function useIssueText() {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatMoney = (amount: number, currency: string) => {
    let text: string;
    try {
      text = new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      text = `${amount.toFixed(2)} ${currency}`;
    }
    return maskValue(text);
  };
  return (issue: DataQualityIssue) => {
    const { explainKey, explainVars, hintKey } = describeIssue(issue, formatMoney);
    return { explanation: t(explainKey, explainVars), hint: t(hintKey), kind: t(KIND_LABEL_KEYS[issue.kind]) };
  };
}

/**
 * Dashboard block: a calm status line and the few most important data quality findings, with a
 * link to the full list. Reporting only: it never edits data and never advises.
 */
export function DataQualityCard({ report }: { report: DataQualityReport }) {
  const { t } = useLanguage();
  const motion = useTierMotion();
  const text = useIssueText();
  const { issues, counts } = report;
  const top = issues.slice(0, DATA_QUALITY_CARD_LIMIT);
  const rest = issues.length - top.length;
  const clean = counts.total === 0;

  return (
    <section aria-label={t("dq_title")} data-testid="data-quality-card">
      <Card
        className="animate-in fade-in slide-in-from-bottom-2 border-border bg-card motion-reduce:animate-none"
        style={tileEntranceStyle(motion, 0)}
      >
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {t("dq_title")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("dq_card_subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground" role="status">
              {clean ? (
                <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <TriangleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              {clean
                ? t("dq_all_passed")
                : counts.total === 1
                  ? t("dq_needs_attention_one")
                  : t("dq_needs_attention", { count: counts.total })}
            </p>
            {!clean && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("dq_by_severity")}>
                {DATA_QUALITY_SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                  <li key={s}>
                    <Badge variant="outline" className={SEVERITY_BADGE_CLASS[s]} data-testid={`dq-count-${s}`}>
                      {t(SEVERITY_LABEL_KEYS[s])} · {counts[s]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {top.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {top.map((issue) => {
                const { explanation, kind } = text(issue);
                return (
                  <li key={issue.id} className="py-2.5">
                    <Link
                      href={issueHref(issue)}
                      className="group flex items-start justify-between gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {issue.assetName ?? kind}
                          {issue.assetName && <span className="ms-2 text-xs font-normal text-muted-foreground">{kind}</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{explanation}</span>
                      </span>
                      <ArrowRight
                        className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground rtl:rotate-180", "transition-transform motion-reduce:transition-none")}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {rest > 0 ? <p className="text-xs text-muted-foreground">{t("dq_more", { count: rest })}</p> : <span />}
            <Link
              href="/dashboard/data-quality"
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("dq_see_all")}
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

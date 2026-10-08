"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SEVERITY_BADGE_CLASS, useIssueText } from "@/components/data-quality-card";
import { issueHref, KIND_LABEL_KEYS, SEVERITY_LABEL_KEYS } from "@/components/data-quality-text";
import { CATEGORY_NAME_KEYS } from "@/components/portfolio-groups";
import { useLanguage } from "@/context/language-context";
import {
  DATA_QUALITY_CONFIG,
  DATA_QUALITY_KINDS,
  DATA_QUALITY_SEVERITIES,
  type DataQualityIssue,
  type DataQualityKind,
  type DataQualityReport,
} from "@/lib/data-quality";
import { cn } from "@/lib/utils";

/**
 * The full data quality list: issues grouped by severity, filter chips by check, and per row the
 * asset, its category, what is wrong, how to fix it and a link to the asset. Reporting only.
 */
export function DataQualityList({ report }: { report: DataQualityReport }) {
  const { t } = useLanguage();
  const text = useIssueText();
  const [kind, setKind] = useState<DataQualityKind | null>(null);
  const { issues, counts } = report;

  const shown = kind ? issues.filter((i) => i.kind === kind) : issues;
  const kindsPresent = DATA_QUALITY_KINDS.filter((k) => (counts.byKind[k] ?? 0) > 0);
  const days = DATA_QUALITY_CONFIG.staleDays;

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  const categoryLabel = (name: string) => (CATEGORY_NAME_KEYS[name] ? t(CATEGORY_NAME_KEYS[name]) : name);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" data-testid="data-quality-list">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("dq_back_dashboard")}
        </Link>
        <h1 className="text-xl font-semibold text-foreground">{t("dq_title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dq_page_intro")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dq_page_thresholds", {
            market: days.Equities,
            cash: days.Cash,
            funds: days["Private Equity"],
            other: DATA_QUALITY_CONFIG.defaultStaleDays,
          })}
        </p>
      </div>

      {issues.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <CircleCheck className="size-6 text-success" aria-hidden="true" />
            <p className="text-base font-medium text-foreground">{t("dq_all_passed")}</p>
            <p className="text-sm text-muted-foreground">{t("dq_empty_desc")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div role="group" aria-label={t("dq_filter_label")} className="flex flex-wrap gap-2">
            <button type="button" className={chip(kind === null)} aria-pressed={kind === null} onClick={() => setKind(null)}>
              {t("ptable_filter_all")}
              <span className="tabular-nums">{counts.total}</span>
            </button>
            {kindsPresent.map((k) => (
              <button key={k} type="button" className={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {t(KIND_LABEL_KEYS[k])}
                <span className="tabular-nums">{counts.byKind[k]}</span>
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t("dq_showing", { shown: shown.length, total: counts.total })}
          </p>

          {DATA_QUALITY_SEVERITIES.map((severity) => {
            const group = shown.filter((i) => i.severity === severity);
            if (group.length === 0) return null;
            return (
              <section key={severity} aria-labelledby={`dq-sev-${severity}`} data-testid={`dq-group-${severity}`}>
                <h2 id={`dq-sev-${severity}`} className="mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
                  {t(SEVERITY_LABEL_KEYS[severity])}
                  <Badge variant="outline" className={SEVERITY_BADGE_CLASS[severity]}>
                    {group.length}
                  </Badge>
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {group.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} text={text} categoryLabel={categoryLabel} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  text,
  categoryLabel,
}: {
  issue: DataQualityIssue;
  text: ReturnType<typeof useIssueText>;
  categoryLabel: (name: string) => string;
}) {
  const { t } = useLanguage();
  const { explanation, hint, kind } = text(issue);
  return (
    <li className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
          <span className="break-words">{issue.assetName ?? t("dq_all_assets")}</span>
          {issue.category && <span className="text-xs font-normal text-muted-foreground">{categoryLabel(issue.category)}</span>}
          <Badge variant="outline" className="border-border text-muted-foreground">
            {kind}
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">{explanation}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("dq_how_to_fix")}</span> {hint}
        </p>
      </div>
      {issue.assetId && (
        <Link
          href={issueHref(issue)}
          aria-label={t("dq_open_asset_aria", { name: issue.assetName ?? "" })}
          className="shrink-0 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("dq_open_asset")}
        </Link>
      )}
    </li>
  );
}

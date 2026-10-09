"use client";

import { useLanguage } from "@/context/language-context";
import { useScpiText } from "@/components/scpi-text";
import { formatDecimal, type MoneyFormatter } from "@/lib/money-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  isIndicatorStale,
  parseScpiMetadata,
  scpiLatestIndicators,
  scpiQuarterRates,
  scpiRevalorisationSteps,
  scpiSaleVsPurchase,
  scpiTotalRevalorisationPct,
  scpiYearSummaries,
  type ScpiMetadata,
  type ScpiRatioReading,
} from "@/lib/scpi";
import type { Scpi2Key } from "@/lib/scpi-labels";

const READING_KEYS: Record<ScpiRatioReading, Scpi2Key> = {
  above: "scpi2_read_above",
  below: "scpi2_read_below",
  equal: "scpi2_read_equal",
};

function signed(n: number, locale: string, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${formatDecimal(n, locale, digits)}%`;
}

/**
 * The indicators block of an SCPI: latest VDRec / VDRea with their date, the two ratios with a
 * neutral reading, sale-minus-purchase, revalorisation history and the distribution summary.
 * Reused by the Overview card and by the Analysis tab slot. Read-only, no advice wording.
 */
export function ScpiIndicatorsPanel({
  metadata,
  shares,
  today,
  maskValue,
  currencyFormatter,
}: {
  metadata: ScpiMetadata;
  shares: number;
  today: string;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
}) {
  const { intlLocale } = useLanguage();
  const st = useScpiText();
  const money = (n: number | null) => (n == null ? "—" : maskValue(currencyFormatter.format(n)));
  const latest = scpiLatestIndicators(metadata);
  const stale = latest ? isIndicatorStale(latest.asOf, today) : false;
  const sale = scpiSaleVsPurchase(metadata, shares);
  const steps = scpiRevalorisationSteps(metadata);
  const totalReval = scpiTotalRevalorisationPct(metadata);
  const years = scpiYearSummaries(metadata, shares);
  const quarters = scpiQuarterRates(metadata, shares).slice(0, 8);

  return (
    <div className="space-y-5">
      {metadata.name_source === "manual" && (
        <p className="text-xs text-muted-foreground">{st("scpi2_unverified_note")}</p>
      )}

      {latest ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{st("scpi2_card_asof", { date: latest.asOf })}</span>
            {stale && <Badge variant="outline">{st("scpi2_stale")}</Badge>}
            {latest.sourceNote && <span>{st("scpi2_source", { note: latest.sourceNote })}</span>}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Figure label={st("scpi2_vdrec")} value={money(latest.vdrec)} />
            <Figure label={st("scpi2_vdrea")} value={money(latest.vdrea)} />
            <Figure label={st("scpi2_mds")} value={money(latest.mds)} />
            <Figure label={st("scpi2_pdr")} value={money(latest.pdr)} />
            <Figure
              label={st("scpi2_ratio_vdrec")}
              value={latest.vdrecRatioPct != null ? `${formatDecimal(latest.vdrecRatioPct, intlLocale, 1)}%` : "—"}
              note={latest.vdrecReading ? st(READING_KEYS[latest.vdrecReading]) : undefined}
            />
            <Figure
              label={st("scpi2_ratio_vdrea")}
              value={latest.vdreaRatioPct != null ? `${formatDecimal(latest.vdreaRatioPct, intlLocale, 1)}%` : "—"}
              note={latest.vdreaReading ? st(READING_KEYS[latest.vdreaReading]) : undefined}
            />
            {sale && (
              <>
                <Figure
                  label={`${st("scpi2_sale_vs_purchase")} (${st("scpi2_per_share")})`}
                  value={`${money(sale.perShare)} (${signed(sale.pct, intlLocale)})`}
                />
                <Figure label={`${st("scpi2_sale_vs_purchase")} (${st("scpi2_total")})`} value={money(sale.total)} />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{st("scpi2_read_note")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{st("scpi2_card_none")}</p>
          {sale && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Figure
                label={`${st("scpi2_sale_vs_purchase")} (${st("scpi2_per_share")})`}
                value={`${money(sale.perShare)} (${signed(sale.pct, intlLocale)})`}
              />
              <Figure label={`${st("scpi2_sale_vs_purchase")} (${st("scpi2_total")})`} value={money(sale.total)} />
            </div>
          )}
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{st("scpi2_reval_history")}</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {steps.map((s) => (
              <li key={s.id} className="tabular-nums">
                {s.date}: {money(s.price)}
                {s.changePct != null ? ` (${signed(s.changePct, intlLocale)})` : ""}
              </li>
            ))}
          </ul>
          {totalReval != null && (
            <p className="text-xs text-muted-foreground">
              {st("scpi2_reval_total")}: {signed(totalReval, intlLocale)}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{st("scpi2_dist_heading")}</p>
        {years.length === 0 ? (
          <p className="text-sm text-muted-foreground">{st("scpi2_dist_none")}</p>
        ) : (
          <ul className="space-y-1 text-xs text-foreground">
            {years.map((y) => (
              <li key={y.year} className="flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
                <span>{y.year}</span>
                <span>
                  {money(y.total)}
                  {y.ratePct != null ? ` · ${formatDecimal(y.ratePct, intlLocale, 2)}%` : ""}
                  {y.exceptionalTotal > 0 && y.ordinaryRatePct != null
                    ? ` (${st("scpi2_dist_ordinary")}: ${formatDecimal(y.ordinaryRatePct, intlLocale, 2)}%)`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {quarters.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{st("scpi2_dist_quarter_rate")}</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {quarters.map((q) => (
                <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
                  <span>
                    {q.quarter || q.date}
                    {q.exceptional ? ` (${st("scpi2_exceptional_flag")})` : ""}
                  </span>
                  <span>
                    {money(q.amount)}
                    {q.ratePct != null ? ` · ${formatDecimal(q.ratePct, intlLocale, 2)}%` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function ScpiOverviewCard({
  metadata: rawMetadata,
  shares,
  today,
  maskValue,
  currencyFormatter,
}: {
  metadata: unknown;
  shares: number;
  today: string;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
}) {
  const st = useScpiText();
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{st("scpi2_card_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScpiIndicatorsPanel
          metadata={parseScpiMetadata(rawMetadata)}
          shares={shares}
          today={today}
          maskValue={maskValue}
          currencyFormatter={currencyFormatter}
        />
      </CardContent>
    </Card>
  );
}

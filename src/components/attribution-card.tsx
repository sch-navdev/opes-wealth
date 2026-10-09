"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useId } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { formatPercent, RATIO_NA } from "@/lib/format-ratio";
import type { AssetAttributionView } from "@/lib/asset-attribution-view";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Rounds to cents so a value that displays as zero is neutral, not red/green. */
function sign(amount: number): -1 | 0 | 1 {
  const r = Math.round(amount * 100);
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

const TONE: Record<-1 | 0 | 1, string> = {
  1: "text-success",
  0: "text-foreground",
  [-1]: "text-destructive",
};

/**
 * FX-vs-capital performance attribution for one multi-currency holding (asset detail page).
 * Pure presentation: the figures come from `buildAttributionView` (already scaled to the viewer's share).
 * Renders nothing when there is no attribution (same-currency or unsupported asset).
 */
export function AttributionCard({
  attribution,
  className,
}: {
  attribution: AssetAttributionView | null | undefined;
  className?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const barId = useId();
  if (!attribution) return null;

  const title = (
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{t("attr_title")}</CardTitle>
    </CardHeader>
  );

  if (attribution.status === "unavailable") {
    return (
      <Card className={cn("border-border bg-card", className)} aria-label={t("attr_title")}>
        {title}
        <CardContent>
          <p className="text-sm text-muted-foreground">{t(`attr_na_${attribution.reason}` as TranslationKey)}</p>
        </CardContent>
      </Card>
    );
  }

  const { result, base, currency, rates } = attribution;
  const moneyFmt = moneyFormatter(intlLocale, base, { signDisplay: "exceptZero" });
  const rateFmt = new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: 5 });
  const money = (n: number) => maskValue(moneyFmt.format(n));
  const pct = (p: number | null) => {
    if (p == null) return RATIO_NA;
    const text = formatPercent(p, intlLocale);
    return maskValue(Math.round(p * 1000) > 0 ? `+${text}` : text);
  };

  const tiles = [
    {
      id: "capital",
      label: t("attr_capital"),
      info: t("attr_capital_info", { currency }),
      amount: result.capitalBase,
      pct: result.capitalPct,
      color: "var(--chart-1)",
    },
    {
      id: "currency",
      label: t("attr_currency"),
      info: t("attr_currency_info", { currency, base }),
      amount: result.currencyBase,
      pct: result.currencyPct,
      color: "var(--chart-3)",
    },
    {
      id: "total",
      label: t("attr_total"),
      info: t("attr_total_info", { base }),
      amount: result.totalBase,
      pct: result.totalPct,
      color: null,
    },
  ];

  const capAbs = Math.abs(result.capitalBase);
  const fxAbs = Math.abs(result.currencyBase);
  const absSum = capAbs + fxAbs;
  const capShare = absSum > 0 ? (capAbs / absSum) * 100 : 0;
  const fxShare = absSum > 0 ? 100 - capShare : 0;
  const barText = t("attr_bar_label", {
    capital: `${money(result.capitalBase)} (${pct(result.capitalContributionPct)})`,
    fx: `${money(result.currencyBase)} (${pct(result.currencyContributionPct)})`,
  });

  const source = t(rates.pegged ? "attr_source_peg" : "attr_source_ecb");
  const costRate = rateFmt.format(result.fxAtCost);
  const costLine =
    rates.costAsOfFrom === rates.costAsOfTo
      ? t("attr_rate_cost", { currency, rate: costRate, base, source, date: rates.costAsOfFrom })
      : t("attr_rate_cost_range", { currency, rate: costRate, base, source, from: rates.costAsOfFrom, to: rates.costAsOfTo });

  return (
    <Card className={cn("border-border bg-card", className)} aria-label={t("attr_title")}>
      {title}
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => {
            const s = sign(tile.amount);
            return (
              <div key={tile.id} data-testid={`attr-${tile.id}`} className="min-w-0 rounded-md border border-border p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {tile.color ? (
                    <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: tile.color }} />
                  ) : null}
                  <span className="min-w-0">{tile.label}</span>
                  <InfoTooltip label={t("attr_info_label", { name: tile.label })} icon={<Info className="size-4" aria-hidden />}>
                    {tile.info}
                  </InfoTooltip>
                </div>
                <p data-testid={`attr-${tile.id}-amount`} data-tone={s} className={cn("text-lg font-semibold tabular-nums", TONE[s])}>
                  {money(tile.amount)}
                </p>
                <p data-testid={`attr-${tile.id}-pct`} className={cn("text-sm tabular-nums", TONE[s])}>
                  {pct(tile.pct)}
                </p>
              </div>
            );
          })}
        </div>

        {absSum > 0 ? (
          <div>
            <div role="img" aria-labelledby={barId} className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${capShare}%`, backgroundColor: "var(--chart-1)" }} />
              <div style={{ width: `${fxShare}%`, backgroundColor: "var(--chart-3)" }} />
            </div>
            <span id={barId} className="sr-only">
              {barText}
            </span>
          </div>
        ) : null}

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t("attr_rates_title")}</p>
          <p>{costLine}</p>
          <p>{t("attr_rate_now", { currency, rate: rateFmt.format(result.fxNow), base })}</p>
          {rates.approximate ? <p>{t("attr_note_approx")}</p> : null}
          {rates.pegged ? <p>{t("attr_note_peg")}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

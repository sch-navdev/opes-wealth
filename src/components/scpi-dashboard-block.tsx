"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useScpiText } from "@/components/scpi-text";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import { formatDecimal, moneyFormatter } from "@/lib/money-parts";
import type { ScpiBlockData } from "@/lib/scpi-dashboard";
import { cn } from "@/lib/utils";

/** Missing data is always an en dash. */
const DASH = "–";

/**
 * The SCPI block of the collapsible dashboard (registered as `scpi` in lib/dashboard-layout.ts):
 * total value, weighted distribution rate, and per holding the latest VDRec / MDS and VDRea / PDR
 * ratios with the date of the indicators and a marker when they are older than 12 months.
 */
export function ScpiDashboardBlock({ data, baseCurrency }: { data: ScpiBlockData; baseCurrency: string }) {
  const st = useScpiText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();
  const money = useMemo(
    () => moneyFormatter(intlLocale, baseCurrency, { maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const pct = (n: number | null, digits = 1) => (n == null ? DASH : `${formatDecimal(n, intlLocale, digits)}%`);

  return (
    <Card
      className={cn(
        "h-full min-w-0 gap-4 border-border bg-card py-5 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none",
      )}
      style={tileEntranceStyle(motion, 5)}
    >
      <CardHeader>
        <CardTitle className="text-base">{st("scpi2_block_title")}</CardTitle>
        <CardDescription>{st("scpi2_block_ratios")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.holdings.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {st("scpi2_block_empty")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{st("scpi2_block_total")}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {maskValue(money.format(data.totalValueBase))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground" title={st("scpi2_block_rate_hint")}>
                  {st("scpi2_block_rate")}
                </p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{pct(data.weightedRatePct, 2)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full caption-bottom text-xs tabular-nums [&_td]:px-2 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-2">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="text-start font-medium">{st("scpi2_block_holding_header")}</th>
                    <th scope="col" className="whitespace-nowrap text-end font-medium">{st("scpi2_ratio_vdrec")}</th>
                    <th scope="col" className="whitespace-nowrap text-end font-medium">{st("scpi2_ratio_vdrea")}</th>
                    <th scope="col" className="whitespace-nowrap text-end font-medium">{st("scpi2_ind_asof")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h) => (
                    <tr key={h.id} className="border-b border-border/50 last:border-0">
                      <td className="max-w-40 truncate font-medium" title={h.name}>
                        <Link
                          href={`/dashboard/assets/${h.id}`}
                          className="hover:underline"
                          aria-label={st("scpi2_block_open", { name: h.name })}
                        >
                          {h.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-end">{pct(h.vdrecRatioPct)}</td>
                      <td className="whitespace-nowrap text-end">{pct(h.vdreaRatioPct)}</td>
                      <td className="whitespace-nowrap text-end">
                        {h.asOf ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-1">
                            {h.asOf}
                            {h.stale && (
                              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                {st("scpi2_stale")}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{st("scpi2_block_no_indicator")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

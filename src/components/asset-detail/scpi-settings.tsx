"use client";

import { useLanguage } from "@/context/language-context";
import { useScpiText } from "@/components/scpi-text";
import { formatDecimal, formatPercentPoints } from "@/lib/money-parts";
import type { MoneyFormatter } from "@/lib/money-parts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SCPI_MODE_LABEL_KEYS } from "@/components/scpi-fields";
import {
  parseScpiMetadata,
  scpiAverageYield,
  scpiCurrentSubscriptionPrice,
  scpiEnjoymentDelayMonths,
  scpiEntryFees,
  scpiIndicatorHistory,
  scpiInvested,
  scpiReceived,
  scpiRevalorisationSteps,
  scpiSaleVsPurchase,
  scpiTotalRevalorisationPct,
  scpiTrailingYield,
  scpiWithdrawalValue,
} from "@/lib/scpi";

import { DetailField } from "@/components/asset-detail/shared";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function ScpiSettings({
  t,
  displayAsset,
  today,
  maskValue,
  currencyFormatter,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  displayAsset: AssetDetail;
  today: string;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
}) {
  const { intlLocale } = useLanguage();
  const st = useScpiText();
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("scpi_details")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(() => {
          const scpi = parseScpiMetadata(displayAsset.metadata);
          const invested = scpiInvested(scpi, displayAsset.quantity);
          const fees = scpiEntryFees(scpi, displayAsset.quantity);
          const unit = scpiWithdrawalValue(scpi);
          const trailing = scpiTrailingYield(scpi, displayAsset.quantity, today);
          const average = scpiAverageYield(scpi);
          const dividends = [...scpi.dividends].sort((a, b) => b.date.localeCompare(a.date));
          const money = (n: number) => maskValue(currencyFormatter.format(n));
          const delayMonths = scpiEnjoymentDelayMonths(scpi.subscription_date, scpi.jouissance_date);
          const mds = scpiCurrentSubscriptionPrice(scpi);
          const totalReval = scpiTotalRevalorisationPct(scpi);
          const saleVsPurchase = scpiSaleVsPurchase(scpi, displayAsset.quantity);
          const revalSteps = scpiRevalorisationSteps(scpi);
          const indicatorRows = scpiIndicatorHistory(scpi);
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DetailField label={t("scpi_management_company")} value={scpi.management_company} />
                <DetailField label={t("scpi_sector")} value={scpi.sector} />
                <DetailField label={t("scpi_geography")} value={scpi.geography} />
                <DetailField
                  label={t("scpi_holding_mode")}
                  value={t(SCPI_MODE_LABEL_KEYS[scpi.holding_mode])} />
                <DetailField label={t("scpi_shares")} value={String(displayAsset.quantity)} />
                <DetailField
                  label={t("scpi_subscription_price")}
                  value={scpi.subscription_price != null ? money(scpi.subscription_price) : null} />
                <DetailField
                  label={t("scpi_entry_fee")}
                  value={scpi.entry_fee_pct != null ? `${scpi.entry_fee_pct}%` : null} />
                <DetailField
                  label={t("scpi_withdrawal_value")}
                  value={unit != null ? money(unit) : null} />
                <DetailField label={t("scpi_invested")} value={money(invested)} />
                <DetailField label={t("scpi_fees_paid")} value={money(fees)} />
                <DetailField label={st("scpi2_subscription_date")} value={scpi.subscription_date || null} />
                <DetailField label={t("scpi_jouissance_date")} value={scpi.jouissance_date || null} />
                <DetailField
                  label={st("scpi2_enjoyment_delay")}
                  value={
                    delayMonths != null
                      ? st("scpi2_months", { months: formatDecimal(delayMonths, intlLocale, 1) })
                      : null
                  } />
                <DetailField label={st("scpi2_register")} value={scpi.register_numbers || null} />
                <DetailField
                  label={st("scpi2_reval_current")}
                  value={mds != null ? money(mds) : null} />
                <DetailField
                  label={st("scpi2_reval_total")}
                  value={
                    totalReval != null
                      ? `${totalReval >= 0 ? "+" : ""}${formatDecimal(totalReval, intlLocale, 2)}%`
                      : null
                  } />
                <DetailField
                  label={st("scpi2_sale_vs_purchase")}
                  value={
                    saleVsPurchase
                      ? `${money(saleVsPurchase.total)} (${saleVsPurchase.pct >= 0 ? "+" : ""}${formatDecimal(saleVsPurchase.pct, intlLocale, 2)}%)`
                      : null
                  } />
                <DetailField
                  label={t("scpi_financed_by_credit")}
                  value={scpi.financed_by_credit ? t("yes") : t("no")} />
                <DetailField
                  label={t("scpi_dividends_received")}
                  value={money(scpiReceived(scpi))} />
                <DetailField
                  label={t("scpi_realised_yield")}
                  value={trailing != null ? formatPercentPoints(trailing, intlLocale, { digits: 2 }) : null} />
                <DetailField
                  label={t("scpi_target_yield")}
                  value={scpi.target_yield_pct != null ? `${scpi.target_yield_pct}%` : null} />
                <DetailField
                  label={t("scpi_average_yield")}
                  value={average != null ? formatPercentPoints(average, intlLocale, { digits: 2 }) : null} />
              </div>
              {scpi.yield_history.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {[...scpi.yield_history]
                    .sort((a, b) => b.year - a.year)
                    .map((y) => `${y.year}: ${y.rate}%`)
                    .join(" · ")}
                </p>
              )}
              {scpi.name_source === "manual" && (
                <p className="text-xs text-muted-foreground">{st("scpi2_unverified_note")}</p>
              )}
              {revalSteps.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{st("scpi2_reval_heading")}</p>
                  <p className="text-xs text-muted-foreground">
                    {revalSteps
                      .map(
                        (s) =>
                          `${s.date}: ${money(s.price)}${s.changePct != null ? ` (${s.changePct >= 0 ? "+" : ""}${formatDecimal(s.changePct, intlLocale, 2)}%)` : ""}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{st("scpi2_ind_heading")}</p>
                {indicatorRows.length > 0 ? (
                  <div className="overflow-x-auto border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-muted-foreground">{st("scpi2_ind_asof")}</TableHead>
                          <TableHead className="text-end text-muted-foreground">{st("scpi2_vdrec")}</TableHead>
                          <TableHead className="text-end text-muted-foreground">{st("scpi2_vdrea")}</TableHead>
                          <TableHead className="text-muted-foreground">{st("scpi2_ind_source")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indicatorRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="tabular-nums text-foreground">{row.as_of}</TableCell>
                            <TableCell className="text-end tabular-nums text-foreground">
                              {row.vdrec != null ? money(row.vdrec) : "—"}
                            </TableCell>
                            <TableCell className="text-end tabular-nums text-foreground">
                              {row.vdrea != null ? money(row.vdrea) : "—"}
                            </TableCell>
                            <TableCell className="text-foreground">{row.source_note || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{st("scpi2_ind_empty")}</p>
                )}
              </div>
              {dividends.length > 0 ? (
                <div className="overflow-x-auto border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-muted-foreground">{t("scpi_quarter")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("scpi_dividend_date")}</TableHead>
                        <TableHead className="text-end text-muted-foreground">
                          {t("scpi_dividend_amount")}
                        </TableHead>
                        <TableHead className="text-muted-foreground">{t("pe_call_status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dividends.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-foreground">{d.quarter || "—"}</TableCell>
                          <TableCell className="tabular-nums text-foreground">{d.date}</TableCell>
                          <TableCell className="text-end tabular-nums text-foreground">
                            {money(d.amount)}
                          </TableCell>
                          <TableCell
                            className={d.status === "received" ? "text-success" : "text-muted-foreground"}
                          >
                            {d.status === "received"
                              ? t("scpi_status_received")
                              : t("scpi_status_expected")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("scpi_no_dividends")}</p>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}

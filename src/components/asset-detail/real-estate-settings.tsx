"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Button } from "@/components/ui/button";
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

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { DetailField, ProgressBar } from "@/components/asset-detail/shared";

import { RealEstateMetadata } from "@/lib/real-estate";
import { AmortizationSummary } from "@/lib/amortization";

import type { TranslationKey } from "@/lib/i18n";

export function RealEstateSettings({
  t,
  metadata,
  maskValue,
  currencyFormatter,
  totalCost,
  hasLoan,
  outstandingLoanBalance,
  amortizationSummary,
  scheduleOpen,
  setScheduleOpen,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  metadata: RealEstateMetadata;
  maskValue: (value: string | number) => string;
  currencyFormatter: Intl.NumberFormat;
  totalCost: number | null;
  hasLoan: boolean;
  outstandingLoanBalance: number;
  amortizationSummary: AmortizationSummary | null;
  scheduleOpen: boolean;
  setScheduleOpen: (open: boolean) => void;
}) {
  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("core_property_details")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField label={t("address")} value={metadata.address} />
          <DetailField label={t("type")} value={metadata.propertyType} />
          <DetailField
            label={t("internal_area")}
            value={metadata.internal_area != null
              ? `${metadata.internal_area} m²`
              : null} />
          <DetailField
            label={t("terrace_area")}
            value={metadata.terrace_area != null
              ? `${metadata.terrace_area} m²`
              : null} />
          <DetailField
            label={t("total_area")}
            value={metadata.surfaceArea != null
              ? `${metadata.surfaceArea} m²`
              : null} />
          <DetailField
            label={t("year_of_construction")}
            value={metadata.yearOfConstruction} />
          <DetailField
            label={t("epc_rating")}
            value={metadata.epcRating} />
        </CardContent>
      </Card>

      {metadata.emirate !== "abu_dhabi" && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              {t("dld_identifiers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metadata.is_offplan ? (
              <>
                <DetailField
                  label={t("oqood_number")}
                  value={metadata.oqood_number} />
                <DetailField
                  label={t("project_number")}
                  value={metadata.project_number} />
                <DetailField
                  label={t("escrow_id")}
                  value={metadata.escrow_id} />
              </>
            ) : (
              <>
                <DetailField
                  label={t("title_deed_number")}
                  value={metadata.title_deed_number} />
                <DetailField label={t("plot_id")} value={metadata.plot_id} />
              </>
            )}
            <DetailField
              label={t("community_id")}
              value={metadata.community_id} />
          </CardContent>
        </Card>
      )}

      {metadata.emirate === "abu_dhabi" && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              {t("adrec_identifiers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metadata.is_offplan ? (
              <>
                <DetailField
                  label={t("adrec_project_id")}
                  value={metadata.adrec_project_id} />
                <DetailField
                  label={t("adrec_developer_id")}
                  value={metadata.adrec_developer_id} />
              </>
            ) : (
              <>
                <DetailField
                  label={t("adrec_plot_number")}
                  value={metadata.adrec_plot_number} />
                <DetailField
                  label={t("adrec_unit_id")}
                  value={metadata.adrec_unit_id} />
                <DetailField
                  label={t("adrec_title_deed")}
                  value={metadata.adrec_title_deed} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("material_condition_ratings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label={t("kitchen")}
            value={metadata.condition.kitchen} />
          <DetailField
            label={t("bathrooms")}
            value={metadata.condition.bathrooms} />
          <DetailField
            label={t("flooring")}
            value={metadata.condition.flooring} />
          <DetailField
            label={t("windows")}
            value={metadata.condition.windows} />
          <DetailField
            label={t("general")}
            value={metadata.condition.general} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("cost_fees_basis")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label={metadata.contract_price != null
              ? t("contract_price")
              : t("purchase_price")}
            value={metadata.contract_price ?? metadata.purchasePrice
              ? maskValue(
                currencyFormatter.format(
                  (metadata.contract_price ??
                    metadata.purchasePrice) as number
                )
              )
              : null} />
          <DetailField
            label={t("registration_fee", {
              type: metadata.registration_fee_type,
            })}
            value={metadata.registration_fee_amount
              ? maskValue(
                currencyFormatter.format(
                  metadata.registration_fee_amount
                )
              )
              : "—"} />
          <DetailField
            label={t("agency_fees")}
            value={metadata.agencyFees != null
              ? maskValue(currencyFormatter.format(metadata.agencyFees))
              : null} />
          <DetailField
            label={t("renovation_fees")}
            value={metadata.renovationFees != null
              ? maskValue(
                currencyFormatter.format(metadata.renovationFees)
              )
              : null} />
          <DetailField
            label={t("furnishing_fees")}
            value={metadata.furnishingFees != null
              ? maskValue(
                currencyFormatter.format(metadata.furnishingFees)
              )
              : null} />
          <DetailField
            label={t("transfer_trustee_fees")}
            value={metadata.transfer_trustee_fees != null
              ? maskValue(
                currencyFormatter.format(metadata.transfer_trustee_fees)
              )
              : null} />
          <DetailField
            label={t("agent_sales_progression_fees")}
            value={metadata.agent_sales_progression_fees != null
              ? maskValue(
                currencyFormatter.format(
                  metadata.agent_sales_progression_fees
                )
              )
              : null} />
          <DetailField
            label={t("rera_title_deed_processing_fees")}
            value={metadata.rera_title_deed_processing_fees != null
              ? maskValue(
                currencyFormatter.format(
                  metadata.rera_title_deed_processing_fees
                )
              )
              : null} />
          <DetailField
            label={t("rera_mortgage_registration_fees")}
            value={metadata.rera_mortgage_registration_fees != null
              ? maskValue(
                currencyFormatter.format(
                  metadata.rera_mortgage_registration_fees
                )
              )
              : null} />
          <DetailField
            label={t("rera_knowledge_fee")}
            value={metadata.rera_knowledge_fee != null
              ? maskValue(
                currencyFormatter.format(metadata.rera_knowledge_fee)
              )
              : null} />
          <DetailField
            label={t("in_principle_bank_approval_fee")}
            value={metadata.in_principle_bank_approval_fee != null
              ? maskValue(
                currencyFormatter.format(
                  metadata.in_principle_bank_approval_fee
                )
              )
              : null} />
          <DetailField
            label={t("property_valuation_fee")}
            value={metadata.property_valuation_fee != null
              ? maskValue(
                currencyFormatter.format(metadata.property_valuation_fee)
              )
              : null} />
          <DetailField
            label={t("bank_processing_fees")}
            value={metadata.bank_processing_fees != null
              ? maskValue(
                currencyFormatter.format(metadata.bank_processing_fees)
              )
              : null} />
          <DetailField
            label={t("yearly_insurance_fee")}
            value={metadata.yearly_insurance_fee != null
              ? maskValue(
                currencyFormatter.format(metadata.yearly_insurance_fee)
              )
              : null} />
          <DetailField
            label={t("total_property_cost")}
            value={totalCost != null
              ? maskValue(currencyFormatter.format(totalCost))
              : null} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("financing")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasLoan ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t("outstanding_loan_balance")}
                  </p>
                  <p className="text-lg font-semibold text-destructive">
                    {maskValue(
                      currencyFormatter.format(outstandingLoanBalance)
                    )}
                  </p>
                </div>
                {metadata.linked_loan.lender_name && (
                  <DetailField
                    label={t("lender_name")}
                    value={metadata.linked_loan.lender_name} />
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <DetailField
                  label={t("principal")}
                  value={maskValue(
                    currencyFormatter.format(
                      metadata.linked_loan.amount ?? 0
                    )
                  )} />
                <DetailField
                  label={t("monthly_payment")}
                  value={metadata.linked_loan.monthly_payment != null
                    ? maskValue(
                      currencyFormatter.format(
                        metadata.linked_loan.monthly_payment
                      )
                    )
                    : null} />
                <DetailField
                  label={t("interest_rate")}
                  value={metadata.linked_loan.interest_rate != null
                    ? `${metadata.linked_loan.interest_rate}%`
                    : null} />
                <DetailField
                  label={t("duration")}
                  value={metadata.linked_loan.duration_months != null
                    ? t("duration_months", {
                      n: metadata.linked_loan.duration_months,
                    })
                    : null} />
                <DetailField
                  label={t("start_date")}
                  value={metadata.linked_loan.start_date} />
              </div>

              {amortizationSummary && (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="h-40 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: t("principal_paid"),
                                value: amortizationSummary.principalPaidToDate,
                              },
                              {
                                name: t("interest_paid"),
                                value: amortizationSummary.interestPaidToDate,
                              },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={35}
                            outerRadius={60}
                          >
                            <Cell fill="var(--color-success)" />
                            <Cell fill="var(--color-destructive)" />
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--color-card)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-foreground)",
                            }}
                            formatter={(value) => maskValue(currencyFormatter.format(Number(value)))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col justify-center gap-3">
                      <DetailField
                        label={t("principal_paid")}
                        value={maskValue(
                          currencyFormatter.format(
                            amortizationSummary.principalPaidToDate
                          )
                        )} />
                      <DetailField
                        label={t("interest_paid")}
                        value={maskValue(
                          currencyFormatter.format(
                            amortizationSummary.interestPaidToDate
                          )
                        )} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("loan_percent_paid")}</span>
                      <span>{amortizationSummary.percentPaid.toFixed(1)}%</span>
                    </div>
                    <ProgressBar
                      percent={amortizationSummary.percentPaid}
                      colorClassName="bg-success" />
                  </div>
                  <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        {scheduleOpen
                          ? t("hide_amortization_schedule")
                          : t("show_amortization_schedule")}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 max-h-80 overflow-y-auto border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("payment_number")}</TableHead>
                              <TableHead>{t("due_date")}</TableHead>
                              <TableHead className="text-end">
                                {t("interest_rate")}
                              </TableHead>
                              <TableHead className="text-end">
                                {t("principal")}
                              </TableHead>
                              <TableHead className="text-end">
                                {t("interest_paid")}
                              </TableHead>
                              <TableHead className="text-end">
                                {t("outstanding_loan_balance")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {amortizationSummary.schedule.map((entry) => (
                              <TableRow key={entry.paymentNumber}>
                                <TableCell>{entry.paymentNumber}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {entry.date}
                                </TableCell>
                                <TableCell className="text-end text-muted-foreground">
                                  {entry.rateUsed.toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-end">
                                  {maskValue(
                                    currencyFormatter.format(entry.principalAmount)
                                  )}
                                </TableCell>
                                <TableCell className="text-end">
                                  {maskValue(
                                    currencyFormatter.format(entry.interestAmount)
                                  )}
                                </TableCell>
                                <TableCell className="text-end">
                                  {maskValue(
                                    currencyFormatter.format(entry.remainingBalance)
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("no_loan_attached")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

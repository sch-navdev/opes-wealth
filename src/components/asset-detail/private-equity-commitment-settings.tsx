"use client";

import { formatDecimal } from "@/lib/money-parts";
import { useLanguage } from "@/context/language-context";
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

import { DetailField, ProgressBar } from "@/components/asset-detail/shared";

import {
  calledCapital,
  distributedCapital,
  isOverdue,
  pendingCapitalCallsTotal,
  PrivateEquityMetadata,
  unfundedCommitment,
} from "@/lib/private-equity";

import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

export function PrivateEquityCommitmentSettings({
  t,
  privateEquityMetadata,
  maskValue,
  currencyFormatter,
  today,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  privateEquityMetadata: PrivateEquityMetadata;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
  today: string;
}) {
  const { intlLocale } = useLanguage();
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("pe_commitment_heading")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(() => {
          const pe = privateEquityMetadata;
          const commitment = pe.commitment_amount;
          const called = calledCapital(pe);
          const unfunded = unfundedCommitment(pe);
          const pending = pendingCapitalCallsTotal(pe);
          const calledPct = commitment && commitment > 0 ? Math.min(100, (called / commitment) * 100) : null;
          const calls = [...pe.capital_calls].sort((a, b) => a.due_date.localeCompare(b.due_date)
          );
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <DetailField
                  label={t("pe_commitment_amount")}
                  value={commitment != null ? maskValue(currencyFormatter.format(commitment)) : null} />
                <DetailField
                  label={t("pe_called_capital")}
                  value={maskValue(currencyFormatter.format(called))} />
                <DetailField
                  label={t("pe_unfunded")}
                  value={maskValue(currencyFormatter.format(unfunded))} />
                <DetailField
                  label={t("pe_distributions")}
                  value={pe.distributions.length > 0 || pe.distributions_to_date != null
                    ? maskValue(currencyFormatter.format(distributedCapital(pe)))
                    : null} />
                <DetailField
                  label={t("pe_liability_counted")}
                  value={maskValue(currencyFormatter.format(pending))} />
              </div>
              {calledPct != null && (
                <div className="space-y-1">
                  <ProgressBar percent={calledPct} colorClassName="bg-primary" />
                  <p className="text-xs text-muted-foreground">
                    {t("pe_called_progress", { pct: formatDecimal(calledPct, intlLocale, 1) })}
                  </p>
                </div>
              )}
              {calls.length > 0 ? (
                <div className="overflow-x-auto border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-muted-foreground">{t("pe_call_date")}</TableHead>
                        <TableHead className="text-end text-muted-foreground">
                          {t("pe_call_amount")}
                        </TableHead>
                        <TableHead className="text-end text-muted-foreground">%</TableHead>
                        <TableHead className="text-muted-foreground">{t("pe_call_status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calls.map((call) => (
                        <TableRow key={call.id}>
                          <TableCell className="tabular-nums text-foreground">{call.due_date}</TableCell>
                          <TableCell className="text-end tabular-nums text-foreground">
                            {maskValue(currencyFormatter.format(call.amount))}
                          </TableCell>
                          <TableCell className="text-end tabular-nums text-muted-foreground">
                            {call.percentage ? `${call.percentage}%` : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              call.status === "paid" ? "text-success" : "text-foreground",
                              isOverdue(call, today) && "text-destructive"
                            )}
                          >
                            {call.status === "paid"
                              ? t("pe_call_paid")
                              : isOverdue(call, today)
                                ? t("pe_call_overdue")
                                : t("pe_call_pending")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("pe_no_calls")}</p>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}

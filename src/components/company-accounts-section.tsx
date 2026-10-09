"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { BalanceAsOf } from "@/components/balance-as-of";
import { useCompanyCashText } from "@/components/company-cash-text";
import { BankLogoByName } from "@/components/institution-logo";
import type { BankingAccountRow } from "@/components/banking-overview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";

/**
 * "Company accounts" group of the Banking page: the bank accounts that belong to one of the user's companies
 * (Cash assets with `metadata.company_id`), labelled with the company name and grouped by company. They are
 * part of the real-accounts total (and of net worth); the list just keeps them apart from the personal accounts.
 */
export function CompanyAccountsSection({
  rows,
  baseCurrency,
  today,
}: {
  rows: BankingAccountRow[];
  baseCurrency: string;
  today: string;
}) {
  const cco = useCompanyCashText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  if (rows.length === 0) return null;

  const base = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });
  const byCompany = new Map<string, BankingAccountRow[]>();
  for (const row of rows) {
    const company = row.companyName ?? "";
    byCompany.set(company, [...(byCompany.get(company) ?? []), row]);
  }
  const total = rows.reduce((s, r) => s + r.baseBalance, 0);

  return (
    <section className="space-y-3" aria-label={cco("cco_banking_heading")} data-testid="banking-company-accounts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Landmark className="size-4 text-primary" aria-hidden="true" />
          {cco("cco_banking_heading")}
          <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
        </h2>
        <span className="text-sm font-medium tabular-nums text-foreground">{maskValue(base.format(total))}</span>
      </div>
      {[...byCompany.entries()].map(([company, accounts]) => (
        <Card key={company} className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="truncate text-sm text-foreground">{cco("cco_banking_company", { company })}</CardTitle>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {maskValue(base.format(accounts.reduce((s, r) => s + r.baseBalance, 0)))}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border border-t border-border">
              {accounts.map((a) => {
                const native = new Intl.NumberFormat(intlLocale, { style: "currency", currency: a.currency });
                return (
                  <li
                    key={a.key}
                    className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                        {a.institution && <BankLogoByName name={a.institution} />}
                        {a.assetId ? (
                          <Link href={`/dashboard/assets/${a.assetId}`} className="hover:underline">
                            {a.name}
                          </Link>
                        ) : (
                          a.name
                        )}{" "}
                        <span className="font-normal text-muted-foreground">{a.masked}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{cco("cco_lookthrough_badge")}</Badge>
                        {a.institution && <span className="text-xs text-muted-foreground">{a.institution}</span>}
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {maskValue(native.format(a.balance))}
                      </p>
                      {a.currency !== baseCurrency && (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {maskValue(base.format(a.baseBalance))}
                        </p>
                      )}
                      <BalanceAsOf asOf={a.balanceAsOf} today={today} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

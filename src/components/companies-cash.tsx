"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { AddBankAccountDialog } from "@/components/add-bank-account-dialog";
import { BalanceAsOf } from "@/components/balance-as-of";
import { CompanyAccountLinkDialog } from "@/components/company-account-link-dialog";
import { useCompanyCashText } from "@/components/company-cash-text";
import { BankLogoByName } from "@/components/institution-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { moneyFormatter } from "@/lib/money-parts";

export type CompanyCashAccount = {
  id: string;
  name: string;
  currency: string;
  /** Balance in the account's own currency. */
  nativeValue: number;
  /** Balance in the Base Currency. */
  baseValue: number;
  institutionName?: string;
  /** ISO date (YYYY-MM-DD) the balance is as of, when known. */
  balanceAsOf?: string | null;
};

export type CompanyCashGroup = { companyId: string; companyName: string; accounts: CompanyCashAccount[] };

/** Sum of the Base Currency balances: the "Company cash" figure of the summary and the per-company subtotal. */
export function companyCashTotal(accounts: { baseValue: number }[]): number {
  return accounts.reduce((sum, a) => sum + a.baseValue, 0);
}

/**
 * "Company cash" on the Companies page: per company, its bank accounts (bank logo, native and Base Currency
 * balance, "balance as of") with a subtotal, a link to each account and an "Add company bank account" button.
 * The cash is part of net worth but is NOT personal cash (see `lib/company-cash.ts`).
 */
export function CompaniesCash({
  groups,
  baseCurrency,
  today,
}: {
  groups: CompanyCashGroup[];
  baseCurrency: string;
  today: string;
}) {
  const cco = useCompanyCashText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const base = moneyFormatter(intlLocale, baseCurrency);
  const companies = groups.map((g) => ({ id: g.companyId, name: g.companyName }));
  const total = companyCashTotal(groups.flatMap((g) => g.accounts));

  if (groups.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={cco("cco_section_title")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Landmark className="size-4 text-primary" aria-hidden="true" />
            {cco("cco_section_title")}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{cco("cco_section_desc")}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-foreground" data-testid="company-cash-total">
          {maskValue(base.format(total))}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const subtotal = companyCashTotal(group.accounts);
          return (
            <Card key={group.companyId} className="border-border bg-card" data-testid={`company-cash-${group.companyId}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="min-w-0 truncate text-sm text-foreground">{group.companyName}</CardTitle>
                <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
                  <span className="text-xs text-muted-foreground">
                    {cco("cco_accounts_count", { n: group.accounts.length })}
                  </span>
                  <span className="font-medium text-foreground" aria-label={cco("cco_subtotal")}>
                    {maskValue(base.format(subtotal))}
                  </span>
                </span>
              </CardHeader>
              <CardContent className="space-y-3 p-0">
                {group.accounts.length === 0 ? (
                  <p className="px-6 text-xs text-muted-foreground">{cco("cco_no_accounts")}</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {group.accounts.map((a) => {
                      const native = moneyFormatter(intlLocale, a.currency);
                      return (
                        <li
                          key={a.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {a.institutionName && <BankLogoByName name={a.institutionName} />}
                              <Link
                                href={`/dashboard/assets/${a.id}`}
                                className="truncate text-sm font-medium text-foreground hover:underline"
                                aria-label={`${cco("cco_open_account")}: ${a.name}`}
                              >
                                {a.name}
                              </Link>
                            </div>
                            {a.institutionName && (
                              <p className="text-xs text-muted-foreground">{a.institutionName}</p>
                            )}
                            <CompanyAccountLinkDialog
                              accountId={a.id}
                              accountName={a.name}
                              currentCompanyId={group.companyId}
                              companies={companies}
                            />
                          </div>
                          <div className="text-end">
                            <p className="text-sm font-medium tabular-nums text-foreground">
                              {maskValue(native.format(a.nativeValue))}
                            </p>
                            {a.currency !== baseCurrency && (
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {maskValue(base.format(a.baseValue))}
                              </p>
                            )}
                            <BalanceAsOf asOf={a.balanceAsOf} today={today} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="px-6 pb-4">
                  <AddBankAccountDialog
                    companies={companies}
                    defaultCompanyId={group.companyId}
                    trigger={
                      <Button type="button" variant="outline" size="sm">
                        {cco("cco_add_account")}
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

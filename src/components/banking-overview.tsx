"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BankConnectDialog } from "@/components/bank-connect-dialog";
import { BankLogoByName, InstitutionLogo } from "@/components/institution-logo";
import {
  BankStatementImportDialog,
  type StatementTargetAccount,
} from "@/components/bank-statement-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { BalanceAsOf } from "@/components/balance-as-of";
import { CompanyAccountsSection } from "@/components/company-accounts-section";
import { useBankingText } from "@/components/banking-text";
import { useEditBankText } from "@/components/edit-bank-account-text";
import {
  ALL_COUNTRIES,
  NO_COUNTRY,
  countriesInRows,
  groupRowsByCountry,
  readCountryFilter,
  resolveCountryFilter,
  writeCountryFilter,
} from "@/lib/banking/account-country";
import { countryFlag, countryLabel } from "@/lib/banking/bank-picker";
import { countStaleBalances } from "@/lib/bank-staleness";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import {
  banksByCountry,
  bankInstitutionId,
  canConnect,
  type BankDef,
  type BankSyncMode,
} from "@/lib/banking/institutions";
import { cn } from "@/lib/utils";

export type BankingAccountRow = {
  key: string;
  name: string;
  institution: string;
  masked: string;
  currency: string;
  /** In the account's own currency. */
  balance: number;
  /** In the Base Currency. */
  baseBalance: number;
  /** manual = typed/CSV Cash account, synced = live Open Finance link, sandbox = fake bank (asset-less). */
  kind: "manual" | "synced" | "sandbox";
  status: "ok" | "error" | "expired" | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  assetId?: string;
  /** ISO date (YYYY-MM-DD) the balance is as of; absent for sandbox rows (not part of net worth). */
  balanceAsOf?: string | null;
  /** ISO country code (metadata.country, else the bank's); groups and filters the list. */
  country?: string;
  /** ISO date the account was closed (a statement said so): hidden unless "Show closed accounts" is on. */
  closedOn?: string | null;
  /** How the account's data got in (a PDF statement, a CSV file, a bank link or by hand). */
  importSource?: "synced" | "pdf" | "csv" | "manual";
  /** Name of the company this account belongs to (Cash account with metadata.company_id): shown under "Company accounts". */
  companyName?: string;
};

type Filter = "real" | "sandbox" | "all";

/**
 * Consolidated banking view: every bank account in one place, grouped by
 * bank. Real accounts (manual/CSV and live-synced Cash accounts) make up the
 * total that is part of net worth; SANDBOX accounts (fake banks, asset-less)
 * are hidden by default, shown only when asked, always tagged, and their total
 * is shown separately and never added to the real one.
 */
export function BankingOverview({
  rows,
  baseCurrency,
  mode,
  statementAccounts,
  connectableCash,
  today = new Date().toISOString().slice(0, 10),
}: {
  rows: BankingAccountRow[];
  baseCurrency: string;
  mode: BankSyncMode;
  statementAccounts: StatementTargetAccount[];
  connectableCash: { id: string; name: string; isLinked: boolean }[];
  /** ISO date used to age the balances (server-provided so tests and SSR agree). */
  today?: string;
}) {
  const { t, intlLocale } = useLanguage();
  const tx = useBankingText();
  const { maskValue } = usePrivacy();
  const [filter, setFilter] = useState<Filter>("real");
  const [showClosed, setShowClosed] = useState(false);
  const ebk = useEditBankText();
  // Country filter chip, remembered per device (read after mount so the server and client markup agree).
  const [countryFilter, setCountryFilter] = useState<string>(ALL_COUNTRIES);
  useEffect(() => {
    const stored = readCountryFilter();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setCountryFilter(stored);
  }, []);
  const syncTime = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const base = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });

  const closedCount = rows.filter((r) => r.closedOn).length;
  const openRows = showClosed ? rows : rows.filter((r) => !r.closedOn);
  const real = openRows.filter((r) => r.kind !== "sandbox");
  const sandbox = openRows.filter((r) => r.kind === "sandbox");
  const realTotal = real.reduce((s, r) => s + r.baseBalance, 0);
  const sandboxTotal = sandbox.reduce((s, r) => s + r.baseBalance, 0);
  const visibleAll = filter === "real" ? real : filter === "sandbox" ? sandbox : openRows;
  // Company accounts stay in the real total (they are in net worth) but are listed apart, under their company.
  const visible = visibleAll.filter((r) => !r.companyName);
  const companyVisible = visibleAll.filter((r) => r.companyName);

  // Country, then institution inside each country. A stored filter whose country is gone shows everything.
  const availableCountries = countriesInRows(visible);
  const activeCountry = resolveCountryFilter(countryFilter, availableCountries);
  const countryGroups = groupRowsByCountry(visible, activeCountry, t("banking_group_other"));
  const hasCountries = availableCountries.some((c) => c !== NO_COUNTRY);
  const countryName = (c: string) =>
    c === NO_COUNTRY ? ebk("ebk_country_unset") : `${countryFlag(c)} ${countryLabel(c, intlLocale)}`.trim();
  const pickCountry = (c: string) => {
    setCountryFilter(c);
    writeCountryFilter(c);
  };

  const uaeBanks = banksByCountry("AE").filter((b) => b.dedicated);
  const frenchBanks = banksByCountry("FR").filter((b) => b.dedicated);

  const connectButton = (bank: BankDef) => (
    <BankConnectDialog
      key={bank.key}
      mode={mode}
      cashAccounts={connectableCash}
      presetInstitutionId={bankInstitutionId(bank.key, mode)}
      trigger={
        <Button type="button" variant="outline" size="sm" disabled={!canConnect(bank, mode)}>
          <InstitutionLogo kind="bank" id={bank.key} name={bank.name} size="sm" />
          {t("bank_connect_named", { bank: bank.name })}
          {mode === "sandbox" && <Badge variant="secondary">{t("sandbox_tag")}</Badge>}
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">{t("banking_total_real")}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {maskValue(base.format(realTotal))}
            </p>
            <p className="text-xs text-muted-foreground">{t("banking_accounts_count", { n: real.length })}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("banking_total_sandbox")} <Badge variant="outline">{t("sandbox_tag")}</Badge>
            </p>
            <p className="text-lg font-semibold tabular-nums text-muted-foreground">
              {maskValue(base.format(sandboxTotal))}
            </p>
            <p className="text-xs text-muted-foreground">{t("banking_sandbox_excluded_note")}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="space-y-2 py-4">
            <p className="text-xs text-muted-foreground">{t("banking_filter_label")}</p>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="real">{t("banking_filter_real")}</TabsTrigger>
                <TabsTrigger value="sandbox">{t("banking_filter_sandbox")}</TabsTrigger>
                <TabsTrigger value="all">{t("banking_filter_all")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">{t("bank_connect_uae_heading")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {mode === "sandbox"
              ? t("bank_sample_note")
              : mode === "unconfigured"
                ? t("bank_not_configured")
                : t("bank_consent_note")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {uaeBanks.map(connectButton)}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <BankStatementImportDialog accounts={statementAccounts} />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">{t("bank_connect_fr_heading")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {mode === "sandbox" ? t("bank_sample_note") : t("bank_fr_psd2_note")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {frenchBanks.map(connectButton)}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{tx("bank_asof_legend")}</p>

      {closedCount > 0 && (
        <Button type="button" size="sm" variant="outline" aria-pressed={showClosed} onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? tx("bank_hide_closed") : tx("bank_show_closed", { n: closedCount })}
        </Button>
      )}

      {hasCountries && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ebk("ebk_country_filter_label")}>
          {[ALL_COUNTRIES, ...availableCountries].map((c) => (
            <Button
              key={c || "none"}
              type="button"
              size="sm"
              variant={activeCountry === c ? "default" : "outline"}
              aria-pressed={activeCountry === c}
              onClick={() => pickCountry(c)}
            >
              {c === ALL_COUNTRIES ? ebk("ebk_country_all") : countryName(c)}
            </Button>
          ))}
        </div>
      )}

      {countryGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("banking_no_accounts")}</p>
      ) : (
        countryGroups.map((group) => (
        <div key={group.country || "none"} className="space-y-4">
          {hasCountries && (
            <h2 className="flex items-center justify-between text-sm font-semibold text-foreground" data-testid="banking-country-heading">
              <span>{countryName(group.country)}</span>
              <span className="tabular-nums text-muted-foreground">{maskValue(base.format(group.total))}</span>
            </h2>
          )}
        {group.institutions.map(({ institution, rows: accounts }) => {
          const total = accounts.reduce((s, r) => s + r.baseBalance, 0);
          const staleCount = countStaleBalances(accounts, today);
          return (
            <Card key={institution} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                  <BankLogoByName name={institution} />
                  {institution === t("banking_group_other") ? (
                    institution
                  ) : (
                    <Link href={`/dashboard/banking/bank/${encodeURIComponent(institution)}`} className="hover:underline" title={tx("bank_detail_total")}>
                      {institution}
                    </Link>
                  )}
                </CardTitle>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {staleCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {tx("bank_asof_group_stale", { n: staleCount })}
                    </Badge>
                  )}
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {maskValue(base.format(total))}
                  </span>
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border border-t border-border">
                  {accounts.map((a) => {
                    const native = new Intl.NumberFormat(intlLocale, { style: "currency", currency: a.currency });
                    const failed = a.status === "error" || a.status === "expired";
                    return (
                      <li
                        key={a.key}
                        className={cn(
                          "flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between",
                          a.kind === "sandbox" && "bg-muted/30",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {a.assetId ? (
                              <Link href={`/dashboard/assets/${a.assetId}`} className="hover:underline">
                                {a.name}
                              </Link>
                            ) : (
                              a.name
                            )}{" "}
                            <span className="font-normal text-muted-foreground">{a.masked}</span>
                            {a.closedOn && <Badge variant="secondary" className="ms-2">{tx("bank_closed_badge", { date: a.closedOn })}</Badge>}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {a.kind === "sandbox" ? (
                              <Badge variant="secondary">{t("sandbox_tag")}</Badge>
                            ) : a.kind === "synced" ? (
                              <Badge
                                variant={failed ? "destructive" : "outline"}
                                className={cn(!failed && "border-success text-success")}
                              >
                                {a.status === "expired"
                                  ? t("bank_status_expired")
                                  : failed
                                    ? t("bank_status_error")
                                    : t("bank_status_synced")}
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                {a.importSource === "pdf"
                                  ? tx("bank_source_pdf")
                                  : a.importSource === "csv"
                                    ? tx("bank_source_csv")
                                    : t("bank_status_manual")}
                              </Badge>
                            )}
                            {a.kind !== "manual" && (
                              <span className="text-xs text-muted-foreground">
                                {a.lastSyncedAt
                                  ? t("bank_last_synced", { when: syncTime.format(new Date(a.lastSyncedAt)) })
                                  : t("bank_never_synced")}
                              </span>
                            )}
                            {a.kind === "sandbox" && (
                              <span className="text-xs text-muted-foreground">{t("banking_not_in_net_worth")}</span>
                            )}
                          </div>
                          {failed && a.lastError && (
                            <p className="text-xs text-destructive" role="alert">
                              {a.lastError}
                            </p>
                          )}
                        </div>
                        <div className="text-end">
                          <p
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              a.kind === "sandbox" ? "text-muted-foreground" : "text-foreground",
                            )}
                          >
                            {maskValue(native.format(a.balance))}
                          </p>
                          {a.currency !== baseCurrency && (
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {maskValue(base.format(a.baseBalance))}
                            </p>
                          )}
                          {a.kind !== "sandbox" && <BalanceAsOf asOf={a.balanceAsOf} today={today} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        </div>
        ))
      )}
      <CompanyAccountsSection rows={companyVisible} baseCurrency={baseCurrency} today={today} />
    </div>
  );
}

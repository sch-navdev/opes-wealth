"use client";

import { useState } from "react";
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
}: {
  rows: BankingAccountRow[];
  baseCurrency: string;
  mode: BankSyncMode;
  statementAccounts: StatementTargetAccount[];
  connectableCash: { id: string; name: string; isLinked: boolean }[];
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [filter, setFilter] = useState<Filter>("real");
  const syncTime = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const base = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });

  const real = rows.filter((r) => r.kind !== "sandbox");
  const sandbox = rows.filter((r) => r.kind === "sandbox");
  const realTotal = real.reduce((s, r) => s + r.baseBalance, 0);
  const sandboxTotal = sandbox.reduce((s, r) => s + r.baseBalance, 0);
  const visible = filter === "real" ? real : filter === "sandbox" ? sandbox : rows;

  const groups = new Map<string, BankingAccountRow[]>();
  for (const row of visible) {
    const key = row.institution || t("banking_group_other");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ordered = Array.from(groups.entries()).sort(
    (a, b) =>
      b[1].reduce((s, r) => s + r.baseBalance, 0) - a[1].reduce((s, r) => s + r.baseBalance, 0),
  );

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

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("banking_no_accounts")}</p>
      ) : (
        ordered.map(([institution, accounts]) => {
          const total = accounts.reduce((s, r) => s + r.baseBalance, 0);
          return (
            <Card key={institution} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                  <BankLogoByName name={institution} />
                  {institution}
                </CardTitle>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {maskValue(base.format(total))}
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
                              <Badge variant="outline">{t("bank_status_manual")}</Badge>
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
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

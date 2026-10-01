"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Landmark, RefreshCw, Upload } from "lucide-react";
import { BankConnectDialog } from "@/components/bank-connect-dialog";
import { BankLogoByName } from "@/components/institution-logo";
import { Badge } from "@/components/ui/badge";
import { disconnectBank, syncBankConnection } from "@/app/dashboard/banking/actions";
import type { BankSyncMode } from "@/lib/banking/institutions";
import { cn } from "@/lib/utils";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";

export type CashAccount = {
  id: string;
  name: string;
  currency: string;
  /** Balance in the account's own currency (what the CSV import reconciles against). */
  nativeValue: number;
  /** Balance in the dashboard Base Currency. */
  baseValue: number;
  /** Date of the newest balance on record, if any. */
  lastDate: string | null;
  /** Open Finance link, when this account is synced from a bank rather than (only) uploaded by CSV. */
  bank?: {
    connectionId: string;
    institutionName: string;
    /** Sample connection (development): balances are shown but never written to the account. */
    isSandbox: boolean;
    connectionStatus: string;
    lastSyncedAt: string | null;
    lastSyncStatus: "ok" | "error" | null;
    lastSyncError: string | null;
  };
};

function formatSyncTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
}

/**
 * Dashboard entry point for Cash / bank accounts: a quick summary (accounts,
 * total in the Base Currency) with a per-account "Import CSV" action that
 * opens the same dropzone → column-mapper flow as the asset page's Settings
 * tab. With no accounts yet it offers to create one (Add Asset, Cash preselected).
 */
export function CashBankCard({
  accounts,
  categories,
  baseCurrency,
  bankSyncMode,
}: {
  accounts: CashAccount[];
  categories: { id: string; name: string }[];
  baseCurrency: string;
  /** Whether Open Finance sync is live, sample (development) or not configured. */
  bankSyncMode: BankSyncMode;
}) {
  const { t, intlLocale } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSync(connectionId: string, accountId: string) {
    setBusyId(accountId);
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncBankConnection(connectionId);
      setBusyId(null);
      if (!result.ok) setSyncMessage({ id: accountId, text: result.error, error: true });
    });
  }

  function handleDisconnect(connectionId: string, accountId: string) {
    setBusyId(accountId);
    startTransition(async () => {
      const result = await disconnectBank(connectionId);
      setBusyId(null);
      if (!result.ok) setSyncMessage({ id: accountId, text: result.error, error: true });
    });
  }
  const { maskValue } = usePrivacy();
  const baseFormatter = new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency });
  const total = accounts.reduce((sum, a) => sum + a.baseValue, 0);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <span className="text-primary">
            <Landmark className="size-4" />
          </span>
          {t("cash_bank_title")}
          {accounts.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({accounts.length}) · {maskValue(baseFormatter.format(total))}
            </span>
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/banking">{t("banking_open_view")}</Link>
          </Button>
          <BankConnectDialog
            mode={bankSyncMode}
            cashAccounts={accounts.map((a) => ({ id: a.id, name: a.name, isLinked: !!a.bank }))}
          />
          <AddAssetDialog
            categories={categories}
            defaultCategoryName="Cash"
            trigger={
              <Button type="button" variant="outline" size="sm">
                {t("cash_bank_add")}
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cash_bank_empty")}</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {accounts.map((account) => {
              const native = new Intl.NumberFormat(intlLocale, {
                style: "currency",
                currency: account.currency,
              });
              return (
                <li
                  key={account.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/assets/${account.id}`}
                      className="truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {account.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {account.lastDate
                        ? t("cash_bank_last_balance", { date: account.lastDate })
                        : t("cash_bank_no_history")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {(() => {
                        const bank = account.bank;
                        if (!bank) {
                          return <Badge variant="outline">{t("bank_status_manual")}</Badge>;
                        }
                        const expired = bank.connectionStatus === "expired";
                        const failed = bank.lastSyncStatus === "error" || expired;
                        return (
                          <Badge
                            variant={failed ? "destructive" : "outline"}
                            className={cn(!failed && !bank.isSandbox && "border-success text-success")}
                          >
                            {expired
                              ? t("bank_status_expired")
                              : failed
                                ? t("bank_status_error")
                                : bank.isSandbox
                                  ? t("bank_status_sample")
                                  : t("bank_status_synced")}
                          </Badge>
                        );
                      })()}
                      {account.bank && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BankLogoByName name={account.bank.institutionName} className="size-4" />
                          {account.bank.institutionName}
                          {" · "}
                          {formatSyncTime(account.bank.lastSyncedAt, intlLocale)
                            ? t("bank_last_synced", { when: formatSyncTime(account.bank.lastSyncedAt, intlLocale) ?? "" })
                            : t("bank_never_synced")}
                        </span>
                      )}
                    </div>
                    {account.bank?.lastSyncStatus === "error" && account.bank.lastSyncError && (
                      <p className="text-xs text-destructive" role="alert">
                        {account.bank.lastSyncError}
                      </p>
                    )}
                    {syncMessage?.id === account.id && (
                      <p className={syncMessage.error ? "text-xs text-destructive" : "text-xs text-success"} role="alert">
                        {syncMessage.text}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <p className="text-sm font-medium tabular-nums text-foreground">
                        {maskValue(native.format(account.nativeValue))}
                      </p>
                      {account.currency !== baseCurrency && (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {maskValue(baseFormatter.format(account.baseValue))}
                        </p>
                      )}
                    </div>
                    {account.bank && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending && busyId === account.id}
                          onClick={() => handleSync(account.bank!.connectionId, account.id)}
                        >
                          <RefreshCw className={cn("size-4", isPending && busyId === account.id && "animate-spin")} />
                          {t("bank_sync_now")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending && busyId === account.id}
                          onClick={() => handleDisconnect(account.bank!.connectionId, account.id)}
                        >
                          {t("bank_disconnect")}
                        </Button>
                      </>
                    )}
                    <CsvImportDialog
                      assetId={account.id}
                      currentValue={account.nativeValue}
                      currency={account.currency}
                      trigger={
                        <Button type="button" variant="outline" size="sm">
                          <Upload className="size-4" />
                          {t("cash_bank_import_csv")}
                        </Button>
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

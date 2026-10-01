"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Landmark, RefreshCw, Upload } from "lucide-react";
import { BankConnectDialog } from "@/components/bank-connect-dialog";
import { BankLogoByName } from "@/components/institution-logo";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { disconnectBank, syncBankConnection } from "@/app/dashboard/banking/actions";
import { bankByName, type BankSyncMode } from "@/lib/banking/institutions";
import { isBankAccountType, type BankAccountType } from "@/lib/bank-account";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPE_KEYS: Record<BankAccountType, TranslationKey> = {
  checking: "bank_account_type_checking",
  savings: "bank_account_type_savings",
  credit_card: "bank_account_type_credit_card",
  term_deposit: "bank_account_type_term_deposit",
  other: "bank_account_type_other",
};
import { AddBankAccountDialog } from "@/components/add-bank-account-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { Button } from "@/components/ui/button";
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
  /** Bank the account is with, and its kind (set by the Add account dialog or a statement import). */
  institutionName?: string;
  accountType?: string;
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

/** Jurisdiction an account is grouped under: the bank's country when it is a known bank, otherwise "OTHER". */
const COUNTRY_ORDER = ["AE", "FR", "OTHER"] as const;

function accountCountry(account: CashAccount): string {
  const bank = bankByName(account.institutionName ?? "") ?? bankByName(account.bank?.institutionName ?? "");
  return bank?.country ?? "OTHER";
}

/**
 * Dashboard entry point for Cash / bank accounts. Collapsed by default like
 * every other portfolio folder (count + total in the Base Currency on the
 * row); expanded, the accounts are grouped by country (UAE, France, then
 * anything else), each with a subtotal and a per-account "Import CSV" action
 * that opens the same dropzone → column-mapper flow as the asset page's
 * Settings tab. With no accounts yet it offers to create one.
 */
export function CashBankCard({
  accounts,
  baseCurrency,
  bankSyncMode,
}: {
  accounts: CashAccount[];
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
  const [isOpen, setIsOpen] = useState(false);
  const total = accounts.reduce((sum, a) => sum + a.baseValue, 0);

  const byCountry = new Map<string, CashAccount[]>();
  for (const account of accounts) {
    const code = accountCountry(account);
    byCountry.set(code, [...(byCountry.get(code) ?? []), account]);
  }
  const groups = COUNTRY_ORDER.filter((code) => byCountry.has(code)).map((code) => {
    const list = byCountry.get(code) ?? [];
    return {
      code,
      label:
        code === "OTHER"
          ? t("bank_account_type_other")
          : (new Intl.DisplayNames([intlLocale], { type: "region" }).of(code) ?? code),
      accounts: list,
      total: list.reduce((sum, a) => sum + a.baseValue, 0),
    };
  });

  const renderAccount = (account: CashAccount) => {
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
                    <div className="flex items-center gap-2">
                      {account.institutionName && <BankLogoByName name={account.institutionName} />}
                      <Link
                        href={`/dashboard/assets/${account.id}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {account.name}
                      </Link>
                    </div>
                    {(account.institutionName || account.accountType) && (
                      <p className="text-xs text-muted-foreground">
                        {[account.institutionName, isBankAccountType(account.accountType) ? t(ACCOUNT_TYPE_KEYS[account.accountType]) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
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
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-primary">
            <Landmark className="size-4" />
          </span>
          <span className="truncate font-medium text-foreground">{t("cash_bank_title")}</span>
          <span className="shrink-0 text-xs text-muted-foreground">({accounts.length})</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {maskValue(baseFormatter.format(total))}
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/banking">{t("banking_open_view")}</Link>
            </Button>
            <BankConnectDialog
              mode={bankSyncMode}
              cashAccounts={accounts.map((a) => ({ id: a.id, name: a.name, isLinked: !!a.bank }))}
            />
            <AddBankAccountDialog />
          </div>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cash_bank_empty")}</p>
          ) : (
            groups.map((group) => (
              <section key={group.code} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {group.label}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">({group.accounts.length})</span>
                  </h3>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {maskValue(baseFormatter.format(group.total))}
                  </span>
                </div>
                <ul className="divide-y divide-border border border-border">
                  {group.accounts.map(renderAccount)}
                </ul>
              </section>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
